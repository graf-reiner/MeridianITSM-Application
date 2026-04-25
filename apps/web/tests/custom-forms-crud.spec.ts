import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Custom Forms CRUD', () => {
  test.describe.configure({ mode: 'serial' });

  const FORMS_URL = '/dashboard/settings/custom-forms';
  let createdFormName: string;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, FORMS_URL);
  });

  test('page loads with forms table', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Custom Forms' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Form' })).toBeVisible();
  });

  test('create a custom form', async ({ page }) => {
    createdFormName = uniqueName('form');

    await page.getByRole('button', { name: 'Create Form' }).click();
    await expect(page.locator('#cf-name')).toBeVisible();

    await page.locator('#cf-name').fill(createdFormName);
    await page.locator('#cf-type').selectOption('Incident');
    // Use the form submit button (exact match avoids "Create Form" header button)
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Wait for modal to close and form to appear in table
    await expect(page.locator('#cf-name')).not.toBeVisible({ timeout: 10000 });

    // Verify form appears in table with DRAFT status
    const row = page.locator('tr', { hasText: createdFormName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('span', { hasText: /^DRAFT$/ })).toBeVisible();
  });

  test('slug auto-generation', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Form' }).click();
    await expect(page.locator('#cf-name')).toBeVisible();

    await page.locator('#cf-name').fill('New Hire Onboarding');
    await page.waitForTimeout(500);
    await expect(page.locator('#cf-slug')).toHaveValue('new-hire-onboarding');

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('validation: name required', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Form' }).click();
    await expect(page.locator('#cf-name')).toBeVisible();

    // Leave name empty, click Create — HTML5 required will block
    // Just verify the name input has required attribute
    await expect(page.locator('#cf-name')).toHaveAttribute('required', '');
    // The modal should stay open since name is empty
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('#cf-name')).toBeVisible();
  });

  test('slug validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Form' }).click();
    await expect(page.locator('#cf-name')).toBeVisible();

    await page.locator('#cf-name').fill('Test Form');
    await page.waitForTimeout(300);

    // Clear and set invalid slug
    await page.locator('#cf-slug').click();
    await page.locator('#cf-slug').fill('123invalid');
    await page.locator('#cf-type').selectOption('Service Request');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForTimeout(500);

    // Verify slug format error or modal stays open
    await expect(page.getByText(/[Ss]lug must start/)).toBeVisible({ timeout: 5000 });
  });

  test('clone a form', async ({ page }) => {
    const row = page.locator('tr', { hasText: createdFormName });
    await expect(row).toBeVisible({ timeout: 10000 });

    page.on('dialog', (dialog) => dialog.accept());
    await row.first().getByRole('button', { name: 'Clone' }).click();
    await page.waitForTimeout(2000);

    // A cloned form with "(Copy)" should now exist
    await expect(page.getByText(/cloned successfully/i)).toBeVisible({ timeout: 5000 });
    // Both original and copy should be visible
    const allRows = page.locator('tr', { hasText: createdFormName });
    expect(await allRows.count()).toBeGreaterThanOrEqual(2);
  });

  test('archive a form', async ({ page }) => {
    // Create a fresh form to archive
    const archiveName = uniqueName('form');

    await page.getByRole('button', { name: 'Create Form' }).click();
    await page.locator('#cf-name').fill(archiveName);
    await page.locator('#cf-type').selectOption('Incident');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('#cf-name')).not.toBeVisible({ timeout: 10000 });

    const row = page.locator('tr', { hasText: archiveName });
    await expect(row).toBeVisible({ timeout: 10000 });

    page.on('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Archive' }).click();
    await page.waitForTimeout(2000);

    // Verify status changes to ARCHIVED
    await expect(row.locator('span', { hasText: /^ARCHIVED$/ })).toBeVisible({ timeout: 10000 });
  });

  test('edit navigates to builder', async ({ page }) => {
    const row = page.locator('tr', { hasText: createdFormName }).first();
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.getByRole('link', { name: 'Edit' }).click();

    // Verify navigation to the form builder page
    await page.waitForURL(/\/dashboard\/settings\/custom-forms\/[a-zA-Z0-9-]+/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/dashboard\/settings\/custom-forms\/[a-zA-Z0-9-]+/);
  });
});
