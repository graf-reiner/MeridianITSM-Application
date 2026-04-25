import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Field Library', () => {
  test.describe.configure({ mode: 'serial' });

  // Shared state across serial tests
  let textFieldLabel: string;
  let textFieldKey: string;
  let selectFieldLabel: string;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/field-library');
  });

  test('page loads and shows field library', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Field Library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Field' }).first()).toBeVisible();
  });

  test('create a text field', async ({ page }) => {
    textFieldLabel = uniqueName('TextField');
    // Match the actual generateKey function from the field-library page
    textFieldKey = textFieldLabel
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .replace(/[\s]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');

    await page.getByRole('button', { name: 'Create Field' }).first().click();
    await expect(page.getByText('Create Field Definition')).toBeVisible();

    // Fill label — key should auto-generate
    await page.locator('#fd-label').fill(textFieldLabel);
    await expect(page.locator('#fd-key')).toHaveValue(textFieldKey);

    // Select type
    await page.locator('#fd-type').selectOption('text');

    // Submit via the modal form button
    await page.locator('form').getByRole('button', { name: 'Create Field' }).click();
    await page.waitForTimeout(2000);

    // Verify row appears in table
    const row = page.locator('tr', { hasText: textFieldLabel });
    await expect(row).toBeVisible({ timeout: 10000 });
    // Check for the type badge (span) and status badge (span) — use exact match
    await expect(row.locator('span', { hasText: /^text$/ })).toBeVisible();
    await expect(row.locator('span', { hasText: /^ACTIVE$/ })).toBeVisible();
  });

  test('create a select field with options', async ({ page }) => {
    selectFieldLabel = uniqueName('SelectField');

    await page.getByRole('button', { name: 'Create Field' }).first().click();
    await page.locator('#fd-label').fill(selectFieldLabel);
    await page.locator('#fd-type').selectOption('select');

    // Wait for options section to appear
    await page.waitForTimeout(500);

    // Fill the option inputs — they appear in pairs (Label, Value)
    const labelInputs = page.locator('input[placeholder="Label"]');
    const valueInputs = page.locator('input[placeholder="Value"]');

    // First option (there's already one empty row by default)
    await labelInputs.first().fill('High');
    await valueInputs.first().fill('high');

    // Add second option
    await page.getByRole('button', { name: 'Add Option' }).click();
    await page.waitForTimeout(300);
    await labelInputs.nth(1).fill('Medium');
    await valueInputs.nth(1).fill('medium');

    // Add third option
    await page.getByRole('button', { name: 'Add Option' }).click();
    await page.waitForTimeout(300);
    await labelInputs.nth(2).fill('Low');
    await valueInputs.nth(2).fill('low');

    // Submit via the modal form button
    await page.locator('form').getByRole('button', { name: 'Create Field' }).click();
    await page.waitForTimeout(2000);

    // Verify row appears
    const row = page.locator('tr', { hasText: selectFieldLabel });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('span', { hasText: /^select$/ })).toBeVisible();
    await expect(row.locator('span', { hasText: /^ACTIVE$/ })).toBeVisible();
  });

  test('edit a field label', async ({ page }) => {
    const row = page.locator('tr', { hasText: textFieldLabel });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByText('Edit Field Definition')).toBeVisible();

    const editedLabel = textFieldLabel + 'Edited';
    await page.locator('#fd-label').fill(editedLabel);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForTimeout(2000);

    // Verify updated label in table
    await expect(page.locator('tr', { hasText: editedLabel })).toBeVisible({ timeout: 10000 });

    // Update shared state for later tests
    textFieldLabel = editedLabel;
  });

  test('key is read-only on edit', async ({ page }) => {
    const row = page.locator('tr', { hasText: textFieldLabel });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByText('Edit Field Definition')).toBeVisible();
    await expect(page.locator('#fd-key')).toHaveAttribute('readonly', '');
  });

  test('key auto-generates from label', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Field' }).first().click();
    await expect(page.getByText('Create Field Definition')).toBeVisible();

    await page.locator('#fd-label').fill('My Custom Field');
    await expect(page.locator('#fd-key')).toHaveValue('my_custom_field');

    // Cancel to clean up
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('validation: label required', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Field' }).first().click();
    await expect(page.getByText('Create Field Definition')).toBeVisible();

    // Clear label, fill something else, try to submit
    await page.locator('#fd-label').fill('');
    // The HTML5 required attribute will block submission. Verify the label input is required.
    await expect(page.locator('#fd-label')).toHaveAttribute('required', '');
    // Try submitting to trigger native or custom validation
    await page.locator('form').getByRole('button', { name: 'Create Field' }).click();
    await page.waitForTimeout(500);

    // The modal should still be open (form didn't submit)
    await expect(page.getByText('Create Field Definition')).toBeVisible();
  });

  test('validation: key format', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Field' }).first().click();
    await expect(page.getByText('Create Field Definition')).toBeVisible();

    await page.locator('#fd-label').fill('Test Field');
    await page.waitForTimeout(300);
    // Manually set an invalid key (starts with number) — need to clear auto-generated key first
    const keyInput = page.locator('#fd-key');
    await keyInput.click();
    await keyInput.fill('123invalid');
    await page.waitForTimeout(200);
    await page.locator('form').getByRole('button', { name: 'Create Field' }).click();
    await page.waitForTimeout(500);

    // Expect validation error about key format
    await expect(page.getByText(/[Kk]ey must/)).toBeVisible({ timeout: 5000 });
  });

  test('archive a field', async ({ page }) => {
    // Use the select field created earlier
    const row = page.locator('tr', { hasText: selectFieldLabel });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Register dialog handler before clicking
    page.on('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Archive' }).click();
    await page.waitForTimeout(2000);

    // After archiving, field should either disappear or show ARCHIVED status
    const archivedRow = page.locator('tr', { hasText: selectFieldLabel });
    const isVisible = await archivedRow.isVisible().catch(() => false);
    if (isVisible) {
      await expect(archivedRow.getByText('ARCHIVED')).toBeVisible({ timeout: 5000 });
    }
    // If not visible, the field was removed from the active list (also valid)
  });

  test('create fields for multiple types', async ({ page }) => {
    const types = ['number', 'checkbox', 'date', 'email'];

    for (const fieldType of types) {
      const label = uniqueName(`${fieldType}Field`);

      await page.getByRole('button', { name: 'Create Field' }).first().click();
      await expect(page.getByText('Create Field Definition')).toBeVisible();

      await page.locator('#fd-label').fill(label);
      await page.locator('#fd-type').selectOption(fieldType);
      await page.locator('form').getByRole('button', { name: 'Create Field' }).click();
      await page.waitForTimeout(2000);

      // Verify row appears with correct type badge
      const row = page.locator('tr', { hasText: label });
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.locator('span', { hasText: new RegExp(`^${fieldType}$`) })).toBeVisible();
      await expect(row.locator('span', { hasText: /^ACTIVE$/ })).toBeVisible();
    }
  });
});
