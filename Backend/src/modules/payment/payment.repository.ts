import type { Payment, PaymentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface CreatePaymentInput {
  transactionReference: string;
  customerId: string;
  packageId: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  provider: string;
}

export interface UpdatePaymentInput {
  status?: PaymentStatus;
  providerTransactionId?: string | null;
  failureReason?: string | null;
  paidAt?: Date | null;
}

/** Statuses that mean "still in flight" - a new payment attempt should reuse these. */
export const ACTIVE_PAYMENT_STATUSES: PaymentStatus[] = ['CREATED', 'PENDING', 'PROCESSING'];

/** Repository abstraction so payment.service.ts is unit-testable without a database. */
export interface PaymentRepository {
  create(input: CreatePaymentInput): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findByTransactionReference(transactionReference: string): Promise<Payment | null>;
  /** Most recent still-active payment for this customer+package, used for duplicate prevention. */
  findActiveForCustomerAndPackage(customerId: string, packageId: string): Promise<Payment | null>;
  update(id: string, input: UpdatePaymentInput): Promise<Payment>;
  listRecent(limit: number): Promise<Payment[]>;
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly client: typeof prisma) {}

  async create(input: CreatePaymentInput): Promise<Payment> {
    return this.client.payment.create({
      data: {
        transactionReference: input.transactionReference,
        customerId: input.customerId,
        packageId: input.packageId,
        amount: input.amount,
        currency: input.currency,
        phoneNumber: input.phoneNumber,
        provider: input.provider,
        status: 'CREATED',
      },
    });
  }

  async findById(id: string): Promise<Payment | null> {
    return this.client.payment.findUnique({ where: { id } });
  }

  async findByTransactionReference(transactionReference: string): Promise<Payment | null> {
    return this.client.payment.findUnique({ where: { transactionReference } });
  }

  async findActiveForCustomerAndPackage(
    customerId: string,
    packageId: string,
  ): Promise<Payment | null> {
    return this.client.payment.findFirst({
      where: { customerId, packageId, status: { in: ACTIVE_PAYMENT_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, input: UpdatePaymentInput): Promise<Payment> {
    return this.client.payment.update({ where: { id }, data: input });
  }

  async listRecent(limit: number): Promise<Payment[]> {
    return this.client.payment.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
