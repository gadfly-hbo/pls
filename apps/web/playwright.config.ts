import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `VITE_USE_MOCK=${process.env.VITE_USE_MOCK || 'true'} npm run dev -- --port 5175 --strictPort`,
    url: 'http://localhost:5175',
    reuseExistingServer: false,
  },
});
