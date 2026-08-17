import type { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';
import { OmadaSiteService } from '../modules/omada/omada.site.service.js';
import { createOmadaConfigFromEnv } from '../modules/omada/create-omada-config.js';
import { createOmadaClient } from '../modules/omada/create-omada-client.js';
import { requireAdmin } from './middleware.js';

/**
 * Live Omada connectivity test.
 *
 * POST /api/omada/connectivity-test   (requires x-admin-key header)
 *
 * Performs: Omada auth -> access token -> simple authenticated request (list
 * sites) -> SUCCESS. This is the "backend -> Omada -> token -> authed request"
 * milestone demonstrated over HTTP. The equivalent CLI is `npm run omada:connect`.
 */
export async function omadaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/omada/connectivity-test', {
    preHandler: async (request) => requireAdmin(request),
  }, async (request, reply) => {
    const started = Date.now();
    const cfg = createOmadaConfigFromEnv();
    const client = createOmadaClient(logger, cfg);
    const siteService = new OmadaSiteService(client, logger);

    try {
      const sites = await siteService.listSites();
      const elapsedMs = Date.now() - started;
      logger.info(
        {
          event: 'omada.connectivity.success',
          siteCount: sites.length,
          elapsedMs,
        },
        'Omada connectivity test SUCCESS',
      );
      return {
        success: true,
        elapsedMs,
        baseUrl: cfg.baseUrl,
        // Deliberately redacted: no tokens, no secrets.
        sites: sites.map((s) => ({ id: s.id, name: s.name })),
      };
    } catch (err) {
      logger.error(
        {
          event: 'omada.connectivity.failure',
          err: err instanceof Error ? err.message : String(err),
        },
        'Omada connectivity test failed',
      );
      throw err;
    }
  });
}