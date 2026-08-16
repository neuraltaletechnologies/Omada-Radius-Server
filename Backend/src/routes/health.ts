import type { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

/**
 * Liveness/readiness probes.
 *  - /health : process up + config
 *  - /ready  : process up + database connectivity
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'wifi-business-backend',
      version: '0.1.0',
      mode: process.env.NODE_ENV ?? 'development',
      checks: {
        config: 'ok',
        database: process.env.DATABASE_URL ? 'configured' : 'not-configured',
      },
      time: new Date().toISOString(),
    };
  });

  app.get('/ready', async (request, reply) => {
    const databaseOk = await checkDatabase();
    const ok = databaseOk;
    const payload = {
      status: ok ? 'ok' : 'degraded',
      checks: { database: databaseOk ? 'ok' : 'unavailable' },
      time: new Date().toISOString(),
    };
    return reply.status(ok ? 200 : 503).send(payload);
  });
}

async function checkDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.warn(
      { event: 'db.health_check.failed', err: err instanceof Error ? err.message : String(err) },
      'Database health check failed',
    );
    return false;
  }
}