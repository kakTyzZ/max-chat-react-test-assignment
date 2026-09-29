import os from 'node:os';
import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Browser QA runs below normal priority in its own headless profile.
os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
const windowsEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserPath = process.env.PLAYWRIGHT_BROWSER_PATH ?? (existsSync(windowsEdge) ? windowsEdge : undefined);

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5187',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      executablePath: browserPath,
      args: ['--enable-gpu', '--use-angle=d3d11'],
    },
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:client',
    url: 'http://127.0.0.1:5187',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
