import { describe, it, expect, afterEach } from 'vitest';
import { OmadaClient } from '../src/modules/omada/omada.client.js';
import { logger } from '../src/lib/logger.js';
import {
  OmadaAuthenticationError,
  OmadaApiError,
} from '../src/lib/errors.js';
import type { OmadaConfig } from '../src/modules/omada/omada.types.js';
import { startOmadaMock, type OmadaMock } from './omada.mock.js';

function makeConfig(url: string, overrides: Partial<OmadaConfig> = {}): OmadaConfig {
  return {
    baseUrl: url,
    clientId: 'client-1',
    clientSecret: 'secret-1',
    omadaId: 'omada-1',
    timeoutMs: 5000,
    tokenTtlSafetySeconds: 0,
    tlsRejectUnauthorized: false,
    ...overrides,
  };
}

const openMocks: OmadaMock[] = [];
afterEach(async () => {
  await Promise.all(openMocks.splice(0).map((m) => m.close()));
});

describe('OmadaClient authentication & connectivity', () => {
  it('authenticates and performs a simple authenticated request (milestone)', async () => {
    const mock = await startOmadaMock({
      tokenResponses: [{ accessToken: 'tok-1' }],
      acceptedToken: 'tok-1',
    });
    openMocks.push(mock);

    const client = new OmadaClient(makeConfig(mock.url), logger);
    const sites = await client.getSites();

    expect(sites).toEqual([
      { id: 'site-1', name: 'Main Office' },
      { id: 'site-2', name: 'Branch' },
    ]);
    expect(mock.calls.token).toBe(1);
    expect(mock.calls.sites).toBe(1);
  });

  it('caches the access token across requests', async () => {
    const mock = await startOmadaMock({
      tokenResponses: [{ accessToken: 'tok-1' }],
      acceptedToken: 'tok-1',
    });
    openMocks.push(mock);

    const client = new OmadaClient(makeConfig(mock.url), logger);
    await client.getSites();
    await client.getSites();

    expect(mock.calls.token).toBe(1); // cached
    expect(mock.calls.sites).toBe(2);
  });

  it('auto-refreshes the token once when a request returns 401', async () => {
    const mock = await startOmadaMock({
      // First token is rejected by the sites endpoint; second is accepted.
      tokenResponses: [
        { accessToken: 'tok-1' },
        { accessToken: 'tok-2' },
      ],
      acceptedToken: 'tok-2',
    });
    openMocks.push(mock);

    const client = new OmadaClient(makeConfig(mock.url), logger);
    const sites = await client.getSites();

    expect(sites).toHaveLength(2);
    expect(mock.calls.token).toBe(2); // original + one refresh
  });

  it('raises OmadaAuthenticationError when credentials are invalid', async () => {
    const mock = await startOmadaMock({
      tokenResponses: [{ accessToken: 'tok-1' }],
    });
    openMocks.push(mock);

    const client = new OmadaClient(
      makeConfig(mock.url, { clientSecret: 'wrong-secret' }),
      logger,
    );

    await expect(client.getSites()).rejects.toBeInstanceOf(
      OmadaAuthenticationError,
    );
  });

  it('raises OmadaApiError for non-auth API errors', async () => {
    const mock = await startOmadaMock({
      tokenResponses: [{ code: -1 }],
    });
    openMocks.push(mock);

    const client = new OmadaClient(makeConfig(mock.url), logger);
    await expect(client.getSites()).rejects.toBeInstanceOf(OmadaApiError);
  });

  it('does not leak the client secret in error messages', async () => {
    const mock = await startOmadaMock({
      tokenResponses: [{ accessToken: 'tok-1' }],
    });
    openMocks.push(mock);

    const client = new OmadaClient(
      makeConfig(mock.url, { clientSecret: 'super-secret-abc' }),
      logger,
    );

    try {
      await client.getSites();
    } catch (err) {
      expect(String((err as Error).message)).not.toContain('super-secret-abc');
    }
  });

  it('normalises an envelope that returns { list: [...] }', async () => {
    const mock = await startOmadaMock({
      tokenResponses: [{ accessToken: 'tok-1' }],
      acceptedToken: 'tok-1',
      sitesResult: { list: [{ id: 'site-9', name: 'Wrapped' }] },
    });
    openMocks.push(mock);

    const client = new OmadaClient(makeConfig(mock.url), logger);
    const sites = await client.getSites();
    expect(sites).toEqual([{ id: 'site-9', name: 'Wrapped' }]);
  });
});