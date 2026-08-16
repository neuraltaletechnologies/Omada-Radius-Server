import type { FastifyInstance } from 'fastify';
import { PrismaPackageRepository } from '../modules/catalog/package.repository.js';
import { PackageService } from '../modules/catalog/package.service.js';
import { prisma } from '../lib/prisma.js';

/**
 * Public catalog endpoints. Packages come from the database, never hard-coded
 * in the frontend.
 */
export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  const service = new PackageService(
    new PrismaPackageRepository(prisma),
  );

  app.get('/api/packages', async (request, reply) => {
    // If the DB is not configured/available yet, respond clearly rather than crash.
    if (!process.env.DATABASE_URL) {
      return reply.status(503).send({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database not configured' },
      });
    }
    const packages = await service.listActivePackages();
    return { packages };
  });
}