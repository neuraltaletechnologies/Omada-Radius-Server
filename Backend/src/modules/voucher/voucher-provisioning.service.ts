import type { Voucher } from '@prisma/client';
import type { Logger } from '../../lib/logger.js';
import { VoucherCreationError } from '../../lib/errors.js';
import type { PaymentRepository } from '../payment/payment.repository.js';
import type { PackageRepository } from '../catalog/package.repository.js';
import type { PortalSessionRepository } from '../portal/portal-session.repository.js';
import type { VoucherRepository } from './voucher.repository.js';
import type { OmadaVoucherService } from '../omada/omada.voucher.service.js';
import type { JobRepository } from '../jobs/job.repository.js';
import { JOB_TYPES, type SendVoucherSmsPayload } from '../jobs/job.types.js';
import { env } from '../../config/env.js';

/**
 * Provisions exactly one Omada voucher for a payment that has already been
 * independently verified SUCCESS (spec section 7 - the hard rule: a voucher
 * is NEVER created before that). Invoked by the ProvisionVoucherJob handler
 * (job.runner.ts), never directly from the payment webhook, so the webhook
 * itself stays fast (spec section 23).
 */
export class VoucherProvisioningService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly packages: PackageRepository,
    private readonly portalSessions: PortalSessionRepository,
    private readonly vouchers: VoucherRepository,
    private readonly omadaVouchers: OmadaVoucherService,
    private readonly jobs: JobRepository,
    private readonly logger: Logger,
  ) {}

  async provision(paymentId: string): Promise<Voucher> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new VoucherCreationError('Payment not found', { paymentId });
    if (payment.status !== 'SUCCESS') {
      // Structural enforcement of spec section 7: refuse to provision unless
      // payment was independently verified SUCCESS.
      throw new VoucherCreationError('Refusing to provision: payment is not SUCCESS', {
        paymentId,
        status: payment.status,
      });
    }

    const pkg = await this.packages.findById(payment.packageId);
    if (!pkg) throw new VoucherCreationError('Package not found for payment', { paymentId });

    const session = await this.portalSessions.findByPaymentId(paymentId);
    const siteId = session?.siteId ?? env.OMADA_SITE_ID;
    if (!siteId) {
      throw new VoucherCreationError('No Omada site id available for voucher provisioning', {
        paymentId,
      });
    }

    // Idempotent: a duplicate webhook re-enqueuing this job must not create a
    // second voucher. Voucher.paymentId is DB-unique; ensurePending() is a
    // no-op if a row already exists (spec section 22).
    const existing = await this.vouchers.ensurePending(paymentId, pkg.id, pkg.durationSeconds);
    if (existing.status === 'CREATED') {
      this.logger.info(
        { event: 'voucher.provision.already_created', paymentId },
        'Voucher already provisioned for this payment - skipping',
      );
      return existing;
    }

    await this.vouchers.markCreating(paymentId);

    try {
      const created = await this.omadaVouchers.createVoucher(siteId, {
        durationSeconds: pkg.durationSeconds,
        downLimit: pkg.downloadLimit ?? undefined,
        upLimit: pkg.uploadLimit ?? undefined,
        currency: pkg.currency,
        unitPrice: pkg.price,
      });

      const expiresAt = new Date(Date.now() + pkg.durationSeconds * 1000);
      const voucher = await this.vouchers.markCreated(paymentId, {
        omadaVoucherId: created.groupId,
        voucherCode: created.voucherCode,
        expiresAt,
      });

      this.logger.info(
        { event: 'voucher.provision.success', paymentId, voucherId: voucher.id },
        'Voucher provisioned',
      );

      // Only now - voucher confirmed CREATED - is it safe to queue the SMS
      // (spec section 17: never send "voucher ready" before it actually is).
      const payload: SendVoucherSmsPayload = { paymentId };
      await this.jobs.enqueue(JOB_TYPES.SEND_VOUCHER_SMS, paymentId, payload, paymentId);

      return voucher;
    } catch (err) {
      await this.vouchers.markFailed(paymentId);
      this.logger.error(
        {
          event: 'voucher.provision.failed',
          paymentId,
          err: err instanceof Error ? err.message : String(err),
        },
        'Voucher provisioning failed',
      );
      throw err;
    }
  }
}
