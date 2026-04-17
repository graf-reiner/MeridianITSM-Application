import { type Page } from '@playwright/test';

/**
 * Navigate to a settings page. Auth is handled by storageState from auth.setup.ts.
 */
export async function loginAsAdmin(page: Page, navigateTo = '/dashboard/settings') {
  await page.goto(navigateTo, { waitUntil: 'networkidle' });
}

/**
 * Generate a unique name with timestamp to avoid collisions.
 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Phase 7 (CREF-05 multi-tenancy E2E): log in as the admin of a second test
 * tenant so the isolation spec can assert zero reference-data overlap.
 *
 * Requires a second tenant fixture seeded in the dev DB (slug: 'tenant-b') and
 * the HAS_SECOND_TEST_TENANT env flag to be set. When absent, the consuming
 * spec MUST guard with `test.skip(!process.env.HAS_SECOND_TEST_TENANT, ...)`
 * so wave-merge gates do not fail on dev machines without the fixture.
 *
 * Strategy: clear cookies (do NOT rely on the shared admin storageState),
 * then submit the login form using tenant B credentials.
 *
 * Credentials precedence:
 *   1. process.env.TENANT_B_ADMIN_EMAIL / TENANT_B_ADMIN_PASSWORD (CI)
 *   2. Dev defaults: admin@tenant-b.local / Admin123!
 */
export async function loginAsTenantBAdmin(
  page: Page,
  navigateTo = '/dashboard/settings',
): Promise<void> {
  await page.context().clearCookies();

  const email = process.env.TENANT_B_ADMIN_EMAIL ?? 'admin@tenant-b.local';
  const password = process.env.TENANT_B_ADMIN_PASSWORD ?? 'Admin123!';

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  if (navigateTo !== '/dashboard') {
    await page.goto(navigateTo, { waitUntil: 'networkidle' });
  }
}
