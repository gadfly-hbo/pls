import { defineConfig, devices } from '@playwright/test';

const tmpDir = process.env.TMPDIR || '/tmp';
const useMock = process.env.VITE_USE_MOCK || 'true';
const workspace = process.env.VITE_PLS_WORKSPACE || (useMock === 'false' ? `ws_playwright_${Date.now()}` : 'ws_demo');

process.env.VITE_PLS_WORKSPACE = workspace;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  outputDir: process.env.PLAYWRIGHT_TEST_OUTPUT_DIR || `${tmpDir}/pls-web-test-results`,
  reporter: [['html', { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT || `${tmpDir}/pls-web-playwright-report`, open: 'never' }]],
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
    command: `VITE_USE_MOCK=${useMock} VITE_PLS_WORKSPACE=${workspace} npm run dev -- --port 5175 --strictPort`,
    url: 'http://localhost:5175',
    reuseExistingServer: false,
  },
});
