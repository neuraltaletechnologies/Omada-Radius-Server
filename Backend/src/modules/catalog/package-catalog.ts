/**
 * Initial Internet packages. Stored in the database (not hard-coded in the
 * frontend). Used by the seed script (`prisma/seed.ts`) to bootstrap a fresh DB
 * and imported by tests.
 *
 * Durations (Tanzania / TZS):
 *   500 TZS -> 3h (10800s), 1,000 TZS -> 24h (86400s),
 *   6,000 TZS -> 7d (604800s), 16,000 TZS -> 30d (2592000s).
 */
export interface InitialPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationSeconds: number;
  speedLimit?: number | null;
  downloadLimit?: number | null;
  uploadLimit?: number | null;
  active: boolean;
}

export const INITIAL_PACKAGES: InitialPackage[] = [
  {
    id: 'package_3_hours',
    name: '3 Hours',
    price: 500,
    currency: 'TZS',
    durationSeconds: 3 * 60 * 60,
    speedLimit: null,
    downloadLimit: null,
    uploadLimit: null,
    active: true,
  },
  {
    id: 'package_24_hours',
    name: '24 Hours',
    price: 1000,
    currency: 'TZS',
    durationSeconds: 24 * 60 * 60,
    speedLimit: null,
    downloadLimit: null,
    uploadLimit: null,
    active: true,
  },
  {
    id: 'package_7_days',
    name: '7 Days',
    price: 6000,
    currency: 'TZS',
    durationSeconds: 7 * 24 * 60 * 60,
    speedLimit: null,
    downloadLimit: null,
    uploadLimit: null,
    active: true,
  },
  {
    id: 'package_30_days',
    name: '30 Days',
    price: 16000,
    currency: 'TZS',
    durationSeconds: 30 * 24 * 60 * 60,
    speedLimit: null,
    downloadLimit: null,
    uploadLimit: null,
    active: true,
  },
];