import type { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';

/**
 * Liveness/readiness probes. In this milestone there is no database yet, so the
 * probe validates configuration presence. Database connectivity will be added
 * with Phase 2; Omada connectivity is checked live via the dedicated
 * connectivity-test route.
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
        database: 'not-available', // Phase 2
      },
      time: new Date().toISOString(),
    };
  });
}