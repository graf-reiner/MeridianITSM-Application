import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

/**
 * Phase 7 (CREF-05): CMDB new-CI form populates class/status/environment
 * dropdowns from API fetches against the four /api/v1/cmdb/* endpoints.
 *
 * The UI pattern is plain `fetch(..., { credentials: 'include' })` in a
 * useEffect at apps/web/src/app/dashboard/cmdb/new/page.tsx:256-272 — NOT
 * TanStack Query. This spec asserts against that shape.
 */
test.describe('CMDB CI new-form reference dropdowns (CREF-05)', () => {
  test('class/status/environment dropdowns are populated from API fetches', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/cmdb/')) apiCalls.push(req.url());
    });

    await loginAsAdmin(page, '/dashboard/cmdb/new');

    // Wait for at least the classes fetch — the form blocks step 1 until classes load
    await page.waitForResponse(
      (res) => res.url().includes('/api/v1/cmdb/classes') && res.ok(),
      { timeout: 15_000 },
    );

    // After the form is mounted, all reference fetches should have fired
    expect(apiCalls.some((u) => u.includes('/api/v1/cmdb/classes'))).toBe(true);
    expect(apiCalls.some((u) => u.includes('/api/v1/cmdb/statuses'))).toBe(true);
    expect(apiCalls.some((u) => u.includes('/api/v1/cmdb/environments'))).toBe(true);

    // At least one seeded class is rendered as a clickable option (matches
    // new/page.tsx step 1 grid — "Server" is part of the canonical seed).
    await expect(page.getByText(/Server/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
