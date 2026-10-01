import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const backend = path.resolve('../../backend');
const webPort = Number(process.env.E2E_WEB_PORT || 5173);
const webUrl = `http://127.0.0.1:${webPort}`;
const apiPort = Number(process.env.E2E_API_PORT || 8001);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const python = path.join(
  backend,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: webUrl, channel: 'msedge', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --app-dir "${backend}" --host 127.0.0.1 --port ${apiPort}`,
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      env: {
        APP_ENV: 'test',
        DB_ENABLED: 'false',
        AUTH_ENABLED: 'true',
        AUTH_SMS_MODE: 'development',
        AUTH_SQLITE_PATH: path.join(backend, `.cache/auth-e2e-${process.pid}.sqlite3`),
        CORS_ORIGINS: '[]',
      },
    },
    {
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: apiUrl },
    },
  ],
});
