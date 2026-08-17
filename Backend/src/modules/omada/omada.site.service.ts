import type { Logger } from '../../lib/logger.js';
import type { OmadaSite } from './omada.types.js';
import type { IOmadaClient } from './omada.client.js';

/**
 * Dedicated Omada site service. Keeps site-related API calls in one place so
 * they are not scattered through the application.
 */
export class OmadaSiteService {
  constructor(
    private readonly client: IOmadaClient,
    private readonly logger: Logger,
  ) {}

  /** List all sites the Open API application can see (VERIFIED endpoint). */
  async listSites(): Promise<OmadaSite[]> {
    const sites = await this.client.getSites();
    this.logger.info(
      { event: 'omada.sites.list', count: sites.length },
      'Listed Omada sites',
    );
    return sites;
  }

  /** Get a single site's detail (VERIFIED endpoint). */
  async getSite(siteId: string): Promise<OmadaSite> {
    const path = this.sitePath(siteId);
    return this.client.request<OmadaSite>(path, { method: 'GET' });
  }

  private sitePath(siteId: string): string {
    return `/openapi/v1/${encodeURIComponent(this.client.cfg.omadaId)}/sites/${encodeURIComponent(siteId)}`;
  }
}
