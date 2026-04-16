import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Settings > Notification Templates', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/settings/notification-templates');
  });

  test('page loads with heading and new-template button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Notification Templates/i })).toBeVisible();
    await expect(page.getByTestId('new-template-button')).toBeVisible();
  });

  test('creates an EMAIL template with variable insertion, lists it, then deletes', async ({ page }) => {
    const name = uniqueName('EmailTpl');

    // Open modal
    await page.getByTestId('new-template-button').click();
    await expect(page.getByRole('heading', { name: /New Notification Template/i })).toBeVisible();

    // EMAIL is the default channel — confirm it
    await page.getByTestId('channel-option-EMAIL').click();

    // Fill name
    await page.getByTestId('template-name').fill(name);

    // Fill subject via VariableInput — plain text is enough, variable picker is exercised elsewhere
    const subject = `New ticket {{ticket.number}}: {{ticket.title}}`;
    await page.locator('input[placeholder*="ticket.number"]').first().fill(subject);

    // Fill HTML body via TipTap editor (it uses contenteditable, not a textarea)
    await page
      .locator('.variable-rich-editor')
      .first()
      .click();
    await page.keyboard.type('Hello, your ticket has been received.');

    // Save
    await page.getByTestId('save-template').click();

    // Row appears
    const row = page.getByText(name);
    await expect(row).toBeVisible({ timeout: 10000 });

    // Delete it (no workflow references yet, should succeed)
    page.once('dialog', (d) => d.accept());
    await page
      .locator(`tr`, { hasText: name })
      .getByRole('button', { name: /Delete/ })
      .click();
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 5000 });
  });

  test('creates a TELEGRAM template (message-only field shape)', async ({ page }) => {
    const name = uniqueName('TelegramTpl');

    await page.getByTestId('new-template-button').click();
    await page.getByTestId('channel-option-TELEGRAM').click();
    await page.getByTestId('template-name').fill(name);

    // For TELEGRAM the field is a textarea, not the rich editor
    await page
      .locator('textarea[placeholder*="Markdown"]')
      .first()
      .fill('Ticket {{ticket.number}}: {{ticket.title}} — assigned to you');

    await page.getByTestId('save-template').click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

    // Cleanup
    page.once('dialog', (d) => d.accept());
    await page
      .locator('tr', { hasText: name })
      .getByRole('button', { name: /Delete/ })
      .click();
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 5000 });
  });

  test('channel filter tabs narrow the list', async ({ page }) => {
    const name = uniqueName('FilterTpl');

    // Create a TEAMS template
    await page.getByTestId('new-template-button').click();
    await page.getByTestId('channel-option-TEAMS').click();
    await page.getByTestId('template-name').fill(name);
    await page.locator('input[placeholder*="ticket.number"]').first().fill('Ticket {{ticket.number}}');
    await page.locator('.variable-rich-editor').first().click();
    await page.keyboard.type('Teams body text');
    await page.getByTestId('save-template').click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

    // Filter to EMAIL — TEAMS template should disappear from list
    await page.getByTestId('channel-tab-EMAIL').click();
    await expect(page.getByText(name)).not.toBeVisible();

    // Filter to TEAMS — re-appears
    await page.getByTestId('channel-tab-TEAMS').click();
    await expect(page.getByText(name)).toBeVisible();

    // Cleanup
    page.once('dialog', (d) => d.accept());
    await page
      .locator('tr', { hasText: name })
      .getByRole('button', { name: /Delete/ })
      .click();
  });

  test('edit flow preserves channel as immutable', async ({ page }) => {
    const name = uniqueName('EditTpl');

    // Create SLACK template
    await page.getByTestId('new-template-button').click();
    await page.getByTestId('channel-option-SLACK').click();
    await page.getByTestId('template-name').fill(name);
    await page.locator('textarea[placeholder*="Markdown"]').first().fill('Initial message for {{ticket.title}}');
    await page.getByTestId('save-template').click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

    // Edit — channel buttons should be disabled
    await page
      .locator('tr', { hasText: name })
      .getByRole('button', { name: /Edit/ })
      .click();
    await expect(page.getByText(/immutable/i)).toBeVisible();
    await expect(page.getByTestId('channel-option-EMAIL')).toBeDisabled();

    // Modify name and save
    const newName = `${name}-edited`;
    await page.getByTestId('template-name').fill(newName);
    await page.getByTestId('save-template').click();
    await expect(page.getByText(newName)).toBeVisible({ timeout: 10000 });

    // Cleanup
    page.once('dialog', (d) => d.accept());
    await page
      .locator('tr', { hasText: newName })
      .getByRole('button', { name: /Delete/ })
      .click();
  });
});
