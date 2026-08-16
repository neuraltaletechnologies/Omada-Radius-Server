import type { Logger } from '../../lib/logger.js';
import { VoucherCreationError } from '../../lib/errors.js';
import type { OmadaClient } from './omada.client.js';
import { OMADA_PATHS } from './omada.paths.js';
import type {
  CreateVoucherGroupRequest,
  OmadaGrid,
  OmadaRateLimit,
  OmadaSimpleVoucher,
  OmadaVoucher,
  OmadaVoucherGroup,
} from './omada.types.js';

export interface CreateVoucherInput {
  /** Package duration in SECONDS (converted to minutes for the Omada API). */
  durationSeconds: number;
  /** Optional downlink speed limit (Kbps). */
  downLimit?: number | null;
  /** Optional uplink speed limit (Kbps). */
  upLimit?: number | null;
  /** Optional currency short code, e.g. "TZS". */
  currency?: string;
  /** Optional per-voucher price (TZS). */
  unitPrice?: number;
}

export interface CreatedVoucher {
  groupId: string;
  voucherId: string;
  voucherCode: string;
  durationMinutes: number;
}

/**
 * OmadaVoucherService
 *
 * Installation is grounded in the installed controller's OpenAPI (v5.15.24.19).
 * Omada models vouchers via VOUCHER GROUPS: creating a group with `amount`
 * generates that many vouchers; a single-voucher group is used to issue one
 * voucher per (verified) payment.
 *
 * VERIFIED endpoints (paths in omada.paths.ts):
 *   POST   .../sites/{siteId}/hotspot/voucher-groups            create (amount=N)
 *   GET    .../sites/{siteId}/hotspot/voucher-groups            list groups
 *   GET    .../sites/{siteId}/hotspot/voucher-groups/{groupId}  group detail + generated vouchers
 *   DELETE .../sites/{siteId}/hotspot/voucher-groups/{groupId}  delete group
 *   GET    .../sites/{siteId}/hotspot/vouchers/{id}             get one voucher
 *   DELETE .../sites/{siteId}/hotspot/vouchers/{id}             delete one voucher
 *
 * IMPORTANT: voucher provisioning MUST only run after a payment has been
 * independently verified as SUCCESS (enforced by the calling orchestration).
 */
export class OmadaVoucherService {
  constructor(
    private readonly client: OmadaClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Create exactly ONE voucher for a purchased package.
   *  1) Creates a voucher group with amount=1 (duration in minutes).
   *  2) Reads the group detail to obtain the generated voucher's id + code.
   */
  async createVoucher(siteId: string, input: CreateVoucherInput): Promise<CreatedVoucher> {
    const durationMinutes = Math.max(1, Math.round(input.durationSeconds / 60));
    const request = buildCreateVoucherRequest(input, durationMinutes);

    const path = OMADA_PATHS.voucherGroups(this.client.cfg.omadaId, siteId);
    const created = await this.client.request<{ id: string }>(path, {
      method: 'POST',
      json: request,
    });

    const groupId = created?.id;
    if (!groupId) {
      throw new VoucherCreationError(
        'Omada create-voucher did not return a groupId',
        { omadaPayload: 'created-id-missing' },
      );
    }

    this.logger.info(
      { event: 'omada.voucher.group.created', groupId, durationMinutes, siteId },
      'Created Omada voucher group',
    );

    // The generated voucher(s) are read back from the group detail.
    const voucher = await this.readFirstGeneratedVoucher(siteId, groupId);
    return {
      groupId,
      voucherId: voucher.id ?? '',
      voucherCode: voucher.code ?? '',
      durationMinutes,
    };
  }

  async getVoucher(siteId: string, voucherId: string): Promise<OmadaVoucher> {
    const path = OMADA_PATHS.vouchers(this.client.cfg.omadaId, siteId, voucherId);
    return this.client.request<OmadaVoucher>(path, { method: 'GET' });
  }

  async deleteVoucher(siteId: string, voucherId: string): Promise<void> {
    const path = OMADA_PATHS.vouchers(this.client.cfg.omadaId, siteId, voucherId);
    await this.client.request<unknown>(path, { method: 'DELETE' });
    this.logger.info(
      { event: 'omada.voucher.deleted', voucherId, siteId },
      'Deleted Omada voucher',
    );
  }

  async listVoucherGroups(siteId: string): Promise<OmadaVoucherGroup[]> {
    const path = OMADA_PATHS.voucherGroups(this.client.cfg.omadaId, siteId);
    const grid = await this.client.request<OmadaGrid<OmadaVoucherGroup>>(path, {
      method: 'GET',
    });
    return grid?.data ?? [];
  }

  async getVoucherGroup(siteId: string, groupId: string): Promise<OmadaVoucherGroup> {
    const path = OMADA_PATHS.voucherGroup(this.client.cfg.omadaId, siteId, groupId);
    return this.client.request<OmadaVoucherGroup>(path, { method: 'GET' });
  }

  async deleteVoucherGroup(siteId: string, groupId: string): Promise<void> {
    const path = OMADA_PATHS.voucherGroup(this.client.cfg.omadaId, siteId, groupId);
    await this.client.request<unknown>(path, { method: 'DELETE' });
    this.logger.info(
      { event: 'omada.voucher.group.deleted', groupId, siteId },
      'Deleted Omada voucher group',
    );
  }

  /** Read a generated voucher from a group, polling briefly for consistency. */
  private async readFirstGeneratedVoucher(
    siteId: string,
    groupId: string,
    attempts = 4,
    delayMs = 500,
  ): Promise<OmadaSimpleVoucher> {
    let vouchers: OmadaSimpleVoucher[] = [];
    for (let i = 0; i < attempts; i++) {
      const group = await this.getVoucherGroup(siteId, groupId);
      vouchers = group?.data ?? [];
      if (vouchers.length > 0) break;
      await sleep(delayMs);
    }

    const first = vouchers[0];
    if (!first?.id || !first?.code) {
      throw new VoucherCreationError(
        'Created voucher group did not expose a generated voucher',
        { groupId, siteId },
      );
    }
    return first;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the authoritative `CreateVoucherGroupOpenApiVO` request body.
 * Requires: name, amount, codeLength, codeForm, limitType, durationType,
 * duration (MINUTES), timingType, rateLimit, trafficLimitEnable, applyToAllPortals.
 */
export function buildCreateVoucherRequest(
  input: CreateVoucherInput,
  durationMinutes: number,
): CreateVoucherGroupRequest {
  const downLimit = input.downLimit ?? 0;
  const upLimit = input.upLimit ?? 0;

  const rateLimit: OmadaRateLimit = {
    mode: 0, // customRateLimit
    customRateLimit: {
      downLimitEnable: downLimit > 0,
      upLimitEnable: upLimit > 0,
      ...(downLimit > 0 ? { downLimit } : {}),
      ...(upLimit > 0 ? { upLimit } : {}),
    },
  };

  return {
    // Voucher group name (1-32 chars) - unique-ish, time-based.
    name: `W2 ${Date.now().toString(36).slice(-7)}`,
    amount: 1,
    codeLength: 8,
    codeForm: [0], // numeric codes are easier for customers to type
    limitType: 2, // unlimited usage counts / online users
    durationType: 1, // Voucher duration: expires after `duration` from use
    duration: durationMinutes, // MINUTES
    timingType: 0, // timing by time
    rateLimit,
    trafficLimitEnable: false,
    applyToAllPortals: true,
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.unitPrice ? { unitPrice: input.unitPrice } : {}),
  };
}