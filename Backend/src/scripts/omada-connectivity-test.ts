/**
 * Omada API connectivity test (CLI).
 *
 * Proves the first milestone end-to-end against a REAL controller:
 *
 *   Backend -> Omada Open API -> Authentication -> Access Token
 *     -> Simple authenticated request (list sites) -> SUCCESS
 *
 * Usage:  npm run omada:connect
 *
 * Configure OMADA_* variables in Backend/.env (see .env.example).
 * Prerequisite: DB access is NOT required for this milestone.
 */
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { OmadaClient } from '../modules/omada/omada.client.js';

async function main(): Promise<void> {
  logger.info(
    {
      event: 'omada.connect.start',
      baseUrl: env.OMADA_BASE_URL,
      mode: env.OMADA_MODE,
    },
    'Starting Omada connectivity test',
  );

  const client = new OmadaClient(
    {
      baseUrl: env.OMADA_BASE_URL,
      clientId: env.OMADA_CLIENT_ID,
      clientSecret: env.OMADA_CLIENT_SECRET,
      omadaId: env.OMADA_ID,
      siteId: env.OMADA_SITE_ID || undefined,
      timeoutMs: env.OMADA_HTTP_TIMEOUT_MS,
      tokenTtlSafetySeconds: env.OMADA_TOKEN_TTL_SAFETY_S,
      tlsRejectUnauthorized: env.OMADA_TLS_REJECT_UNAUTHORIZED,
    },
    logger,
  );

  const started = Date.now();
  const sites = await client.getSites();
  const elapsedMs = Date.now() - started;

  logger.info(
    {
      event: 'omada.connect.success',
      siteCount: sites.length,
      elapsedMs,
      sites: sites.map((s) => ({ id: s.id, name: s.name })),
    },
    'Omada connectivity test SUCCESS',
  );

  logger.info(
    {
      event: 'omada.connect.summary',
      baseUrl: env.OMADA_BASE_URL,
      status: 'SUCCESS',
      siteCount: sites.length,
      elapsedMs,
    },
    // No tokens/secrets are printed here.
    `Omada connectivity OK: authenticated and listed ${sites.length} site(s) in ${elapsedMs}ms`,
  );
}

main().catch((err) => {
  logger.fatal(
    {
      event: 'omada.connect.failure',
      error: err instanceof Error ? err.message : String(err),
    },
    'Omada connectivity test FAILED',
  );
  process.exit(1);
});