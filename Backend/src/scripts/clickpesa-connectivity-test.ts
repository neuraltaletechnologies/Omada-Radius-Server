/**
 * ClickPesa credential check (CLI). AUTH ONLY - this deliberately does NOT
 * call initiate-ussd-push-request, so running it never moves real money
 * even if PAYMENT_PROVIDER=clickpesa is pointed at a live (non-sandbox) app.
 *
 * Proves: Backend -> ClickPesa generate-token -> valid JWT -> SUCCESS.
 *
 * Usage:  npm run clickpesa:connect
 * Configure CLICKPESA_* variables in Backend/.env (see .env.example).
 */
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ClickPesaProvider } from '../modules/payment/providers/clickpesa.provider.js';

async function main(): Promise<void> {
  if (!env.CLICKPESA_CLIENT_ID || !env.CLICKPESA_API_KEY) {
    throw new Error('CLICKPESA_CLIENT_ID / CLICKPESA_API_KEY are not set in Backend/.env');
  }

  logger.info(
    { event: 'clickpesa.connect.start', baseUrl: env.CLICKPESA_BASE_URL },
    'Starting ClickPesa credential check (auth only - no payment is initiated)',
  );

  const provider = new ClickPesaProvider(
    {
      baseUrl: env.CLICKPESA_BASE_URL,
      clientId: env.CLICKPESA_CLIENT_ID,
      apiKey: env.CLICKPESA_API_KEY,
      checksumSecret: env.CLICKPESA_CHECKSUM_SECRET,
      timeoutMs: env.CLICKPESA_HTTP_TIMEOUT_MS,
    },
    logger,
  );

  const started = Date.now();
  await provider.verifyCredentials();
  const elapsedMs = Date.now() - started;

  logger.info(
    { event: 'clickpesa.connect.success', elapsedMs },
    `ClickPesa credentials OK: obtained an access token in ${elapsedMs}ms`,
  );
}

main().catch((err) => {
  logger.fatal(
    { event: 'clickpesa.connect.failure', error: err instanceof Error ? err.message : String(err) },
    'ClickPesa credential check FAILED',
  );
  process.exit(1);
});
