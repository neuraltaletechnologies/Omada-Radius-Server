import { describe, it, expect } from 'vitest';
import { logger } from '../src/lib/logger.js';
import { MockOmadaClient } from '../src/modules/omada/omada.mock-client.js';
import { OmadaVoucherService, buildCreateVoucherRequest } from '../src/modules/omada/omada.voucher.service.js';
import type { OmadaConfig } from '../src/modules/omada/omada.types.js';

function makeConfig(): OmadaConfig {
  return {
    baseUrl: 'https://omada.invalid:8043',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    omadaId: 'mock-omada-1',
    timeoutMs: 5000,
    tokenTtlSafetySeconds: 60,
    tlsRejectUnauthorized: false,
  };
}

describe('buildCreateVoucherRequest', () => {
  it('matches the controller-verified CreateVoucherGroupOpenApiVO shape (required fields present)', () => {
    const req = buildCreateVoucherRequest({ durationSeconds: 10800 }, 180);
    expect(req.amount).toBe(1);
    expect(req.duration).toBe(180); // minutes
    expect(req.codeLength).toBeGreaterThanOrEqual(6);
    expect(req.codeLength).toBeLessThanOrEqual(10);
    expect(Array.isArray(req.codeForm)).toBe(true);
    expect(req.rateLimit).toBeDefined();
    expect(req.applyToAllPortals).toBe(true);
    expect(typeof req.trafficLimitEnable).toBe('boolean');
  });
});

describe('OmadaVoucherService against the mock Omada backend (OMADA_MODE=mock)', () => {
  it('creates exactly one voucher for a purchased package and can read it back', async () => {
    const client = new MockOmadaClient(makeConfig(), logger);
    const service = new OmadaVoucherService(client, logger);

    const created = await service.createVoucher('mock-site-1', { durationSeconds: 3 * 60 * 60 });
    expect(created.voucherCode).toHaveLength(8); // default codeLength
    expect(created.durationMinutes).toBe(180);

    const group = await service.getVoucherGroup('mock-site-1', created.groupId);
    expect(group.data).toHaveLength(1);
    expect(group.data?.[0]?.id).toBe(created.voucherId);

    const voucher = await service.getVoucher('mock-site-1', created.voucherId);
    expect(voucher.code).toBe(created.voucherCode);
  });

  it('lists voucher groups and deletes them', async () => {
    const client = new MockOmadaClient(makeConfig(), logger);
    const service = new OmadaVoucherService(client, logger);

    const created = await service.createVoucher('mock-site-1', { durationSeconds: 86400 });
    let groups = await service.listVoucherGroups('mock-site-1');
    expect(groups.map((g) => g.id)).toContain(created.groupId);

    await service.deleteVoucherGroup('mock-site-1', created.groupId);
    groups = await service.listVoucherGroups('mock-site-1');
    expect(groups.map((g) => g.id)).not.toContain(created.groupId);
  });

  it('rounds sub-minute durations up to at least 1 minute', async () => {
    const client = new MockOmadaClient(makeConfig(), logger);
    const service = new OmadaVoucherService(client, logger);
    const created = await service.createVoucher('mock-site-1', { durationSeconds: 30 });
    expect(created.durationMinutes).toBe(1);
  });
});

describe('MockOmadaClient hotspot client authorisation', () => {
  it('authorises and de-authorises a client MAC', async () => {
    const client = new MockOmadaClient(makeConfig(), logger);
    expect(client.isAuthorized('AA-BB-CC-DD-EE-FF')).toBe(false);

    await client.request('/openapi/v1/mock-omada-1/sites/mock-site-1/hotspot/clients/AA-BB-CC-DD-EE-FF/auth', {
      method: 'POST',
    });
    expect(client.isAuthorized('aa-bb-cc-dd-ee-ff')).toBe(true);

    await client.request('/openapi/v1/mock-omada-1/sites/mock-site-1/hotspot/clients/AA-BB-CC-DD-EE-FF/unauth', {
      method: 'POST',
    });
    expect(client.isAuthorized('AA-BB-CC-DD-EE-FF')).toBe(false);
  });
});
