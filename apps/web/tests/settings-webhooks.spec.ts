import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Webhooks', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/webhooks');
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Webhook' }).first()).toBeVisible();
  });

  test('create webhook, verify it appears, then delete', async ({ page }) => {
    const webhookName = uniqueName('TestWebhook');

    // --- CREATE ---
    await page.getByRole('button', { name: 'Add Webhook' }).first().click();
    await page.locator('#name').fill(webhookName);
    await page.locator('#endpointUrl').fill('https://example.com/webhook-test');
    await page.getByLabel('ticket.created').check();
    await page.getByLabel('ticket.updated').check();
    await page.locator('form').getByRole('button', { name: /add webhook/i }).click();
    await expect(page.getByText(webhookName)).toBeVisible({ timeout: 10000 });

    // Verify it shows as Enabled
    await expect(page.getByText(/enabled/i).first()).toBeVisible();

    // --- DELETE ---
    // Use the link with the webhook name to find the parent card area
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('button', { name: /confirm delete/i }).click();
    await expect(page.getByRole('link', { name: webhookName })).not.toBeVisible({ timeout: 10000 });
  });

  test('can disable and re-enable a webhook', async ({ page }) => {
    const webhookName = uniqueName('ToggleHook');

    // Create
    await page.getByRole('button', { name: 'Add Webhook' }).first().click();
    await page.locator('#name').fill(webhookName);
    await page.locator('#endpointUrl').fill('https://example.com/toggle');
    await page.getByLabel('ticket.created').check();
    await page.locator('form').getByRole('button', { name: /add webhook/i }).click();
    await expect(page.getByText(webhookName)).toBeVisible({ timeout: 10000 });

    // Disable
    await page.getByRole('button', { name: /disable/i }).first().click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/disabled/i).first()).toBeVisible({ timeout: 5000 });

    // Re-enable
    await page.getByRole('button', { name: /enable/i }).first().click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/enabled/i).first()).toBeVisible({ timeout: 5000 });

    // Cleanup
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('button', { name: /confirm delete/i }).click();
  });

  test('add custom headers to webhook', async ({ page }) => {
    const webhookName = uniqueName('HeaderHook');

    await page.getByRole('button', { name: 'Add Webhook' }).first().click();
    await page.locator('#name').fill(webhookName);
    await page.locator('#endpointUrl').fill('https://example.com/headers');
    await page.getByLabel('ticket.created').check();

    await page.getByRole('button', { name: /add header/i }).click();
    await page.getByPlaceholder('Header name').first().fill('X-Custom-Auth');
    await page.getByPlaceholder('Value').first().fill('secret-token-123');

    await page.locator('form').getByRole('button', { name: /add webhook/i }).click();
    await expect(page.getByText(webhookName)).toBeVisible({ timeout: 10000 });

    // Cleanup
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('button', { name: /confirm delete/i }).click();
  });
});
