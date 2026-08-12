import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

/**
 * Minimal admin guard using a shared secret header.
 * A proper RBAC/roles system replaces this in a later milestone.
 */
export function requireAdmin(request: FastifyRequest): void {
  if (!env.ADMIN_API_KEY) {
    throw new UnauthorizedError('Admin access is not configured (ADMIN_API_KEY)');
  }
  const supplied = request.headers['x-admin-key'];
  if (typeof supplied !== 'string' || supplied !== env.ADMIN_API_KEY) {
    throw new UnauthorizedError('Invalid or missing admin key');
  }
}