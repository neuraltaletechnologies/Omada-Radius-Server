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
2. **Database schema & migrations** (Prisma) — next
3. ✅ Omada API client: auth + token + connectivity probe
4. Omada site/client/voucher services (voucher endpoints to be verified)
5. Fake payment provider
6. Payment state machine
7. Voucher provisioning after verified payment
8. Fake SMS provider
9. End-to-end simulated purchase
10. External captive portal integration
11. Real payment provider
12. Real SMS provider
13. Real Omada authentication flow + portal client auth
14. Production Docker Compose

## Omada API verification checklist (do this against the running controller)

Before implementing voucher creation, confirm each item against the **Online API
Documentation** exposed by the installed controller (Settings → Open API →
documentation, or the controller's published OpenAPI spec). Record the controller
version too.

- [ ] Controller version: ____________
- [ ] Open API application: `WiFi Business Backend` (Mode: Client) with Client ID / Secret / Omada ID
- [ ] Token endpoint & body (expected `POST /api/v1/auth/oauth2/token?omadacId=...` with
      `grant_type=client_credentials`, `client_id`, `client_secret`) — VERIFY
- [ ] Do authenticated requests need `omadacId` as a query param on every call? — VERIFY
- [ ] Sites listing endpoint for the connectivity probe — VERIFIED here, re-confirm
- [ ] Voucher **create** endpoint + request schema (profile/quota/expiry fields) — PENDING
- [ ] Voucher **list** endpoint + pagination envelope — PENDING
- [ ] Voucher **get** endpoint — PENDING
- [ ] Voucher **delete** endpoint — PENDING
- [ ] Client **authentication endpoint** for the external-portal flow — PENDING
- [ ] Client **MAC binding** requirements for vouchers — PENDING
- [ ] **Site ID** requirements for voucher + client calls — PENDING

Update `src/modules/omada/omada.paths.ts` with confirmed paths. Do **not** guess.

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