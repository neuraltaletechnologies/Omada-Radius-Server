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
  /** Bearer token; when omitted the request is treated as unauthenticated */
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
   * Request an access token via the OAuth2 client-credentials grant.
   * The `omadacId` is required here as a QUERY parameter.
   */
  async requestToken(): Promise<TokenResponse> {
    const url = this.buildUrl(OMADA_PATHS.token);
    url.searchParams.set('omadacId', this.cfg.omadaId);
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });

    const res = await this.rawFetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const payload = await this.parseEnvelope<{
      access_token: string;
      expires_in?: number | string;
      token_type?: string;
      scope?: string;
    }>(res, url.toString());

    if (!payload.result?.access_token) {
      throw new OmadaAuthenticationError(
        'Omada token response did not include an access_token',
        { httpStatus: res.status },
      );
    }

    return {
      accessToken: payload.result.access_token,
      expiresIn: Number(payload.result.expires_in ?? 86400),
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
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
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

    if (payload.code !== 0) {
      const isAuthFailure =
        payload.code === 401 || res.status === 401 || payload.code === -32103;
      if (isAuthFailure) {
        throw new OmadaAuthenticationError(
          `Omada authentication failed (code ${payload.code})`,
          { omadaCode: payload.code, httpStatus: res.status },
        );
      }
      throw new OmadaApiError(
        `Omada API error (code ${payload.code})`,
        { omadaCode: payload.code, httpStatus: res.status },
        payload.code,
        res.status,
      );
    }
    return payload;
  }
}

