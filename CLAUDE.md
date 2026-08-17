# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A commercial Wi-Fi hotspot / mobile-money voucher platform. Customers connect to Wi-Fi, get
redirected to a captive portal, buy a data package (500/1000/6000/16000 TZS), pay by mobile
money, and are auto-authenticated onto the network via TP-Link Omada Controller vouchers.
Everything is intended to eventually run locally on a Raspberry Pi behind a TP-Link ER605/EAP225,
with the Omada Controller in Docker.

The active code lives entirely under `Backend/` (Fastify API). `Captive Portal/` is a static
HTML/CSS/JS template only — it is not yet wired to the backend. The root `Readme` file is the
original project brief (architecture goals, hardware, roles, security requirements, SaaS
roadmap) — read it for *why* decisions were made, not for current implementation status; treat
`Backend/README.md` and `Backend/docs/ARCHITECTURE.md` as the source of truth for what's built.

## Commands

All commands run from `Backend/`:

```bash
npm install
cp .env.example .env        # fill in real OMADA_* values (and DATABASE_URL for Phase 2 features)

npm run dev                 # dev server (tsx watch), listens on :3000
npm run build && npm start  # production-style build + run

npm test                    # vitest run (mock Omada HTTP server, no real controller needed)
npm run test:watch

npm run omada:connect       # live connectivity test against a REAL Omada controller

npm run db:generate         # prisma generate
npm run db:deploy           # apply prisma/migrations to DATABASE_URL
npm run db:seed             # idempotent seed of the 4 default TZS packages
npm run db:studio
```

Run a single test file: `npx vitest run tests/omada-client.test.ts`.
Run a single test by name: `npx vitest run -t "test name substring"`.

Docker (from repo root, builds/runs backend + postgres + omada together on the `hotspot` network):
```bash
docker compose build backend
docker compose up -d
```
On that network the backend must reach Omada by service name (`https://omada:8043`), never by
container IP — this is hard-coded into `docker-compose.yml`'s `backend.environment`.

## Architecture

### Request flow
`src/index.ts` (entrypoint) → `src/app.ts` (`buildApp()`, exported separately from start-up so
tests can build the app without binding a port) → route plugins (`src/routes/*.ts`) → module
services (`src/modules/*/`) → external systems (Omada controller, Postgres via Prisma).

All structured logging goes through the single Pino instance in `src/lib/logger.ts`
(`app.ts` disables Fastify's own logger — `logger: false` — and logs `onRequest`/`onResponse`
manually so redaction and correlation IDs are applied consistently everywhere). Errors are
mapped centrally in `app.ts`'s `setErrorHandler`: throw a typed `AppError` subclass from
`src/lib/errors.ts` (e.g. `OmadaAuthenticationError`, `ValidationError`) anywhere in a route or
service and it becomes a structured `{ error: { code, message } }` response with the right
status code; unhandled errors are logged with full detail but only return a generic message in
production.

Environment is validated once at import time in `src/config/env.ts` (Zod, fail-fast on boot).
`REDACT_KEY_PATTERNS` in that same file drives Pino's redaction — any new secret-bearing field
name should be added there, not hand-redacted at call sites.

### Omada integration (`src/modules/omada/`)

This is the most novel/fragile part of the codebase — treat Omada's API surface as unverified
until confirmed against the actual controller's live OpenAPI doc.

- **`omada.paths.ts`** — the single source of truth for every Omada endpoint path. Comments on
  each entry mark them `VERIFIED` (checked against the running controller's
  `https://{controller}:8043/v3/api-docs`) or pending. **Never hand-write an Omada URL inline —
  add it here first.** Do not invent or assume an endpoint exists across controller versions;
  the currently-targeted version is v5.15.24.19.
- **`omada.http.ts`** (`OmadaHttp`) — low-level HTTP: TLS (self-signed certs are tolerated only
  via explicit `OMADA_TLS_REJECT_UNAUTHORIZED=false`), timeout/abort, and envelope parsing.
  Omada's response envelope is `{ errorCode, msg, result }` (success = `errorCode === 0`); this
  is where that gets unwrapped and mapped to typed errors. A 401 is always surfaced as
  `OmadaAuthenticationError` so the caller layer can retry.
