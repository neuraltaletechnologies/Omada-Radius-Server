import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { HttpRequestOptions } from './omada.http.js';
import type { IOmadaClient } from './omada.client.js';
import type {
  CreateVoucherGroupRequest,
  OmadaClientInfo,
  OmadaConfig,
  OmadaGrid,
  OmadaSimpleVoucher,
  OmadaSite,
  OmadaVoucherGroup,
} from './omada.types.js';

/**
 * In-memory stand-in for the Omada Open API, selected by `OMADA_MODE=mock`
 * (see create-omada-client.ts). Lets the whole purchase flow - including
 * voucher provisioning and client authentication - be exercised end-to-end
 * without a real controller (Phase 5-9 / spec section 32).
 *
 * It implements the same narrow surface (`IOmadaClient`) the real
 * `OmadaClient` does, so `OmadaSiteService` / `OmadaClientService` /
 * `OmadaVoucherService` are unaware which one they were given. Route
 * matching below mirrors OMADA_PATHS exactly - no behaviour is invented that
 * isn't already reflected there.
 */
export class MockOmadaClient implements IOmadaClient {
  readonly cfg: OmadaConfig;

  private readonly sites: OmadaSite[] = [{ id: 'mock-site-1', name: 'Mock Site' }];
  private readonly clients = new Map<string, OmadaClientInfo>();
  private readonly authorizedClients = new Set<string>();
  private readonly voucherGroups = new Map<string, OmadaVoucherGroup>();
  private readonly vouchers = new Map<string, OmadaSimpleVoucher & { groupId: string }>();

  constructor(cfg: OmadaConfig, private readonly logger: Logger) {
    this.cfg = cfg;
  }

  async getSites(): Promise<OmadaSite[]> {
    return this.sites;
  }

  async getClients(_siteId: string): Promise<unknown[]> {
    return [...this.clients.values()];
  }

  /** Register (or update) a simulated Wi-Fi client so it can be looked up/authorised. */
  registerClient(client: OmadaClientInfo): void {
    this.clients.set(normalizeMac(client.mac), client);
  }

  isAuthorized(mac: string): boolean {
    return this.authorizedClients.has(normalizeMac(mac));
  }

  async request<T>(path: string, opts: HttpRequestOptions = {}): Promise<T> {
    const method = opts.method ?? 'GET';
    const rest = stripPrefix(path, this.cfg.omadaId);

    this.logger.debug({ event: 'omada.mock.request', method, path: rest }, 'Mock Omada request');

    // --- sites ---------------------------------------------------------
    let m = rest.match(/^\/sites$/);
    if (m && method === 'GET') return this.sites as unknown as T;

    // --- clients ---------------------------------------------------------
    m = rest.match(/^\/sites\/[^/]+\/clients$/);
    if (m && method === 'GET') return [...this.clients.values()] as unknown as T;

    m = rest.match(/^\/sites\/[^/]+\/clients\/([^/]+)$/);
    if (m && method === 'GET') {
      const client = this.clients.get(normalizeMac(decodeURIComponent(m[1])));
      if (!client) throw new NotFoundError('Mock client not found', { mac: m[1] });
      return client as unknown as T;
    }

    m = rest.match(/^\/sites\/[^/]+\/clients\/([^/]+)\/(block|unblock)$/);
    if (m && method === 'POST') return undefined as unknown as T;

    // --- hotspot client auth ---------------------------------------------
    m = rest.match(/^\/sites\/[^/]+\/hotspot\/clients\/([^/]+)\/(auth|unauth)$/);
    if (m && method === 'POST') {
      const mac = normalizeMac(decodeURIComponent(m[1]));
      if (m[2] === 'auth') this.authorizedClients.add(mac);
      else this.authorizedClients.delete(mac);
      this.logger.info(
        { event: `omada.mock.client.${m[2]}`, mac },
        `Mock Omada client ${m[2]}`,
      );
      return undefined as unknown as T;
    }

    // --- voucher groups ----------------------------------------------------
    m = rest.match(/^\/sites\/[^/]+\/hotspot\/voucher-groups$/);
    if (m && method === 'GET') {
      const grid: OmadaGrid<OmadaVoucherGroup> = {
        totalRows: this.voucherGroups.size,
        data: [...this.voucherGroups.values()],
      };
      return grid as unknown as T;
    }
    if (m && method === 'POST') {
      const body = opts.json as CreateVoucherGroupRequest;
      return this.createVoucherGroup(body) as unknown as T;
    }

    m = rest.match(/^\/sites\/[^/]+\/hotspot\/voucher-groups\/([^/]+)$/);
    if (m && method === 'GET') {
      const group = this.voucherGroups.get(m[1]);
      if (!group) throw new NotFoundError('Mock voucher group not found', { groupId: m[1] });
      return group as unknown as T;
    }
    if (m && method === 'DELETE') {
      this.voucherGroups.delete(m[1]);
      return undefined as unknown as T;
    }

    // --- individual vouchers ------------------------------------------------
    m = rest.match(/^\/sites\/[^/]+\/hotspot\/vouchers\/([^/]+)$/);
    if (m && method === 'GET') {
      const voucher = this.vouchers.get(m[1]);
      if (!voucher) throw new NotFoundError('Mock voucher not found', { voucherId: m[1] });
      return voucher as unknown as T;
    }
    if (m && method === 'DELETE') {
      this.vouchers.delete(m[1]);
      return undefined as unknown as T;
    }

    throw new NotFoundError(`Mock Omada route not implemented: ${method} ${rest}`);
  }

  private createVoucherGroup(body: CreateVoucherGroupRequest): { id: string } {
    const groupId = randomUUID();
    const amount = Math.max(1, body.amount ?? 1);
    const generated: OmadaSimpleVoucher[] = [];
    for (let i = 0; i < amount; i++) {
      const voucherId = randomUUID();
      const code = String(Math.floor(Math.random() * 10 ** body.codeLength)).padStart(
        body.codeLength,
        '0',
      );
      const voucher: OmadaSimpleVoucher & { groupId: string } = {
        id: voucherId,
        code,
        status: 0,
        timeLeftSec: body.duration * 60,
        groupId,
      };
      this.vouchers.set(voucherId, voucher);
      generated.push(voucher);
    }

    const group: OmadaVoucherGroup = {
      id: groupId,
      name: body.name,
      createdTime: Date.now(),
      limitType: body.limitType,
      durationType: body.durationType,
      duration: body.duration,
      timingType: body.timingType,
      rateLimit: body.rateLimit,
      trafficLimitEnable: body.trafficLimitEnable,
      applyToAllPortals: body.applyToAllPortals,
      unusedCount: amount,
      usedCount: 0,
      inUseCount: 0,
      totalCount: amount,
      data: generated,
    };
    this.voucherGroups.set(groupId, group);

    this.logger.info(
      { event: 'omada.mock.voucher.group.created', groupId, amount },
      'Mock Omada voucher group created',
    );
    return { id: groupId };
  }
}

function stripPrefix(path: string, omadaId: string): string {
  const prefix = `/openapi/v1/${encodeURIComponent(omadaId)}`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}
