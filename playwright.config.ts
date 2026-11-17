import { defineConfig } from "@playwright/test";

const PORT = 3100;

/**
 * 실제 크롬으로 화면을 열어 눌러 보는 시험. 먼저 `NEXT_PUBLIC_DEV_LESSONS=1 npm run build`로 만든 앱을 띄운다.
 * (npm run e2e가 빌드와 시험을 함께 한다.)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", trace: "off" },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 720 } } },
    { name: "tv", use: { viewport: { width: 1920, height: 1080 } } },
    {
      name: "phone-portrait",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: "phone-landscape",
      use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
});
