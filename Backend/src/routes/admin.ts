import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ValidationError } from '../lib/errors.js';
import { PrismaPaymentRepository } from '../modules/payment/payment.repository.js';
import { PrismaVoucherRepository } from '../modules/voucher/voucher.repository.js';
import { PrismaCustomerRepository } from '../modules/customer/customer.repository.js';
import { PrismaPackageRepository } from '../modules/catalog/package.repository.js';
import { requireAdmin } from './middleware.js';

const LIST_LIMIT = 100;

/**
 * Minimal read-only admin listings (spec section 24/35). Gated by the same
 * shared-secret `requireAdmin` guard as the Omada connectivity test - a
 * placeholder until real RBAC (spec section 21) exists.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request) => requireAdmin(request));

  function requireDatabase(): void {
    if (!env.DATABASE_URL) throw new ValidationError('Database not configured (DATABASE_URL)');
  }

  app.get('/api/admin/payments', async () => {
    requireDatabase();
    const payments = await new PrismaPaymentRepository(prisma).listRecent(LIST_LIMIT);
    return { payments };
  });

  app.get('/api/admin/vouchers', async () => {
    requireDatabase();
    const vouchers = await new PrismaVoucherRepository(prisma).listRecent(LIST_LIMIT);
    return { vouchers };
  });

  app.get('/api/admin/customers', async () => {
    requireDatabase();
    const customers = await new PrismaCustomerRepository(prisma).listRecent(LIST_LIMIT);
    return { customers };
  });

  app.get('/api/admin/packages', async () => {
    requireDatabase();
    const packages = await new PrismaPackageRepository(prisma).listAll();
    return { packages };
  });
}
