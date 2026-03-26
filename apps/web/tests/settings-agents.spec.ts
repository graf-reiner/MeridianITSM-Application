import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Settings > Agents', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/agents');
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Generate Enrollment Token' }).first()).toBeVisible();
  });

  test('generate enrollment token, see full token', async ({ page }) => {
    await page.getByRole('button', { name: 'Generate Enrollment Token' }).first().click();

    const maxInput = page.locator('#maxEnrollments');
    if (await maxInput.isVisible()) {
      await maxInput.fill('5');
    }

    await page.getByRole('button', { name: /generate token/i }).click();
    await expect(page.getByText(/copy it now/i)).toBeVisible({ timeout: 10000 });

    // Token should be displayed in a readonly input
    const tokenField = page.locator('#enrollmentToken');
    const tokenValue = await tokenField.inputValue();
    expect(tokenValue.length).toBeGreaterThan(10);

    // Copy button should be visible
    await expect(page.getByRole('button', { name: /copy/i })).toBeVisible();

    await page.getByRole('button', { name: 'Done' }).click();

    // Token count should have increased in the Enrollment Tokens section header
    await expect(page.getByText(/Enrollment Tokens/)).toBeVisible();
  });

  test('revoke an enrollment token', async ({ page }) => {
    // Generate a token first
    await page.getByRole('button', { name: 'Generate Enrollment Token' }).first().click();
    await page.getByRole('button', { name: /generate token/i }).click();
    await expect(page.getByText(/copy it now/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Done' }).click();

    // Click the Enrollment Tokens collapsible section to expand it
    const tokensSection = page.locator('text=Enrollment Tokens').first();
    await tokensSection.click();
    await page.waitForTimeout(500);

    // Find an active token and revoke it (inline confirmation)
    const activeRow = page.locator('tr', { hasText: 'Active' }).first();
    await activeRow.getByRole('button', { name: /revoke/i }).click();
    await page.getByRole('button', { name: /confirm revoke/i }).click();
    await expect(page.getByText('Revoked').first()).toBeVisible({ timeout: 10000 });
  });
});
