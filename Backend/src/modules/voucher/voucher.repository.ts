import type { Voucher } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface CreatedVoucherFields {
  omadaVoucherId: string;
  voucherCode: string;
  expiresAt?: Date | null;
}

/** Repository abstraction so voucher-provisioning.service.ts is unit-testable without a database. */
export interface VoucherRepository {
  findByPaymentId(paymentId: string): Promise<Voucher | null>;
  findById(id: string): Promise<Voucher | null>;
  /** Idempotently ensure a NOT_CREATED voucher row exists for this payment (unique on paymentId). */
  ensurePending(paymentId: string, packageId: string, durationSeconds: number): Promise<Voucher>;
  markCreating(paymentId: string): Promise<Voucher>;
  markCreated(paymentId: string, fields: CreatedVoucherFields): Promise<Voucher>;
  markFailed(paymentId: string): Promise<Voucher>;
  listRecent(limit: number): Promise<Voucher[]>;
}

export class PrismaVoucherRepository implements VoucherRepository {
  constructor(private readonly client: typeof prisma) {}

  async findByPaymentId(paymentId: string): Promise<Voucher | null> {
    return this.client.voucher.findUnique({ where: { paymentId } });
  }

  async findById(id: string): Promise<Voucher | null> {
    return this.client.voucher.findUnique({ where: { id } });
  }

  async ensurePending(
    paymentId: string,
    packageId: string,
    durationSeconds: number,
  ): Promise<Voucher> {
    // paymentId is @unique on Voucher: this is the DB-level guarantee that one
    // payment can never end up with two voucher rows, even under concurrent
    // duplicate-webhook delivery (spec section 22).
    return this.client.voucher.upsert({
      where: { paymentId },
      update: {},
      create: { paymentId, packageId, durationSeconds, status: 'NOT_CREATED' },
    });
  }

  async markCreating(paymentId: string): Promise<Voucher> {
    return this.client.voucher.update({ where: { paymentId }, data: { status: 'CREATING' } });
  }

  async markCreated(paymentId: string, fields: CreatedVoucherFields): Promise<Voucher> {
    return this.client.voucher.update({
      where: { paymentId },
      data: {
        status: 'CREATED',
        omadaVoucherId: fields.omadaVoucherId,
        voucherCode: fields.voucherCode,
        expiresAt: fields.expiresAt ?? null,
      },
    });
  }

  async markFailed(paymentId: string): Promise<Voucher> {
    return this.client.voucher.update({ where: { paymentId }, data: { status: 'FAILED' } });
  }

  async listRecent(limit: number): Promise<Voucher[]> {
    return this.client.voucher.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
