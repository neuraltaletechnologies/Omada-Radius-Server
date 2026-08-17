import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { PrismaVoucherRepository } from '../modules/voucher/voucher.repository.js';

/** Public voucher lookup - the captive portal shows this to the customer as their receipt/backup code. */
export async function voucherRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/vouchers/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    if (!env.DATABASE_URL) throw new ValidationError('Database not configured (DATABASE_URL)');

    const voucher = await new PrismaVoucherRepository(prisma).findById(request.params.id);
    if (!voucher) throw new NotFoundError('Voucher not found');

    return {
      id: voucher.id,
      status: voucher.status,
      voucherCode: voucher.status === 'CREATED' ? voucher.voucherCode : undefined,
      durationSeconds: voucher.durationSeconds,
      createdAt: voucher.createdAt,
      expiresAt: voucher.expiresAt,
    };
  });
}
