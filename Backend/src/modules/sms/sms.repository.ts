import type { SmsMessage } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/** Repository abstraction so sms.service.ts is unit-testable without a database. */
export interface SmsRepository {
  findByPaymentId(paymentId: string): Promise<SmsMessage | null>;
  create(paymentId: string, phoneNumber: string, message: string, provider: string): Promise<SmsMessage>;
  markSent(id: string, providerMessageId: string | undefined): Promise<SmsMessage>;
  markFailed(id: string): Promise<SmsMessage>;
}

export class PrismaSmsRepository implements SmsRepository {
  constructor(private readonly client: typeof prisma) {}

  async findByPaymentId(paymentId: string): Promise<SmsMessage | null> {
    return this.client.smsMessage.findFirst({ where: { paymentId }, orderBy: { createdAt: 'desc' } });
  }

  async create(
    paymentId: string,
    phoneNumber: string,
    message: string,
    provider: string,
  ): Promise<SmsMessage> {
    return this.client.smsMessage.create({
      data: { paymentId, phoneNumber, message, provider, status: 'QUEUED' },
    });
  }

  async markSent(id: string, providerMessageId: string | undefined): Promise<SmsMessage> {
    return this.client.smsMessage.update({
      where: { id },
      data: { status: 'SENT', providerMessageId, sentAt: new Date() },
    });
  }

  async markFailed(id: string): Promise<SmsMessage> {
    return this.client.smsMessage.update({
      where: { id },
      data: { status: 'FAILED', retries: { increment: 1 } },
    });
  }
}
