import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const python = process.env.E2E_PYTHON ?? 'python3';
// The database is emptied on every start, so its name must end in _e2e (the reset refuses any other).
const db = process.env.E2E_DB_URL ?? 'postgresql+asyncpg://oxblood:oxblood@localhost:5432/oxblood_e2e';

// A throwaway stack: the real API (Postgres + a mock Proxmox with the scenario templates, e2e/serve_api.py), which also
// serves the production build. Needs `npm run build` done first
// (`npm run test:e2e` does both).
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1, // one shared database
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://localhost:8100',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `${python} tests/pgutil.py reset && ${python} -m alembic upgrade head && ${python} ${path.join(here, 'e2e/serve_api.py')}`,
      cwd: path.join(repo, 'apps/api'),
      url: 'http://localhost:8100/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      env: {
        OXBLOOD_DB_URL: db,
        OXBLOOD_TEST_DB_URL: db,
        OXBLOOD_SCENARIOS_DIR: path.join(repo, 'examples/scenarios'),
        OXBLOOD_WEB_DIR: path.join(repo, 'apps/web/dist'),
      },
    },
  ],
});
