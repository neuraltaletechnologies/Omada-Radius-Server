import type { Logger } from '../../lib/logger.js';
import type { OmadaClient } from './omada.client.js';
import type { OmadaClientInfo } from './omada.types.js';

/**
 * Dedicated service for Omada Wi-Fi client (the connecting device) operations.
 * Keeps client-related API calls centralised. Later this will hold the
 * "authorize client after voucher" flow once the installed controller's portal
 * authentication mechanism is confirmed.
 */
export class OmadaClientService {
  constructor(
    private readonly client: OmadaClient,
    private readonly logger: Logger,
  ) {}

  async listClients(siteId: string): Promise<OmadaClientInfo[]> {
    const clients = (await this.client.getClients(siteId)) as OmadaClientInfo[];
    this.logger.info(
      { event: 'omada.clients.list', siteId, count: clients.length },
      'Listed Omada clients',
    );
    return clients;
  }
}
