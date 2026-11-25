import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx astro preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'Pixel 7',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'Galaxy S9+ landscape',
      use: {
        ...devices['Galaxy S9+ landscape'],
      },
    },
    {
      name: 'CPU 4x throttle',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--disable-gpu-vsync'],
        },
      },
    },
  ],
});
