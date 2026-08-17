import type { Logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { OmadaClient, type IOmadaClient } from './omada.client.js';
import { MockOmadaClient } from './omada.mock-client.js';
import { createOmadaConfigFromEnv } from './create-omada-config.js';
import type { OmadaConfig } from './omada.types.js';

/**
 * Build the Omada client to use, honouring `OMADA_MODE`:
 *  - 'real' (default, production): talks to the actual controller over HTTPS.
 *  - 'mock': an in-memory simulation (see omada.mock-client.ts) so the full
 *    purchase flow can be exercised without a controller (dev/CI).
 *
 * Every caller (routes, job handlers) should go through this factory instead
 * of constructing `OmadaClient` directly, so `OMADA_MODE` is respected
 * uniformly.
 */
export function createOmadaClient(logger: Logger, cfg: OmadaConfig = createOmadaConfigFromEnv()): IOmadaClient {
  if (env.OMADA_MODE === 'mock') {
    return new MockOmadaClient(cfg, logger);
  }
  return new OmadaClient(cfg, logger);
}
