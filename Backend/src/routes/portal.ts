import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { PrismaPaymentRepository } from '../modules/payment/payment.repository.js';
import { PrismaVoucherRepository } from '../modules/voucher/voucher.repository.js';
import { PrismaPortalSessionRepository } from '../modules/portal/portal-session.repository.js';
import { PortalService } from '../modules/portal/portal.service.js';
import { OmadaClientService } from '../modules/omada/omada.client.service.js';
import { createOmadaClient } from '../modules/omada/create-omada-client.js';

const authenticateSchema = z.object({ paymentId: z.string().min(1) });

/** Captive-portal-facing endpoints: read back the preserved Omada context, then authenticate the client once payment is verified. */
export async function portalRoutes(app: FastifyInstance): Promise<void> {
  function requireDatabase(): void {
    if (!env.DATABASE_URL) throw new ValidationError('Database not configured (DATABASE_URL)');
  }

  function buildService(): PortalService {
    const omadaClient = createOmadaClient(logger);
    return new PortalService(
      new PrismaPortalSessionRepository(prisma),
      new PrismaPaymentRepository(prisma),
      new PrismaVoucherRepository(prisma),
      new OmadaClientService(omadaClient, logger),
      logger,
    );
  }

  app.get('/api/portal/session/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    requireDatabase();
    const session = await buildService().getSession(request.params.id);
    if (!session) throw new NotFoundError('Portal session not found');
    return session;
  });

  app.post('/api/portal/authenticate', async (request) => {
    const body = authenticateSchema.parse(request.body);
    requireDatabase();
    return buildService().authenticate(body.paymentId);
  });
}
