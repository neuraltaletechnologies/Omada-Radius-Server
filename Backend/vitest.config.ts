import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    env: {
      NODE_ENV: 'test',
      OMADA_BASE_URL: 'https://omada:8043',
      OMADA_CLIENT_ID: 'client-1',
      OMADA_CLIENT_SECRET: 'secret-1',
      OMADA_ID: 'omada-1',
      OMADA_MODE: 'real',
      ADMIN_API_KEY: 'test-admin-key',
      // Pin every DB/provider var explicitly so a developer's local Backend/.env
      // (loaded via dotenv/config in config/env.ts) can never leak into the test
      // process and make route-wiring tests non-deterministic.
      DATABASE_URL: '',
      PAYMENT_PROVIDER: 'none',
      SMS_PROVIDER: 'none',
    },
    testTimeout: 15000,
  },
});
