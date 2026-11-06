import { defineConfig } from '@playwright/test'

// E2E runs against the dev stack (docker compose up -d) with fresh usernames per run.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'pnpm -F server dev',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 120_000,
      // Every spec signs up fresh users from 127.0.0.1; lift the 10/min auth limit for the run.
      env: { AI_FAKE: process.env.AI_FAKE ?? '1', AUTH_RATE_LIMIT_PER_MIN: '1000' },
    },
    { command: 'pnpm -F worker dev', reuseExistingServer: true, timeout: 120_000, env: { AI_FAKE: process.env.AI_FAKE ?? '1' }, url: 'http://localhost:4100/health' },
    { command: 'pnpm -F web dev', url: 'http://localhost:3000/login', reuseExistingServer: true, timeout: 180_000 },
  ],
})
