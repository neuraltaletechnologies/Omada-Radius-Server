import { describe, it, expect } from 'vitest';
import type { Package } from '@prisma/client';
import { INITIAL_PACKAGES } from '../src/modules/catalog/package-catalog.js';
import { PackageService } from '../src/modules/catalog/package.service.js';
import type { PackageRepository } from '../src/modules/catalog/package.repository.js';

function makePackage(partial: Partial<Package>): Package {
  return {
    id: 'p',
    name: 'x',
    price: 500,
    currency: 'TZS',
    durationSeconds: 10800,
    speedLimit: null,
    downloadLimit: null,
    uploadLimit: null,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  };
}

describe('INITIAL_PACKAGES (seed data matches the business spec)', () => {
  it('has exactly the TZS packages and correct durations', () => {
    expect(INITIAL_PACKAGES).toHaveLength(4);
    const byPrice = new Map(INITIAL_PACKAGES.map((p) => [p.price, p]));

    expect(byPrice.get(500)?.durationSeconds).toBe(3 * 3600); // 3 hours
    expect(byPrice.get(1000)?.durationSeconds).toBe(24 * 3600); // 24 hours
    expect(byPrice.get(6000)?.durationSeconds).toBe(7 * 24 * 3600); // 7 days
    expect(byPrice.get(16000)?.durationSeconds).toBe(30 * 24 * 3600); // 30 days
  });

  it('is TZS currency and active', () => {
    for (const p of INITIAL_PACKAGES) {
      expect(p.currency).toBe('TZS');
      expect(p.active).toBe(true);
    }
  });
});

describe('PackageService.listActivePackages', () => {
  it('returns active packages mapped to the public shape (order from repository)', async () => {
    const fakeRepo: PackageRepository = {
      // Prisma findMany({ where: { active: true }, orderBy: { price: 'asc' } })
      findActive: async () =>
        [makePackage({ id: 'p2', name: '3 Hours', price: 500 }), makePackage({ id: 'p1', name: '24 Hours', price: 1000 })],
    };
    const service = new PackageService(fakeRepo);
    const result = await service.listActivePackages();

    expect(result).toHaveLength(2);
    // repository order is preserved by the service (sorted by price asc in repo)
    expect(result[0]).toMatchObject({ id: 'p2', name: '3 Hours', price: 500, currency: 'TZS' });
    // sanitised shape: no active/createdAt/updatedAt leaked to the client
    expect(result[0]).not.toHaveProperty('active');
    expect(result[0]).not.toHaveProperty('createdAt');
  });

  it('returns an empty list when nothing is active', async () => {
    const fakeRepo: PackageRepository = { findActive: async () => [] };
    const service = new PackageService(fakeRepo);
    expect(await service.listActivePackages()).toEqual([]);
  });
});