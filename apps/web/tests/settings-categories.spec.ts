import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Categories', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/categories');
  });

  test('page loads and shows category tree', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Category' })).toBeVisible();
  });

  test('create a top-level category and a sub-category', async ({ page }) => {
    const parentName = uniqueName('ParentCat');
    const childName = uniqueName('ChildCat');

    // --- CREATE PARENT ---
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.locator('#name').fill(parentName);
    await page.getByRole('button', { name: /create category/i }).click();
    await expect(page.getByText(parentName)).toBeVisible({ timeout: 10000 });

    // --- CREATE CHILD ---
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.locator('#name').fill(childName);
    const parentSelect = page.locator('#parentCategory');
    await parentSelect.waitFor({ state: 'visible' });
    await page.waitForFunction(
      ([selectId, name]) => {
        const sel = document.getElementById(selectId) as HTMLSelectElement | null;
        if (!sel) return false;
        return Array.from(sel.options).some(o => o.text === name);
      },
      ['parentCategory', parentName] as const,
      { timeout: 5000 }
    );
    await parentSelect.selectOption({ label: parentName });
    await page.getByRole('button', { name: /create category/i }).click();
    await page.waitForTimeout(1000);

    // Parent should show "1 sub" in the Children column
    const parentRow = page.locator('tr', { hasText: parentName });
    await expect(parentRow.getByText(/1 sub/)).toBeVisible({ timeout: 5000 });
  });

  test('edit a category name', async ({ page }) => {
    const catName = uniqueName('EditCat');
    const editedName = catName + '-edited';

    // Create
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.locator('#name').fill(catName);
    await page.getByRole('button', { name: /create category/i }).click();
    await expect(page.getByText(catName)).toBeVisible({ timeout: 10000 });

    // Edit
    const row = page.locator('tr', { hasText: catName });
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.locator('#name').fill(editedName);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(editedName)).toBeVisible({ timeout: 10000 });

    // Cleanup
    page.on('dialog', dialog => dialog.accept());
    const editedRow = page.locator('tr', { hasText: editedName });
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(editedName)).not.toBeVisible({ timeout: 10000 });
  });
});
