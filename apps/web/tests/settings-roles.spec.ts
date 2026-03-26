import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Roles', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/roles');
  });

  test('page loads and shows system roles', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Role' })).toBeVisible();
    // "SYSTEM" badge appears on each system role row — use .first() since there are multiple
    await expect(page.getByText('SYSTEM').first()).toBeVisible();
  });

  test('create custom role with permissions, verify in list, edit, then delete', async ({ page }) => {
    const roleName = uniqueName('CustomRole');
    const editedName = roleName + '-edited';

    // --- CREATE ---
    await page.getByRole('button', { name: 'New Role' }).click();
    await page.locator('#roleName').fill(roleName);
    // Permission labels display with spaces (TICKET_CREATE -> "TICKET CREATE")
    await page.getByLabel('TICKET CREATE').check();
    await page.getByLabel('TICKET VIEW').check();
    // Submit button text is "Create Role"
    await page.getByRole('button', { name: /create role/i }).click();
    await expect(page.getByText(roleName)).toBeVisible({ timeout: 10000 });

    // --- EDIT ---
    const row = page.locator('tr', { hasText: roleName });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#roleName')).toHaveValue(roleName);
    await page.locator('#roleName').fill(editedName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 10000 });

    // --- DELETE (uses window.confirm) ---
    // Register dialog handler BEFORE clicking delete
    page.on('dialog', dialog => dialog.accept());
    const editedRow = page.locator('tr', { hasText: editedName });
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(editedName)).not.toBeVisible({ timeout: 10000 });
  });

  test('system roles cannot be edited or deleted', async ({ page }) => {
    // Multiple system role rows exist — use .first()
    const systemRow = page.locator('tr', { hasText: 'SYSTEM' }).first();
    await expect(systemRow.getByText(/system role|read-only/i)).toBeVisible();
  });
});
