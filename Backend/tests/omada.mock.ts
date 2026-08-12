import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface OmadaMock {
  url: string;
  server: Server;
  close: () => Promise<void>;
  calls: {
    token: number;
    sites: number;
  };
}

/**
 * A tiny configurable HTTP server that simulates the Omada Open API for tests.
 * Handlers can be replaced per-test to drive success, 401-refresh, and error
 * scenarios. Authentication failures on sites are simulated by only accepting
 * the specific token listed in `acceptedToken`.
 */
export async function startOmadaMock(opts: {
  tokenResponses: Array<{
    accessToken: string;
    expiresIn?: number;
    code?: number;
  }>;
  acceptedToken?: string;
  sitesResult?: unknown;
  sitesOverrides?: Record<string, unknown>;
}): Promise<OmadaMock> {
  const calls = { token: 0, sites: 0 };
  let tokenIndex = 0;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const omadacId = url.searchParams.get('omadacId');

    if (req.method === 'POST' && url.pathname === '/api/v1/auth/oauth2/token') {
      calls.token += 1;
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const okBody =
          params.get('grant_type') === 'client_credentials' &&
          params.get('client_id') === 'client-1' &&
          params.get('client_secret') === 'secret-1' &&
          omadacId === 'omada-1';

        if (!okBody) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code: -32103, message: 'invalid_client' }));
          return;
        }

        const spec = opts.tokenResponses[tokenIndex % opts.tokenResponses.length];
        tokenIndex += 1;
        if ((spec.code ?? 0) !== 0) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ code: spec.code, message: 'custom_error' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            message: 'Success',
            result: {
              access_token: spec.accessToken,
              expires_in: spec.expiresIn ?? 3600,
              token_type: 'Bearer',
            },
          }),
        );
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/sites') {
      calls.sites += 1;
      const auth = req.headers.authorization ?? '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (opts.acceptedToken && token !== opts.acceptedToken) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 401, message: 'expired' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          code: 0,
          message: 'Success',
          result:
            opts.sitesResult ??
            [
              { id: 'site-1', name: 'Main Office' },
              { id: 'site-2', name: 'Branch' },
            ],
        }),
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: -1, message: 'not_found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    server,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
    calls,
  };
}