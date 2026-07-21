import { defineConfig, devices } from '@playwright/test';

const WORKER_PORT = 8787;
const STUB_UPSTREAM_PORT = 4790;
const STATIC_PORT = 4173;
const REACT_EXAMPLE_PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${STATIC_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node e2e/stub-upstream-server.mjs`,
      port: STUB_UPSTREAM_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Self-contained test secrets via --var, independent of whatever a
      // developer's local .dev.vars happens to contain. Both example origins
      // (vanilla static server + React dev server) need to be allowlisted.
      command:
        `npx wrangler dev --port ${WORKER_PORT} ` +
        `--var AI_API_KEY:e2e-test-key --var AI_BASE_URL:http://localhost:${STUB_UPSTREAM_PORT} --var AI_MODEL:stub-model ` +
        `--var ALLOWED_ORIGINS:http://localhost:${STATIC_PORT},http://localhost:${REACT_EXAMPLE_PORT}`,
      cwd: 'packages/worker',
      port: WORKER_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx serve -l ${STATIC_PORT} .`,
      port: STATIC_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx vite --port ${REACT_EXAMPLE_PORT} --strictPort`,
      cwd: 'examples/react',
      port: REACT_EXAMPLE_PORT,
      reuseExistingServer: !process.env.CI,
      env: { VITE_AI_WORKER_URL: `http://localhost:${WORKER_PORT}` },
    },
  ],
});
