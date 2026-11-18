import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5180',
    headless: true,
    // 本地和 GitHub Actions 的 ubuntu-latest 都自带稳定版 Chrome，
    // 用系统浏览器避免额外下载 Chromium。
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev -- --port 5180',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});