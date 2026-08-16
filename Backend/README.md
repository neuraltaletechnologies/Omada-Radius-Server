# Wi-Fi Business Backend

Backend orchestrator for a commercial Wi-Fi hotspot / mobile-money voucher platform.

**Current status:**
- Phase 1 + 3 ✅ Scaffolding (TypeScript, Fastify v5, Pino, Zod, Vitest, Docker) + Omada Open API connectivity layer
  (endpoints verified against the installed controller v5.15.24.19 OpenAPI at `/v3/api-docs`).
- Phase 2 ✅ Database schema (Prisma/PostgreSQL), migration, seed, package catalog API.

Payment, SMS, voucher provisioning and the captive-portal integration are **later milestones**.
Voucher **schemas** must be confirmed from `/v3/api-docs` before Phase 4.

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

Runs the Vitest suite with a **mock** Omada HTTP server (no real controller needed):
- env validation
- Omada auth + connectivity (the milestone)
- token caching
- 401 → auto token refresh
- invalid-credential error typing
- API error typing
- secret redaction in logs

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
- Base path: `/openapi/v1`
- Token: `POST /openapi/v1/oauth2/token?omadacId={omadaId}` (OAuth2 client-credentials)
- Sites: `GET /openapi/v1/{omadacId}/sites`
- Site clients: `GET /openapi/v1/{omadacId}/sites/{siteId}/clients`
- Hotspot client auth (external-portal flow): `.../hotspot/clients/{clientMac}/auth`
- Vouchers use the **voucher-group** model: `.../hotspot/voucher-groups` (+ sub-paths)

> Note: `omadacId` is a **PATH** segment on authenticated calls and a **QUERY** param
> on the token endpoint.

### Current live-verification blocker
When authenticating, the controller answered the token endpoint with
`{"errorCode":-7131,"msg":"Controller ID not exist."}` for the `OMADA_ID`
(`b727c2c...`) recorded in the old root `.env`. The endpoint path is correct
(confirmed), so the blocker is that the **`omadacId` value must be the one the Open API
application was registered with**, which can differ from the controller's UI omadacId.

To complete the milestone (`npm run omada:connect` → `authenticated and listed N site(s)`):
1. Open the controller UI → **Settings → Open API**.
2. Select the **WiFi Business Backend** app; copy the exact **Omada ID** shown there
   into `OMADA_ID` (and confirm the Client ID/Secret match).
3. Ensure the Open API feature/app is **enabled**.
4. Re-run `npm run omada:connect`.

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
