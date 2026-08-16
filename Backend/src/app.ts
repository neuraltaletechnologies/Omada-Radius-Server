import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { healthRoutes } from './routes/health.js';
import { omadaRoutes } from './routes/omada.js';
import { catalogRoutes } from './routes/catalog.js';

/**
 * Build (but do not start) the Fastify application - useful for tests and the
 * server entrypoint alike.
 *
 * Fastify v5 only accepts a pino *config object* (not an instance) for its
 * `logger` option, and it would register request logs on its own logger. We set
 * `logger: false` and route all structured logging through our single pino
 * instance so secret redaction + correlation ids are applied consistently.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID(),
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 1024 * 1024,
  });

  // CORS for the captive portal (Portal runs on a different origin). Restrict
  // origins in production via APP_URL when it is set.
  void app.register(cors, {
    origin: env.APP_URL ? [env.APP_URL] : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Request logging with a per-request correlation id so one customer
  // transaction can be traced portal -> payment -> webhook -> Omada -> SMS.
  app.addHook('onRequest', async (request) => {
    logger.debug(
      {
        event: 'http.request',
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'request started',
    );
  });
  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      {
        event: 'http.response',
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      'request completed',
    );
  });

  void app.register(healthRoutes);
  void app.register(omadaRoutes);
  void app.register(catalogRoutes);

  setErrorHandler(app);

  return app;
}

/**
 * Central error handler: map typed AppError to safe API errors. Internal stack
 * traces / provider details are never returned to clients in production.
 */
function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      logger.warn(
        {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
        },
        `Handled error: ${error.code}`,
      );
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    const message =
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error instanceof Error
          ? error.message
          : 'Unknown error';

    logger.error(
      {
        err: error,
        message,
      },
      'Unhandled error',
    );

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
    });
  });
}