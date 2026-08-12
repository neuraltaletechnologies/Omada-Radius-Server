import type { Logger } from '../../lib/logger.js';
import { OmadaApiError } from '../../lib/errors.js';
import type { OmadaClient } from './omada.client.js';
import type { OmadaVoucher } from './omada.types.js';

/**
 * OmadaVoucherService
 *
 * NOT IMPLEMENTED - INTENTIONAL.
 *
 * Per the project rule "never invent Omada API endpoints", voucher creation is
 * deliberately deferred until the installed Omada Controller's Online API
 * Documentation is inspected and the exact voucher endpoints + schema are
 * confirmed (the connectivity milestone must succeed first).
 *
 * When implemented this service will expose, backed by `omada.paths.ts`:
 *   - createVoucher(siteId, { durationSeconds, ... })
 *   - getVoucher(siteId, voucherId)
 *   - deleteVoucher(siteId, voucherId)
 *   - listVouchers(siteId)
 *
 * Voucher creation MUST only ever run AFTER a payment has been independently
 * verified as SUCCESS.
 */
export class OmadaVoucherService {
  constructor(
    private readonly client: OmadaClient,
    private readonly logger: Logger,
  ) {}

  createVoucher(_input: unknown): Promise<OmadaVoucher> {
    // Do not invent the request schema. Deferred to next milestone.
    void this.client;
    void this.logger;
    throw new OmadaApiError(
      'OmadaVoucherService.createVoucher is not implemented yet; the voucher API ' +
        'endpoints must be confirmed against the installed controller documentation.',
    );
  }
}