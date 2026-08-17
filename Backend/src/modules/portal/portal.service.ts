import type { PortalSession } from '@prisma/client';
import type { Logger } from '../../lib/logger.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import type { PaymentRepository } from '../payment/payment.repository.js';
import type { VoucherRepository } from '../voucher/voucher.repository.js';
import type { PortalSessionRepository } from './portal-session.repository.js';
import type { OmadaClientService } from '../omada/omada.client.service.js';

export interface AuthenticateResult {
  authorized: boolean;
  clientMac: string;
  siteId: string;
}

/**
 * Serves the captive-portal-facing endpoints: reading back a preserved
 * PortalSession (spec section 18) and performing the final "authenticate
 * this client on Omada" step (spec section 19 step 16) once - and only once
 * - a voucher has actually been CREATED for the linked payment.
 */
export class PortalService {
  constructor(
    private readonly sessions: PortalSessionRepository,
    private readonly payments: PaymentRepository,
    private readonly vouchers: VoucherRepository,
    private readonly omadaClients: OmadaClientService,
    private readonly logger: Logger,
  ) {}

  async getSession(id: string): Promise<PortalSession | null> {
    return this.sessions.findById(id);
  }

  async authenticate(paymentId: string): Promise<AuthenticateResult> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new NotFoundError('Payment not found', { paymentId });
    if (payment.status !== 'SUCCESS') {
      throw new ValidationError('Payment has not succeeded yet', { paymentId, status: payment.status });
    }

    const voucher = await this.vouchers.findByPaymentId(paymentId);
    if (!voucher || voucher.status !== 'CREATED') {
      throw new ValidationError('Voucher is not ready yet', {
        paymentId,
        voucherStatus: voucher?.status ?? 'NOT_CREATED',
      });
    }

    const session = await this.sessions.findByPaymentId(paymentId);
    if (!session) throw new NotFoundError('No portal session linked to this payment', { paymentId });

    const siteId = session.siteId ?? env.OMADA_SITE_ID;
    if (!siteId) throw new ValidationError('No Omada site id available for client authentication', { paymentId });

    await this.omadaClients.authorizeClient(siteId, session.clientMac);
    this.logger.info(
      { event: 'portal.client.authenticated', paymentId, clientMac: session.clientMac },
      'Client authenticated on Omada after verified payment',
    );

    return { authorized: true, clientMac: session.clientMac, siteId };
  }
}
