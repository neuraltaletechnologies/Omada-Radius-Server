import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { SmsProviderError } from '../../lib/errors.js';
import type { SmsProvider } from './sms.types.js';
import { FakeSmsProvider } from './providers/fake-sms.provider.js';

let cached: SmsProvider | undefined;

/**
 * Select the active SmsProvider from `SMS_PROVIDER`. Real adapters (e.g.
 * Beem Africa, Africa's Talking) are intentionally not implemented yet -
 * their send-API shape and delivery-report format must come from that
 * provider's own documentation first.
 */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;

  switch (env.SMS_PROVIDER) {
    case 'fake':
      cached = new FakeSmsProvider(logger);
      return cached;
    case 'manual':
    case 'none':
    default:
      throw new SmsProviderError(
        `No SMS provider configured (SMS_PROVIDER=${env.SMS_PROVIDER}). Set SMS_PROVIDER=fake for development.`,
      );
  }
}

/** Test-only: reset the memoised provider so tests can reconfigure env between runs. */
export function resetSmsProviderCache(): void {
  cached = undefined;
}