- **`omada.auth.ts`** (`OmadaTokenProvider`) — in-memory token cache with expiry safety margin
  (`OMADA_TOKEN_TTL_SAFETY_S`); never persisted, never logged.
- **`omada.client.ts`** (`OmadaClient`) — the facade services should use. Wraps every
  authenticated call so a 401 triggers exactly one token refresh + retry
  (`authedRequest`/`getToken(force=true)`). `getSites()` doubles as the connectivity-probe
  milestone (auth → token → authenticated GET → success).
- **`*.service.ts`** (site/client/voucher) — one service per Omada resource area, built on top
  of `OmadaClient`. `omada.voucher.service.ts` is intentionally unimplemented until the
  voucher-group create/list/delete request/response schemas are confirmed from the controller's
  live docs — don't guess at that schema.
- `omadacId` is a **path segment** on every authenticated call but a **query parameter** on the
  token endpoint only — this asymmetry is easy to get backwards, see `omada.http.ts`'s
  `buildUrl`/`requestToken`.

Tests exercise this layer against `tests/omada.mock.ts`, a hand-rolled `node:http` server (not a
mocking library) that simulates the token + sites endpoints, including 401-triggered refresh and
error-code paths. Extend that mock's handlers rather than mocking `fetch`/`undici` directly when
adding Omada test coverage.

### Payment / provisioning ordering (not yet implemented, but the schema is built for it)

The Prisma schema (`prisma/schema.prisma`) encodes explicit state machines
(`PaymentStatus`, `VoucherStatus`, `SmsStatus`, `JobStatus`) rather than booleans, because the
required flow is strict:

```
PAYMENT_CREATED → PAYMENT_PENDING → PAYMENT_SUCCESS
  → CREATE_OMADA_VOUCHER   (only after verified SUCCESS)
  → VOUCHER_CREATED → SEND_SMS → COMPLETED
```

A voucher must never be created before payment is verified `SUCCESS` via the payment provider's
own API/webhook (never trust the frontend), and duplicate webhooks must not double-provision —
`Voucher.paymentId` is `@unique` and `Job` has `@@unique([type, entityId])` specifically to
enforce this idempotency. `PortalSession` preserves the Omada-supplied client context (MAC, AP
MAC, SSID, site, redirect URL) so a payment can be tied back to the specific Wi-Fi client that
should receive access, preventing one person paying while another device gets online.

### Catalog (`src/modules/catalog/`)

Simple repository/service split (`package.repository.ts` behind `PrismaPackageRepository`,
`package.service.ts` for business logic) backing `GET /api/packages`. Packages are DB-driven by
design — never hard-code package pricing/duration in frontend or backend route code. If
`DATABASE_URL` isn't set, catalog/`\ready` routes degrade to a clear 503 rather than crashing, so
the Omada-only milestone can run without Postgres.

### Admin auth

There's no RBAC yet. Admin-only routes (e.g. `/api/omada/connectivity-test`) are gated by a
shared-secret header via `requireAdmin` in `src/routes/middleware.ts` (`x-admin-key` must match
`ADMIN_API_KEY`). Treat this as a placeholder, not a pattern to extend — real roles
(super admin / tenant owner / manager) are a stated future requirement in the root `Readme`.

## Conventions

- ESM throughout (`"type": "module"`), NodeNext resolution — internal relative imports must use
  explicit `.js` extensions even though the source is `.ts` (e.g. `import { env } from
  './config/env.js'`).
- Strict TypeScript (`strict: true`); no `any`-by-default patterns in existing code.
- New Omada-facing code must go through `OmadaClient`/`OMADA_PATHS`, not raw `fetch`.
- New error types belong in `src/lib/errors.ts` as an `AppError` subclass with a stable `code`
  and correct `statusCode` — don't throw plain `Error`/raw HTTP status codes from routes.
- Never log secrets directly; add new secret field names to `REDACT_KEY_PATTERNS` in
  `src/config/env.ts` instead of manually stripping them at the call site.
