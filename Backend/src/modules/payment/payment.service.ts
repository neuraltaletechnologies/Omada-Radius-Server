import { randomUUID } from 'node:crypto';
import type { Payment, PaymentStatus, PortalSession } from '@prisma/client';
import type { Logger } from '../../lib/logger.js';
import { ValidationError } from '../../lib/errors.js';
import { normalizeTzPhone } from '../../lib/phone.js';
import { normalizeMac } from '../../lib/mac.js';
import { env } from '../../config/env.js';
import type { PackageRepository } from '../catalog/package.repository.js';
import type { CustomerRepository } from '../customer/customer.repository.js';
import type { PaymentRepository } from './payment.repository.js';
import type { PortalSessionRepository } from '../portal/portal-session.repository.js';
import type { PaymentProvider } from './payment.types.js';

export interface CreatePaymentInput {
  packageId: string;
  phoneNumber: string;
  clientMac: string;
  apMac?: string;
  ssid?: string;
  siteId?: string;
  redirectUrl?: string;
}

export interface CreatePaymentResult {
  paymentId: string;
  status: PaymentStatus;
  portalSessionId: string;
}

/**
 * Orchestrates payment creation (spec section 9): validate -> normalise ->
 * create the PENDING transaction -> push request to the provider. The
 * backend NEVER marks a payment SUCCESS from this response alone - only the
 * independently-verified webhook (payment.webhook.service.ts) may do that.
 */
export class PaymentService {
  constructor(
    private readonly packages: PackageRepository,
    private readonly customers: CustomerRepository,
    private readonly payments: PaymentRepository,
    private readonly portalSessions: PortalSessionRepository,
    private readonly provider: PaymentProvider,
    private readonly logger: Logger,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const normalizedPhone = normalizeTzPhone(input.phoneNumber);
    if (!normalizedPhone) {
      throw new ValidationError('Invalid Tanzanian mobile number', { phoneNumber: input.phoneNumber });
    }
    const mac = normalizeMac(input.clientMac);
    if (!mac) {
      throw new ValidationError('Invalid client MAC address', { clientMac: input.clientMac });
    }

    const pkg = await this.packages.findById(input.packageId);
    if (!pkg || !pkg.active) {
      throw new ValidationError('Unknown or inactive package', { packageId: input.packageId });
    }

    const customer = await this.customers.upsertByNormalizedPhone(input.phoneNumber, normalizedPhone);

    // Duplicate-payment prevention (spec section 22 / test item 4): reuse an
    // already in-flight payment for the same customer+package instead of
    // stacking a second mobile-money push.
    const active = await this.payments.findActiveForCustomerAndPackage(customer.id, pkg.id);
    if (active) {
      const session =
        (await this.portalSessions.findByPaymentId(active.id)) ?? (await this.linkSession(mac, input, active, customer.id));
      this.logger.info(
        { event: 'payment.duplicate_prevented', paymentId: active.id },
        'Reusing existing in-flight payment instead of creating a duplicate',
      );
      return { paymentId: active.id, status: active.status, portalSessionId: session.id };
    }

    const transactionReference = `TXN-${randomUUID()}`;
    const payment = await this.payments.create({
      transactionReference,
      customerId: customer.id,
      packageId: pkg.id,
      amount: pkg.price,
      currency: pkg.currency,
      phoneNumber: normalizedPhone,
      provider: this.provider.name,
    });

    const session = await this.linkSession(mac, input, payment, customer.id);

    const pushResult = await this.provider.createPaymentRequest({
      transactionReference,
      amount: pkg.price,
      currency: pkg.currency,
      phoneNumber: normalizedPhone,
      callbackUrl: env.PAYMENT_CALLBACK_URL,
      description: `${pkg.name} Internet package`,
    });

    // Never SUCCESS here, even if the provider's synchronous response claims
    // it - only a verified webhook may set SUCCESS (spec section 7 & 20).
    const status: PaymentStatus = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(pushResult.status)
      ? (pushResult.status as PaymentStatus)
      : 'PENDING';

    const updated = await this.payments.update(payment.id, {
      providerTransactionId: pushResult.providerTransactionId ?? null,
      status,
      ...(status !== 'PENDING' ? { failureReason: `push_request_${pushResult.status.toLowerCase()}` } : {}),
    });

    this.logger.info(
      {
        event: 'payment.created',
        paymentId: payment.id,
        transactionReference,
        amount: pkg.price,
        currency: pkg.currency,
      },
      'Payment created and mobile-money push request sent',
    );

    return { paymentId: updated.id, status: updated.status, portalSessionId: session.id };
  }

  private async linkSession(
    mac: string,
    input: CreatePaymentInput,
    payment: Payment,
    customerId: string,
  ): Promise<PortalSession> {
    const existing = await this.portalSessions.findOpenByClientMac(mac);
    const session =
      existing ??
      (await this.portalSessions.create({
        clientMac: mac,
        apMac: input.apMac,
        ssid: input.ssid,
        siteId: input.siteId,
        omadaRedirectUrl: input.redirectUrl,
      }));
    return this.portalSessions.attachPayment(session.id, payment.id, customerId);
  }
}
