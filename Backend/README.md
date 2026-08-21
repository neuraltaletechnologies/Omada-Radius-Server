# Wi-Fi Business Backend

Backend orchestrator for a commercial Wi-Fi hotspot / mobile-money voucher platform.

**Current status:**
- Phase 1 ✅ Scaffolding (TypeScript, Fastify v5, Pino, Zod, Vitest, Docker).
- Phase 2 ✅ Database schema (Prisma/PostgreSQL), migration, seed, package catalog API.
- Phase 3 ✅ Omada Open API connectivity layer (auth, token cache/refresh; endpoints verified
  against the installed controller v5.15.24.19 OpenAPI at `/v3/api-docs`, also checked into this
  repo as `omada-openapi.json`).
- Phase 4 ✅ Omada site/client/voucher services, including voucher-group create/get/delete/list.
  The `CreateVoucherGroupOpenApiVO` request shape is verified field-for-field against
  `omada-openapi.json` (see `omada.voucher.service.ts`).
- Phase 5-9 ✅ Fake payment provider, payment state machine + webhook (idempotent, signature-verified),
  DB-backed job queue (`Job` table) driving voucher provisioning + SMS dispatch, fake SMS provider,
  and an end-to-end simulated-purchase path - all runnable without a real controller via
  `OMADA_MODE=mock`, and without real money/SMS via `PAYMENT_PROVIDER=fake` / `SMS_PROVIDER=fake`.
