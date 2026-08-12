import { describe, it, expect, afterEach } from 'vitest';
import { pino } from 'pino';
import { REDACT_KEY_PATTERNS } from '../src/config/env.js';

function collectLogs(redactPaths: string[]) {
  const lines: string[] = [];
  const stream = {
    write: (chunk: string) => {
      lines.push(chunk);
      return true;
    },
  };
  const log = pino(
    {
      redact: { paths: redactPaths, censor: '[REDACTED]' },
      base: undefined,
    },
    stream,
  );
  return { log, lines };
}

describe('pino redaction', () => {
  const { log, lines } = collectLogs(REDACT_KEY_PATTERNS);

  it('censors secret-like keys but keeps safe fields', () => {
    log.info(
      {
        event: 'omada.token.obtained',
        clientSecret: 'super-secret-abc',
        omadaClientSecret: 'another-secret',
        accessToken: 'tok-123',
        baseUrl: 'https://omada:8043',
        siteId: 'site-1',
      },
      'a message',
    );
    const raw = lines[0];
    expect(raw).not.toContain('super-secret-abc');
    expect(raw).not.toContain('another-secret');
    expect(raw).not.toContain('tok-123');
    expect(raw).toContain('[REDACTED]');
    expect(raw).toContain('https://omada:8043');
    expect(raw).toContain('site-1');
  });
});

describe('REDACT_KEY_PATTERNS', () => {
  it('covers the documented secret keys', () => {
    const joined = REDACT_KEY_PATTERNS.join(' ');
    expect(joined).toMatch(/clientSecret/);
    expect(joined).toMatch(/client_secret/);
    expect(joined).toMatch(/apiSecret/);
    expect(joined).toMatch(/accessToken/);
    expect(joined).toMatch(/apiKey/);
  });
});