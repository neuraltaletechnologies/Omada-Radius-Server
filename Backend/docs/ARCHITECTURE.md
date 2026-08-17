# Architecture & Omada API Verification

## Proposed system architecture

```
Customer phone
  |  Wi-Fi
  v
TP-Link EAP225
  |
  v
TP-Link ER605
  |
  v
Omada Controller (Docker)      https://omada:8043  (service name, shared network)
  |  external captive portal redirect
  v
Captive Portal (Next.js, separate repo)   -- before: static HTML template in ./Captive Portal
  |
  v
Backend API (this repo)   [Fastify + PostgreSQL + Pino + Zod]
  |
  +----------------------------+
  |            |               |
  v            v               v
Payment      Omada Open     SMS provider
provider     API (voucher)  (not yet impl.)
  |            |
  +------------+----------------> voucher provisioning -> client auth
  v
verified payment only -> create Omada voucher -> send SMS
```

## Payment / provisioning ordering rule

```
PAYMENT_CREATED -> PAYMENT_PENDING -> PAYMENT_SUCCESS
  -> CREATE_OMADA_VOUCHER  (ONLY after verified SUCCESS)
  -> VOUCHER_CREATED -> SEND_SMS -> COMPLETED
```

The backend must verify payment via the provider API/webhook; it **never trusts the
frontend** to confirm payment, and it **never creates a voucher before the payment is
verified SUCCESS** (with duplicate-webhook / idempotency guards).

## Milestone roadmap

1. ✅ Project setup (TS, Fastify, Docker, Postgres scaffold, env)
2. ✅ Database schema & migrations (Prisma), package seed, catalog API (`/api/packages`, `/ready`)
3. ✅ Omada API client: auth + token + connectivity probe (paths verified against `/v3/api-docs`)
4. ✅ Omada site/client/voucher services (voucher-group schema verified against `omada-openapi.json`)
5. ✅ Fake payment provider (`PAYMENT_PROVIDER=fake`)
6. ✅ Payment state machine + idempotent, signature-verified webhook
7. ✅ Voucher provisioning after verified payment (DB-backed job queue, `OMADA_MODE=mock` for dev)
8. ✅ Fake SMS provider (`SMS_PROVIDER=fake`)
9. ✅ End-to-end simulated purchase (see Backend/README.md "Local end-to-end purchase")
10. External captive portal integration — next (routes exist: `/api/portal/*`; no Next.js portal yet)
11. Real payment provider (ClickPesa is the intended first target - needs ClickPesa's own API docs)
12. Real SMS provider
13. Real Omada authentication flow + portal client auth against a live controller (code exists;
    live verification still blocked per the "Live auth blocker observed" note below)
14. Production Docker Compose

## Omada API verification checklist (do this against the running controller)

Endpoints come from the controller's own Online API Documentation
(`https://{controller}:8043/v3/api-docs`, "Omada Open API" v0.1, Controller **v5.15.24.19**).
Base path: **`/openapi/v1`**. `omadacId` is a PATH segment on authenticated calls
and a QUERY param on the token endpoint.

Verified paths (already reflected in `src/modules/omada/omada.paths.ts`):
- [x] Token: `POST /openapi/v1/oauth2/token?omadacId=...`
      (`grant_type=client_credentials`, `client_id`, `client_secret`)
- [x] Sites listing: `GET /openapi/v1/{omadacId}/sites`
- [x] Site clients: `GET /openapi/v1/{omadacId}/sites/{siteId}/clients`
- [x] Hotspot client auth (external-portal flow): `.../hotspot/clients/{clientMac}/auth` / `unauth`
- [x] Voucher-group model paths: `.../hotspot/voucher-groups` (+ sub-paths), `.../hotspot/vouchers/{id}`
- [ ] Voucher CREATE request schema (how a group/voucher is generated: profile,
      duration/expiry, quantity) — confirm from v3/api-docs before Phase 4
- [ ] Voucher **get**/**list**/**delete** schemas — confirm from v3/api-docs
- [ ] Client **MAC binding** requirements for vouchers — confirm
- [ ] **Site ID** value/style (siteId is a path segment) — path confirmed, confirm values

### Live auth blocker observed
`POST /openapi/v1/oauth2/token?omadacId=b727c2c...` (the OMADA_ID from the old root
`.env`) returns `{"errorCode":-7131,"msg":"Controller ID not exist."}` — the path is
correct, so the **`omadacId` must be the value the Open API application was registered
with** (Settings → Open API → app → Omada ID), which may differ from the controller's
UI omadacId. Resolve `OMADA_ID` accordingly (and confirm the app is enabled), then re-run
`npm run omada:connect`.

Proving the milestone: `npm run omada:connect` (or the admin HTTP route) prints
`authenticated and listed N site(s)`.

## Secrets handling

- All secrets come from environment variables (see `Backend/.env.example`).
- Never commit `.env` (`.gitignore` now covers it; the previously committed root
  `.env` should be removed from history with `git rm --cached .env`).
- The frontend never holds payment/Omada/SMS credentials — they remain server-side.
- Structured logs redact secret keys; phone numbers are treated as personal data.

## Multi-tenancy (future)

The schema is designed to be extensible (Tenant → Sites → Packages → Customers →
Payments → Vouchers). The MVP keeps a single-tenant default; no complex tenancy is
implemented yet, but nothing is hard-coded to one location.