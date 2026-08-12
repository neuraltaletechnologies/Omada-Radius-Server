# Wi-Fi Business Backend

Backend orchestrator for a commercial Wi-Fi hotspot / mobile-money voucher platform.

**Current milestone (Phase 1 + Phase 3):**
- Project scaffolding (TypeScript, Fastify v5, Pino, Zod, Vitest, Docker)
- Omada Open API connectivity layer:
  backend → Omada Open API → **auth (OAuth2 client-credentials) → access token → simple authenticated request** → SUCCESS

Payment, SMS, voucher provisioning and the captive-portal integration are **later milestones** (per the roadmap). The only "business" module implemented so far is the Omada client used to prove connectivity. Voucher endpoints are deliberately **not** implemented until verified against the installed controller's API documentation.

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

Server listens on `http://0.0.0.0:3000` (configurable via `PORT`/`HOST`).

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

Per the project rule (never invent Omada API endpoints), only two paths are used right now, both from the documented Omada Open API:

- Token: `POST /api/v1/auth/oauth2/token?omadacId=...` (OAuth2 client-credentials)
- Sites (connectivity probe): `GET /api/v1/sites`

**All Omada paths live in one file:** `src/modules/omada/omada.paths.ts`.

Voucher creation/list/get/delete **must be confirmed** against the **Online API Documentation of the installed controller** before implementing. See `docs/ARCHITECTURE.md` for the exact verification checklist.

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
