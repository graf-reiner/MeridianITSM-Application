import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Queues', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/queues');
  });

  test('page loads and shows queue list', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Queue' })).toBeVisible();
    await expect(page.getByText('Name')).toBeVisible();
  });

  test('create a queue, verify it appears in list, edit it, then delete it', async ({ page }) => {
    const queueName = uniqueName('TestQueue');
    const editedName = queueName + '-edited';

    // --- CREATE ---
    await page.getByRole('button', { name: 'New Queue' }).click();
    await page.locator('#name').fill(queueName);
    await page.getByRole('button', { name: /create queue/i }).click();
    // Wait for list to refresh
    await expect(page.getByText(queueName)).toBeVisible({ timeout: 10000 });

    // --- EDIT ---
    const row = page.locator('tr', { hasText: queueName });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#name')).toHaveValue(queueName);
    await page.locator('#name').fill(editedName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 10000 });

    // --- DELETE (uses window.confirm) ---
    page.on('dialog', dialog => dialog.accept());
    const editedRow = page.locator('tr', { hasText: editedName });
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(editedName)).not.toBeVisible({ timeout: 10000 });
  });
});
