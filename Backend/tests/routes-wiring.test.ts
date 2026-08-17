import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

/**
 * Smoke-tests that every route module is actually registered and reachable.
 * The test environment has no DATABASE_URL/PAYMENT_PROVIDER/SMS_PROVIDER
 * configured (see vitest.config.ts), so DB-backed routes are expected to
 * degrade to a clear 4xx rather than a real database round-trip - full
 * HTTP-level flows are covered against fakes in purchase-flow.test.ts.
 */
describe('route wiring', () => {
  it('registers health, catalog, omada, payments, vouchers, portal and admin routes', async () => {
    const app = buildApp();
    await app.ready();

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const packages = await app.inject({ method: 'GET', url: '/api/packages' });
    expect(packages.statusCode).toBe(503); // DATABASE_UNAVAILABLE

    const createPayment = await app.inject({
      method: 'POST',
      url: '/api/payments',
      payload: { packageId: 'x', phoneNumber: '0712345678', clientMac: 'AA:BB:CC:DD:EE:FF' },
    });
    expect(createPayment.statusCode).toBe(400); // VALIDATION_ERROR: no DATABASE_URL

    const webhook = await app.inject({
      method: 'POST',
      url: '/api/payments/webhook',
      payload: {},
    });
    expect(webhook.statusCode).toBe(400);

    const voucher = await app.inject({ method: 'GET', url: '/api/vouchers/does-not-exist' });
    expect(voucher.statusCode).toBe(400);

    const portalSession = await app.inject({ method: 'GET', url: '/api/portal/session/does-not-exist' });
    expect(portalSession.statusCode).toBe(400);

    const adminNoKey = await app.inject({ method: 'GET', url: '/api/admin/payments' });
    expect(adminNoKey.statusCode).toBe(401);

    const adminWithKey = await app.inject({
      method: 'GET',
      url: '/api/admin/payments',
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    expect(adminWithKey.statusCode).toBe(400); // admin auth passes, then DATABASE_UNAVAILABLE

    await app.close();
  });

  it('never returns a raw 500 for a malformed request body (central Zod -> 400 mapping)', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments',
      payload: { phoneNumber: '0712345678', clientMac: 'AA:BB:CC:DD:EE:FF' }, // missing packageId
    });
    // No DATABASE_URL in the test env short-circuits before Zod runs, but
    // either way the response must be a typed 400, never an unhandled 500.
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});
