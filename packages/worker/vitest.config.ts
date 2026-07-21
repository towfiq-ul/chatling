import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Deterministic test-only secrets, independent of whatever a
      // developer's local .dev.vars happens to contain.
      miniflare: {
        bindings: {
          AI_API_KEY: 'test-api-key',
          AI_BASE_URL: 'https://upstream.test',
          AI_MODEL: 'test-model',
        },
      },
    }),
  ],
});
