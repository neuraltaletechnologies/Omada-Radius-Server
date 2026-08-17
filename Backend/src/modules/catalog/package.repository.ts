import type { Package } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/** Repository abstraction so services are unit-testable without a database. */
export interface PackageRepository {
  findActive(): Promise<Package[]>;
  findById(id: string): Promise<Package | null>;
  /** Admin listing: every package regardless of active/inactive. */
  listAll(): Promise<Package[]>;
}

export class PrismaPackageRepository implements PackageRepository {
  constructor(private readonly client: typeof prisma) {}

  async findActive(): Promise<Package[]> {
    return this.client.package.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    });
  }

  async findById(id: string): Promise<Package | null> {
    return this.client.package.findUnique({ where: { id } });
  }

  async listAll(): Promise<Package[]> {
    return this.client.package.findMany({ orderBy: { price: 'asc' } });
  }
}