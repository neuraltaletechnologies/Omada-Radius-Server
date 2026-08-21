import type { Logger } from '../../lib/logger.js';
import { OmadaAuthenticationError } from '../../lib/errors.js';
import type { OmadaConfig, OmadaSite } from './omada.types.js';
import type { HttpRequestOptions } from './omada.http.js';
import { OmadaHttp } from './omada.http.js';
import { OmadaTokenProvider } from './omada.auth.js';
import { OMADA_PATHS } from './omada.paths.js';

/** A single raw record from a grid/list endpoint, before we know the exact shape. */
type RawGridRecord = Record<string, unknown>;

/**
 * The surface every Omada module (site/client/voucher services) depends on.
 * `OmadaClient` (real HTTP) and `MockOmadaClient` (in-memory, OMADA_MODE=mock)
 * both implement it, selected by `createOmadaClient()` - services never care
 * which one they were given.
 */
export interface IOmadaClient {
  readonly cfg: OmadaConfig;
  request<T>(path: string, opts?: HttpRequestOptions): Promise<T>;
  getSites(): Promise<OmadaSite[]>;
  getClients(siteId: string): Promise<unknown[]>;
}

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
export class OmadaClient implements IOmadaClient {
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
    opts: HttpRequestOptions = {},
  ): Promise<T> {
    let token = await this.auth.getToken();
    try {
      return await this.http.request<T>(path, { token, ...opts });
    } catch (err) {
      if (err instanceof OmadaAuthenticationError) {
        this.logger.warn(
          { event: 'omada.token.refresh', path },
          'Omada returned 401 - refreshing token and retrying once',
        );
        this.auth.clear();
        token = await this.auth.getToken(true);
        return this.http.request<T>(path, { token, ...opts });
      }
      throw err;
    }
  }

  /**
   * Perform an authenticated request (GET/POST/PUT/DELETE) with automatic token
   * handling. Used by the Omada service layer (sites, clients, vouchers).
   */
  async request<T>(path: string, opts: HttpRequestOptions = {}): Promise<T> {
    return this.authedRequest<T>(path, opts);
  }

  /**
   * List sites. Doubles as the "simple authenticated request" connectivity
   * probe: auth -> token -> AccessToken-authenticated GET -> SUCCESS.
   *
   * The wire schema is `SiteSummaryInfo` (verified against `components.schemas`
   * in the spec): the site's id field is `siteId`, not `id`. We normalise to
   * our own `OmadaSite.id` here so callers don't need to know that.
   */
  async getSites(): Promise<OmadaSite[]> {
    // page/pageSize are required query params on this endpoint - omitting
    // them is a 400, not "no sites" (confirmed live against the controller).
    const result = await this.authedRequest<
      RawGridRecord[] | { list: RawGridRecord[] } | { data: RawGridRecord[] }
    >(OMADA_PATHS.sites(this.cfg.omadaId), { query: { page: 1, pageSize: 1000 } });
    return this.normalizeList(result).map((raw) => ({
      id: String(raw.siteId ?? raw.id ?? ''),
      name: String(raw.name ?? ''),
      type: raw.type !== undefined ? String(raw.type) : undefined,
    }));
  }

  /** List clients connected to a given site. */
  async getClients(siteId: string): Promise<unknown[]> {
    const result = await this.authedRequest<unknown[] | { list: unknown[] }>(
      OMADA_PATHS.siteClients(this.cfg.omadaId, siteId),
    );
    return this.normalizeList(result);
  }

  /** Auth used for tests/tooling; returns the current cached token without logging it. */
  async getRawToken(): Promise<string> {
    return this.auth.getToken();
  }

  /**
   * Omada grid/list endpoints return one of: a bare array, `{ list: [...] }`,
   * or (confirmed live - `OperationResponseGridVO*` in the spec, e.g. the
   * sites listing) `{ totalRows, currentPage, currentSize, data: [...] }`.
   * Normalise all three to a plain array.
   */
  private normalizeList<T>(
    value: T[] | { list: T[] } | { data: T[] } | undefined | null,
  ): T[] {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray((value as { list?: T[] }).list)) {
      return (value as { list: T[] }).list;
    }
    if (value && Array.isArray((value as { data?: T[] }).data)) {
      return (value as { data: T[] }).data;
    }
    return [];
  }
}
