// Playwright config — drives a real Chromium with the unpacked Catchly
// extension loaded. Output goes under qa/ (gitignored) so report
// screenshots and HTML reports don't end up in the public repo.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,           // Single Chromium context with the extension
  workers: 1,                     // Extension state shared across tests
  reporter: [['list'], ['html', { outputFolder: 'qa/playwright-report', open: 'never' }]],
  outputDir: 'qa/test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
