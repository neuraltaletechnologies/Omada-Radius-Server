import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Logger } from '../../../lib/logger.js';
import type {
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  PaymentProvider,
  PaymentProviderStatus,
  PaymentStatusResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from '../payment.types.js';

interface FakeTransaction {
  providerTransactionId: string;
  status: PaymentProviderStatus;
}

const SIGNATURE_HEADER = 'x-fake-signature';

/**
 * Development/test payment provider (spec section 32). Simulates a
 * mobile-money push provider closely enough to exercise the real webhook
 * path end to end: `createPaymentRequest` returns PENDING immediately (no
 * money moves, no SMS charges), and a signed webhook is produced on demand
 * via `buildWebhookPayload` - never automatically - so tests/dev tooling
 * control exactly when/how many times "the provider" calls back, including
 * duplicate-webhook idempotency scenarios (spec section 22).
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly transactions = new Map<string, FakeTransaction>();

  constructor(
    private readonly webhookSecret: string,
    private readonly logger: Logger,
  ) {}

  async createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> {
    const providerTransactionId = `fake_${randomUUID()}`;
    this.transactions.set(input.transactionReference, { providerTransactionId, status: 'PENDING' });
    this.logger.info(
      {
        event: 'payment.fake.push_requested',
        providerTransactionId,
        transactionReference: input.transactionReference,
        amount: input.amount,
      },
      'Fake payment provider: simulated mobile-money push sent',
    );
    return { providerTransactionId, status: 'PENDING' };
  }

  async checkPaymentStatus(transactionReference: string): Promise<PaymentStatusResult> {
    const tx = this.transactions.get(transactionReference);
    return { status: tx?.status ?? 'FAILED', providerTransactionId: tx?.providerTransactionId };
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const signature = firstHeader(input.headers[SIGNATURE_HEADER]);
    if (!signature || !this.isValidSignature(input.rawBody, signature)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    let payload: {
      transactionReference?: string;
      providerTransactionId?: string;
      status?: PaymentProviderStatus;
    };
    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      return { valid: false, reason: 'invalid_json' };
    }

    if (!payload.transactionReference || !payload.status) {
      return { valid: false, reason: 'missing_fields' };
    }

    const tx = payload.transactionReference ? this.transactions.get(payload.transactionReference) : undefined;
    if (tx) tx.status = payload.status;

    return {
      valid: true,
      transactionReference: payload.transactionReference,
      providerTransactionId: payload.providerTransactionId,
      status: payload.status,
      raw: payload,
    };
  }

  /**
   * Dev/test-only helper (not part of the `PaymentProvider` interface): build
   * a correctly-signed webhook body+headers, as the real provider would send
   * it. Used by the `/api/dev/payments/:id/simulate` route and by tests.
   */
  buildWebhookPayload(
    transactionReference: string,
    providerTransactionId: string,
    status: PaymentProviderStatus,
  ): { body: Buffer; headers: Record<string, string> } {
    const body = Buffer.from(
      JSON.stringify({ transactionReference, providerTransactionId, status }),
      'utf8',
    );
    const signature = this.sign(body);
    return {
      body,
      headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature },
    };
  }

  private isValidSignature(rawBody: Buffer, signature: string): boolean {
    const expected = this.sign(rawBody);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private sign(rawBody: Buffer): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
