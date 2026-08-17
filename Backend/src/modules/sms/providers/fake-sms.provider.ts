import { randomUUID } from 'node:crypto';
import type { Logger } from '../../../lib/logger.js';
import type { SendSmsInput, SendSmsResult, SmsProvider } from '../sms.types.js';

/**
 * Development/test SMS provider (spec section 32). Never sends a real
 * message or incurs charges; logs the send (with the message body, since it
 * contains no secrets) and always succeeds so the full send-and-retry path
 * can be tested deterministically. `failNext()` lets tests exercise the
 * retry path (spec sections 15/31 item 11).
 */
export class FakeSmsProvider implements SmsProvider {
  readonly name = 'fake';
  private failNextCount = 0;
  readonly sent: SendSmsInput[] = [];

  constructor(private readonly logger: Logger) {}

  /** Test hook: make the next `n` sendSms calls fail. */
  failNext(n = 1): void {
    this.failNextCount += n;
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    if (this.failNextCount > 0) {
      this.failNextCount -= 1;
      this.logger.warn(
        { event: 'sms.fake.simulated_failure', to: input.to },
        'Fake SMS provider: simulated send failure',
      );
      return { success: false };
    }

    this.sent.push(input);
    const providerMessageId = `fake-sms-${randomUUID()}`;
    this.logger.info(
      { event: 'sms.fake.sent', to: input.to, providerMessageId },
      'Fake SMS provider: simulated send',
    );
    return { success: true, providerMessageId };
  }
}
