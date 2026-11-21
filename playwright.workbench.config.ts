import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/workbench.spec.ts'],
  outputDir: '.generated/playwright-workbench-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'on-first-retry',
  },
})