- Phase 10-14 (real payment provider, real SMS provider, real Omada auth in production, external
  captive-portal integration, production Docker Compose) are **not implemented yet**. In
  particular, no real `PaymentProvider`/`SmsProvider` adapter exists - ClickPesa is the intended
  first payment target, but its push-payment/webhook shape must come from ClickPesa's own API
  docs before that adapter can be written (same rule this repo applies to the Omada API: never
  invent a third-party API's shape).

---

## Requirements

- Node.js 20+ (developed on 26)
- npm
- (optional) Docker + Docker Compose for the full stack

## Install & run locally

```bash
cd Backend
npm install
cp .env.example .env        # fill in real OMADA_* values
npm run dev                 # dev (tsx watch)
# or
npm run build && npm start  # production-style
```

Server listens on `http://localhost:3000` (configurable via `PORT`/`HOST`).

## Test

```bash
npm test
```

Runs the Vitest suite against fakes/mocks only - no Postgres or real controller needed:
- env validation
- Omada auth + connectivity (the Phase 3 milestone), token caching, 401 → auto refresh
- voucher-group create/get/delete against `MockOmadaClient` (schema-verified against `omada-openapi.json`)
- phone/MAC normalisation
- full simulated purchase: payment → verified webhook → voucher → SMS (Phase 9)
- idempotency: duplicate webhook, duplicate in-flight payment, re-run voucher provisioning
- failure paths: invalid webhook signature, failed payment, Omada failure after payment, SMS
  failure after voucher creation (with retry)
- HTTP route wiring (health/catalog/payments/vouchers/portal/admin all reachable, Zod errors
  always map to a typed 400, never a raw 500)
- secret redaction in logs

## Local end-to-end purchase (no real money, no real controller)

Set `OMADA_MODE=mock`, `PAYMENT_PROVIDER=fake`, `SMS_PROVIDER=fake` (the `.env.example` defaults
already do this for payment/SMS) and run against a local Postgres:

```bash
docker compose up -d postgres
npm run db:generate && npm run db:deploy && npm run db:seed
npm run dev
```

Then, in another terminal:

```bash
# 1) create a payment (PENDING)
curl -s -X POST http://localhost:3000/api/payments -H 'content-type: application/json' -d '{
  "packageId": "package_3_hours", "phoneNumber": "0712345678",
  "clientMac": "AA:BB:CC:DD:EE:FF", "siteId": "mock-site-1"
}'
# -> { "paymentId": "...", "status": "PENDING", "portalSessionId": "..." }

# 2) simulate the provider calling our webhook (dev-only, requires x-admin-key)
curl -s -X POST http://localhost:3000/api/dev/payments/<paymentId>/simulate \
  -H 'content-type: application/json' -H 'x-admin-key: <ADMIN_API_KEY>' -d '{"status":"SUCCESS"}'

# 3) poll status - the background job worker provisions the voucher and sends the SMS asynchronously
curl -s http://localhost:3000/api/payments/<paymentId>/status
# -> { "paymentStatus": "SUCCESS", "voucherStatus": "CREATED", "smsStatus": "SENT", "voucherCode": "..." }

# 4) authenticate the client on Omada (mock or real, depending on OMADA_MODE)
curl -s -X POST http://localhost:3000/api/portal/authenticate \
  -H 'content-type: application/json' -d '{"paymentId": "<paymentId>"}'
```

`OMADA_MODE=mock` and `PAYMENT_PROVIDER=fake`/`SMS_PROVIDER=fake` are for development only - the
`/api/dev/*` routes refuse to run when `NODE_ENV=production` or a real payment provider is
configured.

## Database (Phase 2)

Schema lives in `prisma/schema.prisma`; the migration is in `prisma/migrations/`.
Requires a running PostgreSQL (include it via `docker compose up -d postgres`).

```bash
# 1) set DATABASE_URL in Backend/.env, e.g. postgresql://postgres:postgres@localhost:5432/wifi_business
# 2) apply migrations + generate the client
npm run db:generate
npm run db:deploy          # apply prisma/migrations to the DB
# 3) seed the initial packages
npm run db:seed            # idempotent 500/1000/6000/16000 TZS packages
```

Verify:

```bash
curl http://localhost:3000/ready        # 200 when DB is reachable
curl http://localhost:3000/api/packages # active packages from the DB
```

Model summary (explicit state enums, no ambiguous booleans):
`Package`, `Customer`, `Payment` (PaymentStatus), `Voucher` (VoucherStatus,
`paymentId` unique ⇒ one voucher per successful payment), `PortalSession`,
`SmsMessage` (SmsStatus), `Job` (JobStatus; DB-backed queue, `@@unique([type, entityId])`
for idempotency).

## Omada connectivity test (the first milestone)

Against a **real** controller (run on the machine where the Omada controller is reachable):

```bash
cp .env.example .env   # set OMADA_BASE_URL, OMADA_CLIENT_ID, OMADA_CLIENT_SECRET, OMADA_ID
npm run omada:connect
```

Expected output on success:

```
Omada connectivity OK: authenticated and listed N site(s) in XXXms
```

Equivalent over HTTP (admin-key protected):

```bash
curl -X POST http://localhost:3000/api/omada/connectivity-test \
  -H 'content-type: application/json' \
  -H 'x-admin-key: <ADMIN_API_KEY>' \
  -d '{}'
```

Health probe:

```bash
curl http://localhost:3000/health
```

## Omada endpoint verification (IMPORTANT)

Endpoints are sourced from the **Online API Documentation of the installed controller**
(`https://{controller}:8043/v3/api-docs`, "Omada Open API" v0.1, Controller **v5.15.24.19**).
All Omada paths live in one file: `src/modules/omada/omada.paths.ts`.

Verified structure:
- Resource base path: `/openapi/v1` (sites, clients, hotspot, vouchers, ...)
- Token: `POST /openapi/authorize/token?grant_type=client_credentials` - **not** under `/openapi/v1`,
  JSON body `{ omadacId, client_id, client_secret }`, auth header on subsequent calls is
  `Authorization: AccessToken=<accessToken>` (**not** the standard `Bearer` scheme). This comes
  from the "Open API Access Guide" embedded in the spec itself
  (`x-openapi.x-setting.homeCustomLocation` in `omada-openapi.json`) - it is not part of the
  regular `paths` listing, which is easy to miss.
- Sites: `GET /openapi/v1/{omadacId}/sites?page=1&pageSize=...` - `page`/`pageSize` are
  **required**; omitting them is an HTTP 400, not an empty list. Response is a grid
  (`{ totalRows, currentPage, currentSize, data: [...] }`); each record's id field is
  `siteId`, not `id`.
- Site clients: `GET /openapi/v1/{omadacId}/sites/{siteId}/clients`
- Hotspot client auth (external-portal flow): `.../hotspot/clients/{clientMac}/auth`
- Vouchers use the **voucher-group** model: `.../hotspot/voucher-groups` (+ sub-paths)

> Note: `omadacId` is a **PATH** segment on every resource call, but goes in the **JSON body**
> on the token endpoint - not a query param, and not the endpoint's own path base.

### Live-verification milestone: ACHIEVED
`npm run omada:connect` now genuinely succeeds against the real controller (auth → access
token → authenticated `GET sites` → real site data returned). Getting here took correcting
three real bugs, not a controller misconfiguration - recorded here so the mistake doesn't
get re-introduced:

1. **Wrong token endpoint.** The code used `POST /openapi/v1/oauth2/token?omadacId=...`
   (form-urlencoded, `Bearer` header) - a plausible-looking but **non-existent** path. It was
   never in the spec's `paths` listing (only found by grepping the raw JSON). The controller's
   `IpAccessRuleFilter` doesn't recognise it either, so instead of a clean 404 it misparses the
   literal path segment `oauth2` as an omadacId and returns a confusing
   `{"errorCode":-7131,"msg":"Controller ID not exist."}` on *every* request to that path,
   regardless of credentials (confirmed by testing with deliberately wrong client_id/secret/
   omadacId - identical error every time). Chasing this as a controller/Cloud-Access issue
   (checked Cloud Access, IP restrictions, app recreation, and even a full controller version
   upgrade with a MongoDB 3.6→8.0 migration) fixed nothing, because none of that was the actual
   cause. The real endpoint, `POST /openapi/authorize/token`, was sitting in the same spec file
   the whole time, documented outside the `paths` object.
2. **`getSites()` silently swallowed HTTP errors.** `parseEnvelope` only checked the Omada
   JSON envelope's `errorCode` field; a raw framework-level error response (e.g. Spring's
   default 400 page for a missing required query param) has no `errorCode` field at all, so
   `(undefined ?? 0) !== 0` was `false` and the error was treated as SUCCESS with an empty
   result. Fixed: any non-2xx HTTP status is now always an error first, envelope-code checking
   second.
