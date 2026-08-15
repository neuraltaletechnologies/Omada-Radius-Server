import { describe, it, expect } from 'vitest';
import { OMADA_PATHS } from '../src/modules/omada/omada.paths.js';

describe('OMADA_PATHS (verified against installed controller v5.15.x OpenAPI)', () => {
  const omadacId = 'omada-abc';
  const siteId = 'site-1';

  it('token endpoint is under /openapi/v1 and takes omadacId as a query param', () => {
    expect(OMADA_PATHS.token).toBe('/openapi/v1/oauth2/token');
    // omadacId is added as a query param by OmadaHttp.requestToken, not the path.
    expect(OMADA_PATHS.token).not.toContain(omadacId);
  });

  it('sites listing embeds omadacId as a PATH segment', () => {
    expect(OMADA_PATHS.sites(omadacId)).toBe('/openapi/v1/omada-abc/sites');
  });

  it('site clients embeds omadacId + siteId in the path', () => {
    expect(OMADA_PATHS.siteClients(omadacId, siteId)).toBe(
      '/openapi/v1/omada-abc/sites/site-1/clients',
    );
  });

  it('hotspot client auth embeds omadacId, siteId and mac', () => {
    expect(OMADA_PATHS.hotspotClientAuth(omadacId, siteId, 'AA:BB:CC:DD:EE:FF')).toBe(
      '/openapi/v1/omada-abc/sites/site-1/hotspot/clients/AA%3ABB%3ACC%3ADD%3AEE%3AFF/auth',
    );
  });

  it('voucher-group and voucher paths are under hotspot', () => {
    expect(OMADA_PATHS.voucherGroups(omadacId, siteId)).toBe(
      '/openapi/v1/omada-abc/sites/site-1/hotspot/voucher-groups',
    );
    expect(OMADA_PATHS.vouchers(omadacId, siteId, 'v1')).toBe(
      '/openapi/v1/omada-abc/sites/site-1/hotspot/vouchers/v1',
    );
  });

  it('does not invent paths outside the /openapi/v1 base', () => {
    const paths = Object.values(OMADA_PATHS);
    const samples = [OMADA_PATHS.sites('x'), OMADA_PATHS.site('x', 'y')];
    for (const s of samples) expect(s).toMatch(/^\/openapi\/v1\//);
    expect('/' + OMADA_PATHS.token.replace(/^\//, '')).toMatch(/^\/openapi\/v1\//);
    expect(paths.every((p) => typeof p === 'string' || typeof p === 'function')).toBe(true);
  });
});