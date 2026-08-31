import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E — web app (http://localhost:3000) + API (http://localhost:4000).
 * CI: `npx playwright install chromium --with-deps && npx playwright test`
 * Local: RUN_E2E=1 npx playwright test          (requires both servers up)
 */
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
const API = process.env.E2E_API ?? 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        { command: 'npm run start', url: WEB, reuseExistingServer: true, timeout: 120_000 },
        { command: 'cd ../backend && RUN_SERVER=1 npm run start', url: `${API}/v1/health`, reuseExistingServer: true, timeout: 120_000 },
      ],
});
