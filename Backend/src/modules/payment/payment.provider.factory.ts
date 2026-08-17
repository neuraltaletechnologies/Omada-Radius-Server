import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { PaymentProviderError } from '../../lib/errors.js';
import type { PaymentProvider } from './payment.types.js';
import { FakePaymentProvider } from './providers/fake-payment.provider.js';
import { ClickPesaProvider } from './providers/clickpesa.provider.js';

let cached: PaymentProvider | undefined;

/** Select the active PaymentProvider from `PAYMENT_PROVIDER`. */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  switch (env.PAYMENT_PROVIDER) {
    case 'fake':
      cached = new FakePaymentProvider(
        env.PAYMENT_WEBHOOK_SECRET ?? env.PAYMENT_API_SECRET ?? 'dev-only-fake-webhook-secret',
        logger,
      );
      return cached;
    case 'clickpesa':
      if (!env.CLICKPESA_CLIENT_ID || !env.CLICKPESA_API_KEY) {
        throw new PaymentProviderError(
          'PAYMENT_PROVIDER=clickpesa but CLICKPESA_CLIENT_ID/CLICKPESA_API_KEY are not set',
        );
      }
      cached = new ClickPesaProvider(
        {
          baseUrl: env.CLICKPESA_BASE_URL,
          clientId: env.CLICKPESA_CLIENT_ID,
          apiKey: env.CLICKPESA_API_KEY,
          checksumSecret: env.CLICKPESA_CHECKSUM_SECRET,
          timeoutMs: env.CLICKPESA_HTTP_TIMEOUT_MS,
        },
        logger,
      );
      return cached;
    case 'manual':
    case 'none':
    default:
      throw new PaymentProviderError(
        `No payment provider configured (PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER}). Set PAYMENT_PROVIDER=fake for development.`,
      );
  }
}

/** Test-only: reset the memoised provider so tests can reconfigure env between runs. */
export function resetPaymentProviderCache(): void {
  cached = undefined;
}
