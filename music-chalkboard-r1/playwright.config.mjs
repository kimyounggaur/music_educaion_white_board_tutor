import { defineConfig } from '@playwright/test';

const localURL = 'http://127.0.0.1:4173';
const baseURL = process.env.BASE_URL || localURL;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL,
    viewport: { width: 1366, height: 768 },
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: executablePath ? { executablePath } : {} } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev',
    url: localURL,
    reuseExistingServer: !process.env.CI,
  },
});
