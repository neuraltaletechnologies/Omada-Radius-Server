/**
 * Database seed: idempotently upsert the initial Internet packages.
 *
 * Usage (after `prisma migrate deploy`):
 *   npx prisma db seed          (or)   npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { INITIAL_PACKAGES } from '../src/modules/catalog/package-catalog.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const pkg of INITIAL_PACKAGES) {
    await prisma.package.upsert({
      where: { id: pkg.id },
      update: {
        name: pkg.name,
        price: pkg.price,
        currency: pkg.currency,
        durationSeconds: pkg.durationSeconds,
        speedLimit: pkg.speedLimit,
        downloadLimit: pkg.downloadLimit,
        uploadLimit: pkg.uploadLimit,
        active: pkg.active,
      },
      create: {
        id: pkg.id,
        name: pkg.name,
        price: pkg.price,
        currency: pkg.currency,
        durationSeconds: pkg.durationSeconds,
        speedLimit: pkg.speedLimit,
        downloadLimit: pkg.downloadLimit,
        uploadLimit: pkg.uploadLimit,
        active: pkg.active,
      },
    });
  }
  console.info(`Seeded ${INITIAL_PACKAGES.length} packages (idempotent).`);
}

main()
  .catch((err) => {
    console.error('Seed failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });