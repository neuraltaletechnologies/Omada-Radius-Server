import { fetch, Agent, type Dispatcher, type BodyInit } from 'undici';
import {
  OmadaApiError,
  OmadaAuthenticationError,
  OmadaNetworkError,
} from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { OMADA_PATHS } from './omada.paths.js';
import type { OmadaConfig, OmadaEnvelope } from './omada.types.js';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  /** JSON body */
  json?: unknown;
  /** form-urlencoded body */
  form?: Record<string, string>;
  /** Access token (sent as `AccessToken=<token>`); when omitted the request is treated as unauthenticated */
  token?: string;
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

/**
 * Thin HTTP layer over the Omada Open API. Owns TLS handling, timeout,
 * envelope parsing, and error typing. `omadacId` is a PATH segment on
 * authenticated calls (provide fully-built paths from OMADA_PATHS); the token
 * endpoint takes it as a QUERY parameter (see requestToken).
 *
 * Secrets (clientSecret, accessToken) are never included in logged data.
 */
export class OmadaHttp {
  private readonly dispatcher: Dispatcher;

  constructor(
    private readonly cfg: OmadaConfig,
    private readonly logger: Logger,
  ) {
    this.dispatcher = new Agent({
      // Omada controllers ship self-signed certificates. Verification is
      // disabled only for the Omada origin and only when explicitly configured.
      connect: { rejectUnauthorized: cfg.tlsRejectUnauthorized },
    });
  }

  /**
   * Build a URL for a path. `omadacId` is embedded in the PATH by the caller
   * (OMADA_PATHS) for authenticated calls, so it is intentionally NOT added as
   * a default query parameter here. The token endpoint adds `omadacId` as a
   * query parameter explicitly (see requestToken).
   */
  private buildUrl(
    path: string,
    query?: HttpRequestOptions['query'],
  ): URL {
    const url = new URL(this.cfg.baseUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}${path}`;
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  /**
   * Request an access token via the client-credentials grant.
   *
   * Per Omada's own embedded "Open API Access Guide" (x-openapi.x-setting.
   * homeCustomLocation in the controller's /v3/api-docs - NOT a generic
   * OAuth2 endpoint, and confirmed live against the real controller):
   *   POST /openapi/authorize/token?grant_type=client_credentials
   *   Content-Type: application/json
   *   Body: { omadacId, client_id, client_secret }
   *   -> result: { accessToken, tokenType, expiresIn, refreshToken }
   * `omadacId` is in the JSON BODY here, not a query param - unlike every
   * other (siteId-scoped) endpoint where it's a path segment.
   */
  async requestToken(): Promise<TokenResponse> {
    const url = this.buildUrl(OMADA_PATHS.token);
    url.searchParams.set('grant_type', 'client_credentials');

    const res = await this.rawFetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        omadacId: this.cfg.omadaId,
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
      }),
    });

    const payload = await this.parseEnvelope<{
      accessToken: string;
      expiresIn?: number | string;
      tokenType?: string;
      refreshToken?: string;
    }>(res, url.toString());

    if (!payload.result?.accessToken) {
      throw new OmadaAuthenticationError(
        'Omada token response did not include an accessToken',
        { httpStatus: res.status },
      );
    }

    return {
      accessToken: payload.result.accessToken,
      expiresIn: Number(payload.result.expiresIn ?? 7200),
    };
  }

  /**
   * Perform an authenticated (or unauthenticated) JSON request and return the
   * `result` of the Omada envelope. Throws typed errors; a 401 is surfaced as
   * `OmadaAuthenticationError` so the caller can refresh the token.
   */
  async request<T>(path: string, opts: HttpRequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...opts.headers,
    };
    // Omada's Open API does NOT use the standard "Bearer " scheme - the
    // Access Guide documents the literal prefix "AccessToken=" instead.
    if (opts.token) headers.authorization = `AccessToken=${opts.token}`;
    if (opts.json !== undefined) headers['content-type'] = 'application/json';

    let body: string | URLSearchParams | undefined;
    if (opts.json !== undefined) body = JSON.stringify(opts.json);
    else if (opts.form) body = new URLSearchParams(opts.form);

    const res = await this.rawFetch(url.toString(), {
      method: opts.method ?? 'GET',
      headers,
      body,
    });

    if (res.status === 401) {
      throw new OmadaAuthenticationError(
        'Omada request was rejected (401) - token expired or invalid',
        { httpStatus: res.status, path },
      );
    }

    const payload = await this.parseEnvelope<T>(res, url.toString());
    return payload.result as T;
  }

  /**
   * Perform the underlying fetch with timeout and network error mapping. The
   * URL is not logged (its query string may carry identifiers and the token
   * request writes credentials into the body).
   */
  private async rawFetch(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string | URLSearchParams;
    },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      return await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body as BodyInit | undefined,
        signal: controller.signal,
        dispatcher: this.dispatcher,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (aborted) {
        throw new OmadaNetworkError('Omada request timed out', {
          timeoutMs: this.cfg.timeoutMs,
        });
      }
      const cause = err instanceof Error ? err.message : String(err);
      throw new OmadaNetworkError('Failed to reach the Omada controller', {
        cause,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseEnvelope<T>(
    res: Response,
    url: string,
  ): Promise<OmadaEnvelope<T>> {
    let payload: OmadaEnvelope<T>;
    try {
      payload = (await res.json()) as OmadaEnvelope<T>;
    } catch {
      throw new OmadaApiError(
        'Omada returned a non-JSON response',
        { httpStatus: res.status },
        undefined,
        res.status,
      );
    }

    // A raw framework-level error response (e.g. Spring's default error page
    // for a 400 on a missing required query param) is valid JSON but has NO
    // `errorCode` field at all - `(undefined ?? 0) !== 0` is false, so without
    // this check such a response would silently look like SUCCESS with an
    // empty/undefined result. Any non-2xx HTTP status is always an error,
    // regardless of whether the Omada envelope shape is present.
    if (res.status < 200 || res.status >= 300) {
      if (res.status === 401 || res.status === 403) {
        throw new OmadaAuthenticationError(`Omada request rejected (HTTP ${res.status})`, {
          httpStatus: res.status,
          body: payload,
        });
      }
      throw new OmadaApiError(
        `Omada returned HTTP ${res.status}`,
        { httpStatus: res.status, body: payload },
        undefined,
        res.status,
      );
    }

    // VERIFIED envelope: `{ errorCode, msg, result }`, success = errorCode === 0.
    // (`code`/`message` kept as fallbacks across controller versions.)
    const apiCode = payload.errorCode ?? payload.code;
    if ((apiCode ?? 0) !== 0) {
      const authCodes = new Set([401, 403, -32103, -7131]); // invalid_client / controller not exist
      const isAuthFailure = (apiCode !== undefined && authCodes.has(apiCode)) || res.status === 401;
      if (isAuthFailure) {
        throw new OmadaAuthenticationError(
          `Omada authentication failed (errorCode ${apiCode})`,
          { omadaCode: apiCode, httpStatus: res.status },
        );
      }
      throw new OmadaApiError(
        `Omada API error (errorCode ${apiCode})`,
        { omadaCode: apiCode, httpStatus: res.status },
        apiCode,
        res.status,
      );
    }
    return payload;
  }
}

