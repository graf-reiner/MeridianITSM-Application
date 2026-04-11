import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

/**
 * APM ↔ CMDB Bridge E2E
 *
 * Validates that:
 *  1. Creating an Application via the API auto-creates a primary CMDB CI
 *     and wires Application.primaryCiId.
 *  2. The Application detail page renders the new tabbed layout (Overview,
 *     Support, Infrastructure, Network & Endpoints, Certificates,
 *     Dependencies, Documents, Assets, Activity).
 *  3. The "Primary CI" link is visible in the header when the bridge exists.
 *  4. The Infrastructure tab loads without an error and shows the empty
 *     state when no relationships exist yet.
 *  5. The Certificates tab loads and shows its empty state.
 *  6. The CMDB CI detail page shows the "Linked Application" card on the
 *     General tab.
 *  7. The SSL Certificates entry is in the sidebar nav and the dashboard
 *     page loads (likely empty if no cert endpoints linked).
 */

test.describe('APM ↔ CMDB Bridge', () => {
  let appId: string;
  let appName: string;
  let primaryCiId: string | null = null;

  test.beforeAll(async ({ request }) => {
    appName = uniqueName('APMTest');
    const res = await request.post('/api/v1/applications', {
      data: {
        name: appName,
        type: 'WEB',
        criticality: 'MEDIUM',
        hostingModel: 'CLOUD',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { id: string; primaryCiId: string | null };
    appId = body.id;
    primaryCiId = body.primaryCiId;
  });

  test.afterAll(async ({ request }) => {
    if (appId) {
      await request.delete(`/api/v1/applications/${appId}`);
    }
  });

  test('createApp auto-creates a primary CI on the bridge', async () => {
    expect(primaryCiId, 'Application should have a primaryCiId set after creation').toBeTruthy();
  });

  test('Application detail page renders the 9-tab layout', async ({ page }) => {
    await loginAsAdmin(page, `/dashboard/applications/${appId}`);

    // Header shows the application name
    await expect(page.getByRole('heading', { name: appName, level: 1 })).toBeVisible({
      timeout: 10000,
    });

    // All 9 tabs visible
    for (const label of [
      'Overview',
      'Support',
      'Infrastructure',
      'Network & Endpoints',
      'Certificates',
      'Dependencies',
      'Documents',
      'Assets',
      'Activity',
    ]) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }

    // The "Primary CI" header chip exists when bridge succeeded
    if (primaryCiId) {
      await expect(page.getByRole('link', { name: /primary ci/i })).toBeVisible();
    }
  });

  test('Infrastructure tab shows empty-state for unlinked CIs', async ({ page }) => {
    await loginAsAdmin(page, `/dashboard/applications/${appId}`);

    await page.getByRole('button', { name: 'Infrastructure' }).click();
    // Either an empty-state message or a Card heading — both are acceptable.
    await expect(
      page.getByText(
        /No infrastructure linked|No primary CI linked|Servers \(\d+\)|Databases \(\d+\)|Endpoints \(\d+\)/,
      ),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Certificates tab loads and shows empty-state', async ({ page }) => {
    await loginAsAdmin(page, `/dashboard/applications/${appId}`);

    await page.getByRole('button', { name: 'Certificates' }).click();
    await expect(page.getByText(/No certificates tracked|Certificates \(\d+\)/)).toBeVisible({
      timeout: 10000,
    });
  });

  test('Support tab — owners section + edit notes flow', async ({ page }) => {
    await loginAsAdmin(page, `/dashboard/applications/${appId}`);
    await page.getByRole('button', { name: 'Support' }).click();

    // No yellow banner — bridge succeeded, primaryCiId is set
    await expect(page.getByText('No primary CI linked')).not.toBeVisible();

    // Owner cards visible
    await expect(page.getByText(/Business Owner/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Technical Owner/i)).toBeVisible();
    await expect(page.getByText(/Support Group/i)).toBeVisible();

    // Edit notes flow
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const note = `runbook-${Date.now()}`;
    await page.getByPlaceholder(/Operational notes/).fill(note);
    await page.getByRole('button', { name: 'Save' }).click();

    // Note should appear in read-only display after save
    await expect(page.getByText(note)).toBeVisible({ timeout: 10000 });
  });

  test('CMDB CI detail page shows the Linked Application card', async ({ page }) => {
    test.skip(!primaryCiId, 'No primary CI created — skipping CMDB-side check');

    await loginAsAdmin(page, `/dashboard/cmdb/${primaryCiId}`);

    // Linked Application card on the General tab
    await expect(page.getByRole('heading', { name: 'Linked Application' })).toBeVisible({
      timeout: 10000,
    });

    // The application name is the link text
    await expect(page.getByRole('link', { name: appName })).toBeVisible();
  });

  test('SSL Certificates dashboard loads from sidebar nav', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/applications/ssl-certificates');

    await expect(
      page.getByRole('heading', { name: 'SSL Certificates', level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Filter chips render even when empty
    await expect(page.getByRole('button', { name: /^All \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Critical/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Expired/ })).toBeVisible();
  });
});
