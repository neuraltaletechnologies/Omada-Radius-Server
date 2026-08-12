import type { Logger } from '../../lib/logger.js';
import { OmadaAuthenticationError } from '../../lib/errors.js';
import type { OmadaConfig, OmadaSite } from './omada.types.js';
import { OmadaHttp } from './omada.http.js';
import { OmadaTokenProvider } from './omada.auth.js';
import { OMADA_PATHS } from './omada.paths.js';

/**
 * Reusable OmadaClient.
 *
 * Responsibilities (per the architecture):
 *  1. Authenticate against the Omada Open API (OAuth2 client credentials).
 *  2. Obtain + cache the access token (see OmadaTokenProvider).
 *  3. Auto-refresh / re-authenticate when necessary (401 handling).
 *  4. Handle HTTP + typed API errors.
 *  5. Log API failures without exposing secrets.
 *  6. Provide typed methods for required operations.
 *
 * No Omada endpoint path is hard-coded here - see omada.paths.ts.
 */
export class OmadaClient {
  readonly http: OmadaHttp;
  private readonly auth: OmadaTokenProvider;

  constructor(
    readonly cfg: OmadaConfig,
    private readonly logger: Logger,
  ) {
    this.http = new OmadaHttp(cfg, logger);
    this.auth = new OmadaTokenProvider(cfg, this.http, logger);
  }

  /**
   * Run an authenticated request, refreshing the token exactly once if the
   * first attempt is rejected with 401.
   */
  private async authedRequest<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    let token = await this.auth.getToken();
    try {
      return await this.http.request<T>(path, { token, query });
    } catch (err) {
      if (err instanceof OmadaAuthenticationError) {
        this.logger.warn(
          { event: 'omada.token.refresh', path },
          'Omada returned 401 - refreshing token and retrying once',
        );
        this.auth.clear();
        token = await this.auth.getToken(true);
        return this.http.request<T>(path, { token, query });
      }
      throw err;
    }
  }

  /**
   * List sites. Doubles as the "simple authenticated request" connectivity
   * probe: auth -> token -> Bearer-authenticated GET -> SUCCESS.
   */
  async getSites(): Promise<OmadaSite[]> {
    const result = await this.authedRequest<OmadaSite[] | { list: OmadaSite[] }>(
      OMADA_PATHS.sites,
    );
    return this.normalizeList(result);
  }

  /** List clients connected to a given site. */
  async getClients(siteId: string): Promise<unknown[]> {
    const result = await this.authedRequest<unknown[] | { list: unknown[] }>(
      OMADA_PATHS.siteClients(siteId),
    );
    return this.normalizeList(result);
  }

  /** Auth used for tests/tooling; returns the current cached token without logging it. */
  async getRawToken(): Promise<string> {
    return this.auth.getToken();
  }

  /**
   * Omada paginated endpoints sometimes return `{ list: [...] }` and sometimes a
   * bare array depending on controller version. Normalise to an array.
   */
  private normalizeList<T>(value: T[] | { list: T[] } | undefined | null): T[] {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray((value as { list?: T[] }).list)) {
      return (value as { list: T[] }).list;
    }
    return [];
  }
}
