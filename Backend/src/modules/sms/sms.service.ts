import type { SmsMessage } from '@prisma/client';
import type { Logger } from '../../lib/logger.js';
import { SmsProviderError, ValidationError } from '../../lib/errors.js';
import type { PaymentRepository } from '../payment/payment.repository.js';
import type { PackageRepository } from '../catalog/package.repository.js';
import type { VoucherRepository } from '../voucher/voucher.repository.js';
import type { SmsRepository } from './sms.repository.js';
import type { SmsProvider } from './sms.types.js';
import { renderVoucherReadySms } from './sms.templates.js';

/**
 * Sends the "your voucher is ready" SMS - invoked by the SendVoucherSmsJob
 * handler, and ONLY reachable once a voucher has actually reached CREATED
 * (spec section 17: never send this message for a FAILED voucher).
 */
export class SmsService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly packages: PackageRepository,
    private readonly vouchers: VoucherRepository,
    private readonly smsMessages: SmsRepository,
    private readonly provider: SmsProvider,
    private readonly logger: Logger,
  ) {}

  async sendVoucherReadySms(paymentId: string): Promise<SmsMessage> {
    // Idempotent: a duplicate SendVoucherSmsJob (e.g. re-enqueued after a
    // worker crash) must not send the SMS twice.
    const existing = await this.smsMessages.findByPaymentId(paymentId);
    if (existing?.status === 'SENT') return existing;

    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new ValidationError('Payment not found', { paymentId });

    const voucher = await this.vouchers.findByPaymentId(paymentId);
    if (!voucher || voucher.status !== 'CREATED' || !voucher.voucherCode) {
      // Structural enforcement of spec section 17.
      throw new ValidationError('Refusing to send SMS: voucher is not CREATED', {
        paymentId,
        voucherStatus: voucher?.status,
      });
    }

    const pkg = await this.packages.findById(payment.packageId);
    const message = renderVoucherReadySms({
      packageName: pkg?.name ?? 'Internet',
      amount: payment.amount,
      currency: payment.currency,
      voucherCode: voucher.voucherCode,
    });

    const row = existing ?? (await this.smsMessages.create(paymentId, payment.phoneNumber, message, this.provider.name));

    const result = await this.provider.sendSms({ to: payment.phoneNumber, message });
    if (!result.success) {
      await this.smsMessages.markFailed(row.id);
      throw new SmsProviderError('SMS provider reported send failure', { paymentId });
    }

    const sent = await this.smsMessages.markSent(row.id, result.providerMessageId);
    this.logger.info(
      { event: 'sms.voucher.sent', paymentId, smsId: sent.id },
      'Voucher-ready SMS sent',
    );
    return sent;
  }
}
