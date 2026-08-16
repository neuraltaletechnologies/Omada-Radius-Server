import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Shared Prisma client. Instantiation is lazy (does not open a connection until
 * the first query), so importing this module is safe even before the DB is up.
 */
export const prisma = new PrismaClient({
  datasources: env.DATABASE_URL
    ? { db: { url: env.DATABASE_URL } }
    : undefined,
  log:
    env.NODE_ENV === 'development'
      ? ['warn', 'error']
      : ['error'],
});