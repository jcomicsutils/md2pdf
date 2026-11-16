import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const FALLBACK_CHROMIUM = '/home/salty/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const customExec =
  process.env.CHROMIUM_PATH || (fs.existsSync(FALLBACK_CHROMIUM) ? FALLBACK_CHROMIUM : undefined);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    ...(customExec ? { launchOptions: { executablePath: customExec } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
