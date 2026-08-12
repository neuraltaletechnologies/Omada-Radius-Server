import type { Logger } from '../../lib/logger.js';
import type { OmadaConfig, OmadaTokenResult } from './omada.types.js';
import type { OmadaHttp } from './omada.http.js';

/**
 * Caches the Omada access token until just before its provider-expiry and
 * transparently re-authenticates when asked for a fresh token.
 *
 * The token itself is held in memory only and is never logged.
 */
export class OmadaTokenProvider {
  private cache: OmadaTokenResult | null = null;

  constructor(
    private readonly cfg: OmadaConfig,
    private readonly http: OmadaHttp,
    private readonly logger: Logger,
  ) {}

  /**
   * Return a cached (still-valid) token or fetch a new one.
   * @param force bypass the cache and always re-authenticate.
   */
  async getToken(force = false): Promise<string> {
    if (
      !force &&
      this.cache &&
      this.cache.expiresAt > Date.now()
    ) {
      return this.cache.accessToken;
    }

    const { accessToken, expiresIn } = await this.http.requestToken();
    const ttlSeconds = Math.max(
      expiresIn - this.cfg.tokenTtlSafetySeconds,
      1,
    );
    const expiresAt = Date.now() + ttlSeconds * 1000;

    this.cache = { accessToken, expiresAt };
    this.logger.info(
      {
        event: 'omada.token.obtained',
        expiresInSeconds: ttlSeconds,
      },
      'Obtained Omada access token',
    );
    return accessToken;
  }

  /** Invalidate the cache (used when an authenticated request returns 401). */
  clear(): void {
    this.cache = null;
  }
}