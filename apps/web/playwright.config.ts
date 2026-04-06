import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://10.1.200.218:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    channel: 'chrome',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'settings',
      dependencies: ['setup'],
      use: {
        storageState: 'tests/.auth/admin.json',
      },
    },
  ],
});
