import type { Package } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/** Repository abstraction so services are unit-testable without a database. */
export interface PackageRepository {
  findActive(): Promise<Package[]>;
}

export class PrismaPackageRepository implements PackageRepository {
  constructor(private readonly client: typeof prisma) {}

  async findActive(): Promise<Package[]> {
    return this.client.package.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    });
  }
}