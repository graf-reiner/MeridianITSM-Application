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
