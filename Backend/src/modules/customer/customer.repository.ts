import type { Customer } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/** Repository abstraction so services are unit-testable without a database. */
export interface CustomerRepository {
  upsertByNormalizedPhone(phoneNumber: string, normalizedPhoneNumber: string): Promise<Customer>;
  listRecent(limit: number): Promise<Customer[]>;
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly client: typeof prisma) {}

  async upsertByNormalizedPhone(
    phoneNumber: string,
    normalizedPhoneNumber: string,
  ): Promise<Customer> {
    return this.client.customer.upsert({
      where: { normalizedPhoneNumber },
      update: { phoneNumber },
      create: { phoneNumber, normalizedPhoneNumber },
    });
  }

  async listRecent(limit: number): Promise<Customer[]> {
    return this.client.customer.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
