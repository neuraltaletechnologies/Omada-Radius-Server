import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { ValidationError } from '../src/lib/errors.js';

const required = {
  OMADA_BASE_URL: 'https://omada:8043',
  OMADA_CLIENT_ID: 'client-1',
  OMADA_CLIENT_SECRET: 'secret-1',
  OMADA_ID: 'omada-1',
};

describe('parseEnv', () => {
  it('accepts a valid minimum config with defaults', () => {
    const env = parseEnv({ ...required });
    expect(env.PORT).toBe(3000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.NODE_ENV).toBe('development');
    expect(env.OMADA_TLS_REJECT_UNAUTHORIZED).toBe(false);
    expect(env.OMADA_MODE).toBe('real');
  });

  it('rejects when OMADA_CLIENT_SECRET is missing', () => {
    const { OMADA_CLIENT_SECRET: _omitted, ...rest } = required;
    expect(() => parseEnv(rest)).toThrow(ValidationError);
  });

  it('rejects when OMADA_ID is missing', () => {
    const { OMADA_ID: _omitted, ...rest } = required;
    expect(() => parseEnv(rest)).toThrow(ValidationError);
  });

  it('coerces PORT and TLS flag', () => {
    const env = parseEnv({
      ...required,
      PORT: '8080',
      OMADA_TLS_REJECT_UNAUTHORIZED: 'true',
    });
    expect(env.PORT).toBe(8080);
    expect(env.OMADA_TLS_REJECT_UNAUTHORIZED).toBe(true);
  });

  it('rejects an invalid OMADA_PROVIDER value', () => {
    expect(() => parseEnv({ ...required, OMADA_MODE: 'bogus' })).toThrow(
      ValidationError,
    );
  });
});