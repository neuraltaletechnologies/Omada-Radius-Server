import { describe, it, expect } from 'vitest';
import { computeClickPesaChecksum } from '../src/modules/payment/providers/clickpesa.checksum.js';
import { ClickPesaProvider } from '../src/modules/payment/providers/clickpesa.provider.js';
import { logger } from '../src/lib/logger.js';

describe('computeClickPesaChecksum', () => {
  it('is deterministic and independent of key order (recursively sorted, compact JSON, HMAC-SHA256)', () => {
    const a = computeClickPesaChecksum({ b: 1, a: { y: 2, x: 1 } }, 'secret');
    const b = computeClickPesaChecksum({ a: { x: 1, y: 2 }, b: 1 }, 'secret');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('excludes checksum/checksumMethod fields from the signed payload', () => {
    const withExtras = computeClickPesaChecksum({ a: 1, checksum: 'ignored', checksumMethod: 'HS256' }, 'secret');
    const without = computeClickPesaChecksum({ a: 1 }, 'secret');
    expect(withExtras).toBe(without);
  });

  it('changes when the secret changes', () => {
    const a = computeClickPesaChecksum({ a: 1 }, 'secret-1');
    const b = computeClickPesaChecksum({ a: 1 }, 'secret-2');
    expect(a).not.toBe(b);
  });
});

describe('ClickPesaProvider.verifyWebhook (no network - pure payload parsing)', () => {
  it('parses a PAYMENT RECEIVED event into SUCCESS with the order reference as our transactionReference', async () => {
    const provider = new ClickPesaProvider(
      { baseUrl: 'https://api.clickpesa.invalid', clientId: 'c', apiKey: 'k', timeoutMs: 1000 },
      logger,
    );
    const body = Buffer.from(
      JSON.stringify({
        event: 'PAYMENT RECEIVED',
        data: { id: 'cp_123', status: 'SUCCESS', orderReference: 'TXN-1', collectedAmount: '500' },
      }),
    );
    const result = await provider.verifyWebhook({ headers: {}, rawBody: body });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('SUCCESS');
    expect(result.transactionReference).toBe('TXN-1');
    expect(result.providerTransactionId).toBe('cp_123');
  });

  it('parses a PAYMENT FAILED event into FAILED', async () => {
    const provider = new ClickPesaProvider(
      { baseUrl: 'https://api.clickpesa.invalid', clientId: 'c', apiKey: 'k', timeoutMs: 1000 },
      logger,
    );
    const body = Buffer.from(
      JSON.stringify({ event: 'PAYMENT FAILED', data: { id: 'cp_124', orderReference: 'TXN-2', message: 'insufficient funds' } }),
    );
    const result = await provider.verifyWebhook({ headers: {}, rawBody: body });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('FAILED');
  });

  it('rejects a webhook with a bad checksum when a checksum secret is configured', async () => {
    const provider = new ClickPesaProvider(
      { baseUrl: 'https://api.clickpesa.invalid', clientId: 'c', apiKey: 'k', checksumSecret: 'shh', timeoutMs: 1000 },
      logger,
    );
    const body = Buffer.from(
      JSON.stringify({
        event: 'PAYMENT RECEIVED',
        data: { id: 'cp_125', status: 'SUCCESS', orderReference: 'TXN-3' },
        checksum: 'not-the-real-checksum',
      }),
    );
    const result = await provider.verifyWebhook({ headers: {}, rawBody: body });
    expect(result.valid).toBe(false);
  });

  it('accepts a webhook with a correct checksum when a checksum secret is configured', async () => {
    const provider = new ClickPesaProvider(
      { baseUrl: 'https://api.clickpesa.invalid', clientId: 'c', apiKey: 'k', checksumSecret: 'shh', timeoutMs: 1000 },
      logger,
    );
    const payload = { event: 'PAYMENT RECEIVED', data: { id: 'cp_126', status: 'SUCCESS', orderReference: 'TXN-4' } };
    const checksum = computeClickPesaChecksum(payload, 'shh');
    const body = Buffer.from(JSON.stringify({ ...payload, checksum }));
    const result = await provider.verifyWebhook({ headers: {}, rawBody: body });
    expect(result.valid).toBe(true);
  });

  it('rejects malformed JSON', async () => {
    const provider = new ClickPesaProvider(
      { baseUrl: 'https://api.clickpesa.invalid', clientId: 'c', apiKey: 'k', timeoutMs: 1000 },
      logger,
    );
    const result = await provider.verifyWebhook({ headers: {}, rawBody: Buffer.from('not json') });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_json');
  });
});
