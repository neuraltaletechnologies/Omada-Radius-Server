import { randomUUID } from 'node:crypto';
import pino, { type LoggerOptions } from 'pino';
import { env, REDACT_KEY_PATTERNS } from '../config/env.js';

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  // Never leak secrets into log payloads.
  redact: {
    paths: REDACT_KEY_PATTERNS,
    censor: '[REDACTED]',
  },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  // A default correlation id so one customer transaction can be traced end-to-end
  // even outside a request scope.
  mixin() {
    return { correlationId: randomUUID() };
  },
};

// Pretty-print in local/development only; plain JSON everywhere else.
if (env.NODE_ENV === 'development') {
  options.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
  };
}

export const logger = pino(options);

export type Logger = pino.Logger;