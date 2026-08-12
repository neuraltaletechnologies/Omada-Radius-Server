import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const app = buildApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
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