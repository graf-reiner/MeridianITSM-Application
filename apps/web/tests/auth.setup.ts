import { test as setup, expect } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://10.1.200.218:4000';
const STORAGE_STATE_PATH = 'tests/.auth/admin.json';

/**
 * Global setup: authenticate once and save session state for all tests.
 */
setup('authenticate as admin', async ({ page }) => {
  // Get JWT from the API server
  const loginResp = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@msp.local',
      password: 'Admin123!',
      tenantSlug: 'msp-default',
    }),
  });

  if (!loginResp.ok) {
    const body = await loginResp.json().catch(() => ({}));
    throw new Error(`Login API returned ${loginResp.status}: ${JSON.stringify(body)}`);
  }

  const { accessToken } = await loginResp.json();

  // Set the cookie in the browser context
  await page.context().addCookies([
    {
      name: 'meridian_session',
      value: accessToken,
      domain: '10.1.200.218',
      path: '/',
    },
  ]);

  // Verify the session works by navigating to a protected page
  await page.goto('/dashboard/settings');
  await expect(page.locator('body')).not.toBeEmpty();

  // Save the storage state for reuse
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
