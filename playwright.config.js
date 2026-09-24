// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real page served by a static server.
 * Projects cover a normal desktop, a high-DPI screen, a touch device and a narrow screen.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8123',
    // Full Chromium in new headless mode (no separate headless-shell download needed)
    channel: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8123 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8123/index.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1400, height: 900 } },
      testIgnore: /(touch|narrow)\.spec\.js/,
    },
    {
      name: 'hidpi',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 },
      testMatch: /hidpi\.spec\.js/,
    },
    {
      name: 'touch',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1200, height: 800 }, hasTouch: true },
      testMatch: /touch\.spec\.js/,
    },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 375, height: 740 } },
      testMatch: /narrow\.spec\.js/,
    },
  ],
});
