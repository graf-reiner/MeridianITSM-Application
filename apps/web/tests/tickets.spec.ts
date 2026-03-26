import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE = 'https://meridian.cybordyne.net';

async function login(context: BrowserContext, page: Page) {
  const cookies = await context.cookies(BASE);
  if (cookies.find(c => c.name === 'meridian_session')) return;

  // Login via the browser UI
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'admin@msp.local');
  await page.fill('input[type="password"]', 'Admin123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

function uniqueTitle(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

// Serial mode shares browser context so we login only once
test.describe.configure({ mode: 'serial' });

test.describe('Tickets - via Cloudflare', () => {
  test('login and verify tickets list page', async ({ page, context }) => {
    await login(context, page);
    await page.goto(`${BASE}/dashboard/tickets`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=New Ticket', { timeout: 10000 });

    await expect(page.getByText('Tickets').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /new ticket/i })).toBeVisible();
    await expect(page.getByPlaceholder('Search tickets...')).toBeVisible();
  });

  test('create a new ticket', async ({ page, context }) => {
    await login(context, page);
    const title = uniqueTitle('TestTicket');

    await page.goto(`${BASE}/dashboard/tickets/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });

    await page.fill('input[name="title"]', title);
    await page.fill('textarea[name="description"]', 'Automated test ticket from Playwright.');
    await page.selectOption('select[name="type"]', 'INCIDENT');
    await page.selectOption('select[name="priority"]', 'HIGH');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard\/tickets\//, { timeout: 15000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('HIGH')).toBeVisible();
  });

  test('ticket detail shows sidebar', async ({ page, context }) => {
    await login(context, page);
    const title = uniqueTitle('DetailTicket');

    await page.goto(`${BASE}/dashboard/tickets/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[name="title"]', title);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard\/tickets\//, { timeout: 15000 });

    await expect(page.getByText(title)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Assignee')).toBeVisible();
    await expect(page.getByText('Created')).toBeVisible();
  });

  test('change ticket status', async ({ page, context }) => {
    await login(context, page);
    const title = uniqueTitle('StatusTicket');

    await page.goto(`${BASE}/dashboard/tickets/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[name="title"]', title);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard\/tickets\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Find the status change dropdown (contains "Change status..." option)
    const statusSelect = page.locator('select:has(option[value="OPEN"])');
    await statusSelect.waitFor({ state: 'visible', timeout: 10000 });
    await statusSelect.selectOption('OPEN');
    await page.waitForTimeout(2000);
    await expect(page.getByText('OPEN').first()).toBeVisible({ timeout: 10000 });
  });

  test('add a comment', async ({ page, context }) => {
    await login(context, page);
    const title = uniqueTitle('CommentTicket');

    await page.goto(`${BASE}/dashboard/tickets/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[name="title"]', title);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard\/tickets\//, { timeout: 15000 });
    await page.waitForTimeout(2000);

    const commentText = 'Playwright comment ' + Date.now();
    const commentBox = page.locator('textarea').last();
    await commentBox.fill(commentText);
    await page.getByRole('button', { name: /post|send/i }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 });
  });

  test('search tickets', async ({ page, context }) => {
    await login(context, page);
    const searchTerm = uniqueTitle('Searchable');

    await page.goto(`${BASE}/dashboard/tickets/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.fill('input[name="title"]', searchTerm);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard\/tickets\//, { timeout: 15000 });

    await page.goto(`${BASE}/dashboard/tickets`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=New Ticket', { timeout: 10000 });
    await page.getByPlaceholder('Search tickets...').fill(searchTerm);
    await page.waitForTimeout(1500);
    await expect(page.getByText(searchTerm)).toBeVisible({ timeout: 10000 });
  });

  test('filter by status', async ({ page, context }) => {
    await login(context, page);
    await page.goto(`${BASE}/dashboard/tickets`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=New Ticket', { timeout: 10000 });
    await page.locator('select').first().selectOption('NEW');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=Failed to load')).not.toBeVisible({ timeout: 3000 });
  });

  test('filter by priority', async ({ page, context }) => {
    await login(context, page);
    await page.goto(`${BASE}/dashboard/tickets`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=New Ticket', { timeout: 10000 });
    await page.locator('select').nth(1).selectOption('HIGH');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=Failed to load')).not.toBeVisible({ timeout: 3000 });
  });
});
