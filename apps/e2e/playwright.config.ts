import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { API, DATABASE_URL, REDIS_URL, WEB } from './env';

const root = path.resolve(__dirname, '../..');
// The sandbox ships its own Chromium; elsewhere Playwright uses the one it installed.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './tests',
  // One database for the whole run: tests create their own data with unique names, but run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: WEB,
    locale: 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      cwd: root,
      url: API + '/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test', PORT: '3001', DATABASE_URL, REDIS_URL,
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'e2e-only-secret-at-least-32-characters-long',
        WEB_URL: WEB, CORS_ORIGINS: WEB,
        // A bot name without a token: order links and QR codes are made, nothing is sent to Telegram.
        TELEGRAM_BOT_USERNAME: 'myservice_e2e_bot',
      },
    },
    {
      // The production server, as deployed (next start does not serve a standalone build).
      command: 'cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/ && cp -r apps/web/public apps/web/.next/standalone/apps/web/ && node apps/web/.next/standalone/apps/web/server.js',
      cwd: root,
      url: WEB + '/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { PORT: '3000', HOSTNAME: '0.0.0.0', API_INTERNAL_URL: API },
    },
  ],
});
