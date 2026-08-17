import type { Logger } from '../../lib/logger.js';
import type { IOmadaClient } from './omada.client.js';
import { OMADA_PATHS } from './omada.paths.js';
import type { OmadaClientInfo } from './omada.types.js';

/**
 * Dedicated service for Omada Wi-Fi client (the connecting device) operations.
 * Keeps client-related API calls centralised (all endpoints VERIFIED against
 * the installed controller's OpenAPI).
 */
export class OmadaClientService {
  constructor(
    private readonly client: IOmadaClient,
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

  async getClient(siteId: string, clientMac: string): Promise<OmadaClientInfo> {
    const path = OMADA_PATHS.client(this.client.cfg.omadaId, siteId, clientMac);
    return this.client.request<OmadaClientInfo>(path, { method: 'GET' });
  }

  /** Permanently block a client until unblocked. */
  async blockClient(siteId: string, clientMac: string): Promise<void> {
    const path = OMADA_PATHS.clientBlock(this.client.cfg.omadaId, siteId, clientMac);
    await this.client.request<unknown>(path, { method: 'POST' });
    this.logger.info(
      { event: 'omada.client.blocked', siteId, clientMac },
      'Blocked Omada client',
    );
  }

  /** Unblock a previously blocked client. */
  async unblockClient(siteId: string, clientMac: string): Promise<void> {
    const path = OMADA_PATHS.clientUnblock(this.client.cfg.omadaId, siteId, clientMac);
    await this.client.request<unknown>(path, { method: 'POST' });
    this.logger.info(
      { event: 'omada.client.unblocked', siteId, clientMac },
      'Unblocked Omada client',
    );
  }

  /**
   * Authorise a hotspot client (the external-portal auth step, spec section
   * 19/20). VERIFIED against the controller's OpenAPI: `POST
   * .../hotspot/clients/{clientMac}/auth` takes no request body - only the
   * omadacId/siteId/clientMac path segments.
   */
  async authorizeClient(siteId: string, clientMac: string): Promise<void> {
    const path = OMADA_PATHS.hotspotClientAuth(this.client.cfg.omadaId, siteId, clientMac);
    await this.client.request<unknown>(path, { method: 'POST' });
    this.logger.info(
      { event: 'omada.client.authorized', siteId, clientMac },
      'Authorised Omada hotspot client',
    );
  }
}
