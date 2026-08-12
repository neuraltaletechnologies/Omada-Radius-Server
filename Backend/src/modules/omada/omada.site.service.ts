import type { Logger } from '../../lib/logger.js';
import type { OmadaSite } from './omada.types.js';
import type { OmadaClient } from './omada.client.js';

/**
 * Dedicated Omada site service. Keeps site-related API calls in one place so
 * they are not scattered through the application.
 */
export class OmadaSiteService {
  constructor(
    private readonly client: OmadaClient,
    private readonly logger: Logger,
  ) {}

  /** List all sites the Open API application can see. */
  async listSites(): Promise<OmadaSite[]> {
    const sites = await this.client.getSites();
    this.logger.info(
      { event: 'omada.sites.list', count: sites.length },
      'Listed Omada sites',
    );
    return sites;
  }
}
