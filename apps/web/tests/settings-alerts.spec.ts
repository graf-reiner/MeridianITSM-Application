import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Alert Channels', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/alerts');
  });

  test('page loads', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add Channel' }).first()).toBeVisible();
  });

  test('create email alert channel, verify card appears, then delete', async ({ page }) => {
    const channelName = uniqueName('EmailAlert');

    // --- CREATE ---
    await page.getByRole('button', { name: 'Add Channel' }).first().click();
    await page.locator('#name').fill(channelName);
    await page.locator('#recipients').fill('test@example.com, admin@example.com');
    await page.getByLabel('sla.warning').check();
    await page.getByLabel('sla.breach').check();
    await page.locator('form').getByRole('button', { name: /add channel/i }).click();
    await expect(page.getByText(channelName)).toBeVisible({ timeout: 10000 });

    // --- DELETE ---
    await page.getByRole('button', { name: /remove/i }).first().click();
    await page.getByRole('button', { name: /confirm remove/i }).click();
    await expect(page.getByRole('heading', { name: channelName })).not.toBeVisible({ timeout: 5000 });
  });

  test('create Slack alert channel', async ({ page }) => {
    const channelName = uniqueName('SlackAlert');

    await page.getByRole('button', { name: 'Add Channel' }).first().click();
    await page.getByRole('button', { name: 'Slack' }).click();
    await page.locator('#name').fill(channelName);
    await page.locator('#slackWebhookUrl').fill('https://hooks.slack.com/services/T000/B000/xxxx');
    await page.getByLabel('sla.breach').check();
    await page.locator('form').getByRole('button', { name: /add channel/i }).click();
    await expect(page.getByText(channelName)).toBeVisible({ timeout: 10000 });

    // Cleanup
    await page.getByRole('button', { name: /remove/i }).first().click();
    await page.getByRole('button', { name: /confirm remove/i }).click();
  });

  test('create Teams alert channel', async ({ page }) => {
    const channelName = uniqueName('TeamsAlert');

    await page.getByRole('button', { name: 'Add Channel' }).first().click();
    await page.getByRole('button', { name: 'Microsoft Teams' }).click();
    await page.locator('#name').fill(channelName);
    await page.locator('#teamsConnectorUrl').fill('https://outlook.office.com/webhook/test-connector');
    await page.getByLabel('ticket.created').check();
    await page.locator('form').getByRole('button', { name: /add channel/i }).click();
    await expect(page.getByText(channelName)).toBeVisible({ timeout: 10000 });

    // Cleanup
    await page.getByRole('button', { name: /remove/i }).first().click();
    await page.getByRole('button', { name: /confirm remove/i }).click();
  });
});
