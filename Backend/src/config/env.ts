import 'dotenv/config';
import { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Environment schema. All secrets are parsed here at boot time; they are never
 * written to logs (see REDACT_KEYS and the standalone logger config).
 *
 * Endpoint paths themselves are NOT included in this schema - they are the
 * responsibility of the Omada module (see modules/omada/omada.paths.ts) and
 * MUST be confirmed against the installed controller's Online API Documentation.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  APP_URL: z.string().url().optional(),

  // Database (Phase 2 - optional in this milestone)
  DATABASE_URL: z.string().optional(),

  // Omada Open API (Client Mode)
  OMADA_BASE_URL: z.string().min(1, 'OMADA_BASE_URL is required'),
  OMADA_CLIENT_ID: z.string().min(1, 'OMADA_CLIENT_ID is required'),
  OMADA_CLIENT_SECRET: z.string().min(1, 'OMADA_CLIENT_SECRET is required'),
  OMADA_ID: z.string().min(1, 'OMADA_ID (omadacId) is required'),
  OMADA_SITE_ID: z.string().optional(),
  OMADA_MODE: z.enum(['real', 'mock']).default('real'),
  OMADA_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  OMADA_TOKEN_TTL_SAFETY_S: z.coerce.number().int().nonnegative().default(60),
  OMADA_TLS_REJECT_UNAUTHORIZED: z
    .string()
    .transform((v) => v !== 'false' && v !== '0')
    .default('false'),

  // Payment / SMS providers (later milestones - declared now for structure)
  PAYMENT_PROVIDER: z.enum(['fake', 'manual', 'none']).default('none'),
  SMS_PROVIDER: z.enum(['fake', 'manual', 'none']).default('none'),

  // Minimal admin bearer/API key for this milestone; RBAC comes later.
  ADMIN_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse + validate a raw environment record (exported for unit testing).
 * Empty-string values are normalised to `undefined` so `.env` placeholder
 * lines do not accidentally satisfy (or trip) validators.
 */
export function parseEnv(raw: Record<string, unknown>): Env {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    clean[key] = typeof value === 'string' && value === '' ? undefined : value;
  }
  const parsed = envSchema.safeParse(clean);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    );
    throw new ValidationError('Environment validation failed', { issues });
  }
  return parsed.data;
}

/** Boot-time environment (validated once). */
export const env: Env = parseEnv(process.env);

/**
 * Keys that must never appear in structured logs. Pino redaction matches by
 * dot-separated path segments, so we list both the exact root key and the
 * wildcard form that covers the same key nested at any depth. Fields that match
 * are censored to "[REDACTED]" regardless of nesting.
 */
export const REDACT_KEY_PATTERNS = [
  'password',
  '*password',
  'clientSecret',
  '*clientSecret',
  'omadaClientSecret',
  '*omadaClientSecret',
  'client_secret',
  '*client_secret',
  'apiSecret',
  '*apiSecret',
  'apiKey',
  '*apiKey',
  'accessToken',
  '*accessToken',
  'access_token',
  '*access_token',
  'authorization',
  '*authorization',
  'secret',
  '*secret',
];