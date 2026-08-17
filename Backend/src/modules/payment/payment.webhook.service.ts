import type { PaymentStatus } from '@prisma/client';
import type { Logger } from '../../lib/logger.js';
import type { PaymentRepository } from './payment.repository.js';
import type { JobRepository } from '../jobs/job.repository.js';
import { JOB_TYPES, type ProvisionVoucherPayload } from '../jobs/job.types.js';
import type { PaymentProvider, WebhookVerificationInput } from './payment.types.js';

const TERMINAL_STATUSES: PaymentStatus[] = ['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'];

export interface WebhookResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

/**
 * Processes an inbound payment-provider webhook (spec section 10). The
 * webhook handler stays deliberately fast and dumb: verify -> update status
 * -> enqueue provisioning. It never calls Omada or SMS directly (spec
 * section 23), and it is idempotent by construction:
 *  - a payment already in a terminal state is acknowledged but not reprocessed
 *  - even under a race, Job enqueue is itself idempotent (unique[type, entityId]),
 *    so at most one ProvisionVoucherJob is ever created per payment.
 */
export class PaymentWebhookService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly jobs: JobRepository,
    private readonly provider: PaymentProvider,
    private readonly logger: Logger,
  ) {}

  async handle(input: WebhookVerificationInput): Promise<WebhookResult> {
    const verification = await this.provider.verifyWebhook(input);
    if (!verification.valid) {
      this.logger.warn(
        { event: 'payment.webhook.invalid', reason: verification.reason },
        'Rejected webhook: verification failed',
      );
      return {
        httpStatus: 400,
        body: { error: { code: 'INVALID_WEBHOOK', message: 'Webhook verification failed' } },
      };
    }
    if (!verification.transactionReference || !verification.status) {
      return {
        httpStatus: 400,
        body: { error: { code: 'INVALID_WEBHOOK', message: 'Missing transactionReference/status' } },
      };
    }

    const payment = await this.payments.findByTransactionReference(verification.transactionReference);
    if (!payment) {
      this.logger.warn(
        { event: 'payment.webhook.unknown_transaction', transactionReference: verification.transactionReference },
        'Webhook for an unknown transaction reference',
      );
      return { httpStatus: 404, body: { error: { code: 'NOT_FOUND', message: 'Unknown transaction' } } };
    }

    if (TERMINAL_STATUSES.includes(payment.status)) {
      this.logger.info(
        { event: 'payment.webhook.duplicate', paymentId: payment.id, status: payment.status },
        'Duplicate webhook for an already-finalised payment - acknowledged, not reprocessed',
      );
      return { httpStatus: 200, body: { received: true, duplicate: true } };
    }

    const nextStatus = verification.status as PaymentStatus;
    const isSuccess = nextStatus === 'SUCCESS';

    const providerTransactionId = verification.providerTransactionId ?? payment.providerTransactionId ?? undefined;

    // Defense in depth: never take the webhook's word for SUCCESS alone when
    // we can cross-check with the provider's own status API (spec section 8/20).
    if (isSuccess) {
      const statusCheck = await this.provider.checkPaymentStatus(payment.transactionReference);
      if (statusCheck.status !== 'SUCCESS') {
        this.logger.warn(
          {
            event: 'payment.webhook.status_mismatch',
            paymentId: payment.id,
            webhookStatus: nextStatus,
            providerStatus: statusCheck.status,
          },
          'Webhook claimed SUCCESS but the provider status check disagrees - not trusting it',
        );
        return {
          httpStatus: 409,
          body: { error: { code: 'STATUS_MISMATCH', message: 'Provider status check did not confirm SUCCESS' } },
        };
      }
    }

    const updated = await this.payments.update(payment.id, {
      status: nextStatus,
      providerTransactionId: providerTransactionId ?? null,
      paidAt: isSuccess ? new Date() : null,
      failureReason: isSuccess ? null : `webhook_${nextStatus.toLowerCase()}`,
    });

    this.logger.info(
      { event: 'payment.webhook.processed', paymentId: payment.id, status: nextStatus },
      'Payment webhook processed',
    );

    if (isSuccess) {
      // Enqueue only - the webhook response goes out before any Omada/SMS work happens.
      const payload: ProvisionVoucherPayload = { paymentId: updated.id };
      await this.jobs.enqueue(JOB_TYPES.PROVISION_VOUCHER, updated.id, payload, updated.id);
    }

    return { httpStatus: 200, body: { received: true } };
  }
}
