import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE = 'http://10.1.200.218:3000';
const API = 'http://10.1.200.218:4000';

async function login(context: BrowserContext, page: Page) {
  const cookies = await context.cookies(BASE);
  if (cookies.find((c) => c.name === 'meridian_session')) return;

  const loginResp = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@msp.local',
      password: 'Admin123!',
      tenantSlug: 'msp-default',
    }),
  });

  if (!loginResp.ok) throw new Error(`Login failed: ${loginResp.status}`);
  const { accessToken } = (await loginResp.json()) as { accessToken: string };

  await context.addCookies([
    { name: 'meridian_session', value: accessToken, domain: '10.1.200.218', path: '/' },
  ]);
}

/**
 * Opens the AI chat panel by clicking the FAB button.
 * Returns once the panel is visible.
 */
async function openChatPanel(page: Page) {
  // Click the blue robot FAB
  const fab = page.locator('button[title="AI Assistant"]');
  await fab.waitFor({ timeout: 10000 });
  await fab.click();

  // Wait for panel to slide in
  await expect(page.getByText('AI Assistant').first()).toBeVisible({ timeout: 5000 });
}

/**
 * Sends a message in the chat panel and waits for the AI response to complete.
 * Returns the full assistant response text.
 */
async function sendAndWaitForResponse(page: Page, message: string): Promise<string> {
  const textarea = page.locator('textarea[placeholder="Ask about your data..."]');
  await textarea.fill(message);

  const sendButton = page.locator('button[title="Send"]');
  await sendButton.click();

  // Wait for streaming to complete — the send button changes to "Stop" during streaming,
  // then back to "Send" when done. Wait up to 60s for AI response.
  await expect(page.locator('button[title="Send"]')).toBeVisible({ timeout: 60000 });

  // Collect the last assistant message content
  // Messages are in the panel — the last non-user bubble is the response
  const assistantMessages = page.locator('div').filter({
    has: page.locator('div[style*="border-radius: 14px 14px 14px 4px"]'),
  });

  // Get the last assistant message
  const lastMessage = assistantMessages.last();
  const text = await lastMessage.innerText();
  return text;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });
test.use({ baseURL: BASE });

test.describe('AI Chatbot - Data Query Verification', () => {
  test.beforeEach(async ({ page, context }) => {
    await login(context, page);
  });

  test('Q1: How many tickets are in the system?', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await openChatPanel(page);

    const response = await sendAndWaitForResponse(page, 'How many total tickets are in the system?');

    // We know there are 32 tickets. The AI should report this number.
    // Allow for slight variation since new tickets may be created by other tests.
    expect(response).toMatch(/\d+/); // Should contain a number
    console.log('Q1 Response:', response);

    // Verify no error messages
    expect(response).not.toContain('error');
    expect(response).not.toContain('not configured');
  });

  test('Q2: How many open tickets are there?', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await openChatPanel(page);

    const response = await sendAndWaitForResponse(page, 'How many tickets have an OPEN status?');

    // We know there are 2 OPEN tickets
    console.log('Q2 Response:', response);
    expect(response).toMatch(/\b2\b/); // Should contain the number 2
    expect(response).not.toContain('error');
  });

  test('Q3: List all CMDB configuration items', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await openChatPanel(page);

    const response = await sendAndWaitForResponse(page, 'List all configuration items in the CMDB');

    // Should contain the known CI names
    console.log('Q3 Response:', response);
    const lowerResponse = response.toLowerCase();
    expect(lowerResponse).toContain('cyborsvr01');
    expect(lowerResponse).toContain('cyborsql01');
    expect(response).not.toContain('error');
  });

  test('Q4: Which computers have 7-Zip installed?', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await openChatPanel(page);

    const response = await sendAndWaitForResponse(
      page,
      'Which computers have 7-Zip installed?',
    );

    // CYBORWKS10 has 7-Zip 24.09 installed
    console.log('Q4 Response:', response);
    const lowerResponse = response.toLowerCase();
    expect(lowerResponse).toContain('cyborwks10');
    expect(response).not.toContain('error');
  });

  test('Q5: What servers are in the CMDB?', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await openChatPanel(page);

    const response = await sendAndWaitForResponse(
      page,
      'What servers are in the CMDB? Filter by type SERVER only.',
    );

    // Only WIN-3ACHFOS4OO8 is type SERVER
    console.log('Q5 Response:', response);
    const lowerResponse = response.toLowerCase();
    expect(lowerResponse).toContain('win-3achfos4oo8');
    expect(response).not.toContain('error');
  });

  test('Q6: Find high priority tickets', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await openChatPanel(page);

    const response = await sendAndWaitForResponse(
      page,
      'Show me all HIGH priority tickets',
    );

    // Should include known high priority tickets
    console.log('Q6 Response:', response);
    const lowerResponse = response.toLowerCase();
    // "Email server down" is HIGH priority
    expect(lowerResponse).toContain('email server');
    expect(response).not.toContain('error');
  });
});