3. **Sites listing needs `page`/`pageSize`.** Omitting them isn't "no sites", it's an HTTP 400
   (masked by bug #2 until that was fixed). `OmadaClient.getSites()` now always sends
   `page=1&pageSize=1000`.

The controller version pin (`mbentley/omada-controller:6.2.14.11` in `docker-compose.yml`,
upgraded from a stale `:latest`-drifted `5.15.24.19`) and Cloud Access being linked are both
harmless/good things to have done, but neither was the actual fix.

## Docker

The backend image plus PostgreSQL and (optionally) the Omada controller are wired in the repository-root `docker-compose.yml`. On the shared `hotspot` Docker network the backend reaches Omada by **service name** (`https://omada:8043`), never by container IP.

```bash
cd ..                     # repository root
docker compose build backend
docker compose up -d
```

> Only run `docker compose up` for Omada when your controller data volumes are ready; the `omada` service is unchanged from before.

## Directory layout

```
Backend/
  src/
    app.ts                    # Fastify app builder + error handler + request logging
    index.ts                  # server entrypoint
    config/env.ts             # Zod-validated environment (fail-fast, redact list)
    lib/errors.ts             # typed error classes
    lib/logger.ts             # Pino singleton with secret redaction + correlation id
    modules/omada/            # Omada Open API integration
      omada.types.ts
      omada.paths.ts          # <-- all endpoint paths (verify against controller docs)
      omada.http.ts           # TLS, timeout, envelope parsing, error typing
      omada.auth.ts           # token caching + auto-refresh
      omada.client.ts         # OmadaClient facade
      omada.site.service.ts
      omada.client.service.ts
      omada.voucher.service.ts  # NOT IMPLEMENTED until endpoints verified
      create-omada-config.ts
    routes/health.ts
    routes/omada.ts
    routes/middleware.ts
    scripts/omada-connectivity-test.ts
  tests/                      # Vitest (mock Omada server)
  Dockerfile
  .env.example
```

## Security notes

- Secrets are read from environment variables only (`OMADA_CLIENT_SECRET`, payment/SMS secrets later) and never logged (Pino redaction).
- Environment is validated at boot (Zod); a missing/invalid secret fails fast.
- Admin endpoints are guarded by `x-admin-key` (`ADMIN_API_KEY`) — a placeholder until RBAC.
- The repository-root `.env` (which contained the real client secret) was previously committed. It is now ignored by `.gitignore`. **Remove it from history**:
  ```bash
  git rm --cached .env
  ```
