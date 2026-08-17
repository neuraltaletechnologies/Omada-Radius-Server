import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createJobRunner } from './modules/jobs/job.runner.js';

async function main(): Promise<void> {
  const app = buildApp();

  // Background job worker: voucher provisioning + SMS dispatch (spec section
  // 23). Only runs when a database is configured - the Omada-only milestone
  // and tests don't need it.
  const jobRunner = env.DATABASE_URL ? createJobRunner(logger) : undefined;
  jobRunner?.start();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    jobRunner?.stop();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(
      {
        event: 'server.started',
        mode: env.NODE_ENV,
        url: `http://${env.HOST}:${env.PORT}`,
      },
      'Backend started',
    );
  } catch (err) {
    logger.fatal({ err }, 'Failed to start backend');
    process.exit(1);
  }
}

void main();