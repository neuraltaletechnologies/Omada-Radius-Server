import { env } from '../../config/env.js';
import type { OmadaConfig } from './omada.types.js';

/**
 * Builds an OmadaConfig from validated environment variables.
 *
 * When running in Docker Compose on the same network as the Omada container,
 * set OMADA_BASE_URL=https://omada:8043 (service name) instead of a container IP.
 */
export function createOmadaConfigFromEnv(): OmadaConfig {
  return {
    baseUrl: env.OMADA_BASE_URL,
    clientId: env.OMADA_CLIENT_ID,
    clientSecret: env.OMADA_CLIENT_SECRET,
    omadaId: env.OMADA_ID,
    siteId: env.OMADA_SITE_ID || undefined,
    timeoutMs: env.OMADA_HTTP_TIMEOUT_MS,
    tokenTtlSafetySeconds: env.OMADA_TOKEN_TTL_SAFETY_S,
    tlsRejectUnauthorized: env.OMADA_TLS_REJECT_UNAUTHORIZED,
  };
}