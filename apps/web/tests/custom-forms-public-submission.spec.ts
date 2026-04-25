import { test, expect } from '@playwright/test';
import { uniqueName } from './helpers';

const BASE_URL = 'http://10.1.200.218:3000';
const API_URL = 'http://10.1.200.218:4000';

/**
 * Custom Forms — Public / Anonymous Submission Tests
 *
 * Tests the public form endpoint at /public/forms/[formId].
 * These tests run WITHOUT auth (fresh browser context).
 */
test.describe('Custom Forms Public Submission', () => {
  test.describe.configure({ mode: 'serial' });

  // Use empty storage state — no auth for public forms
  test.use({ storageState: { cookies: [], origins: [] } });

  let formId: string;
  let formName: string;
  let authToken: string;

  test('setup: create and publish form via API', async ({ request }) => {
    formName = uniqueName('PublicForm');
    const fieldLabel = uniqueName('pub-field');
    const fieldKey = fieldLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');
    const formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

    // Authenticate to get token
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: 'admin@msp.local', password: 'Admin123!', tenantSlug: 'msp-default' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginData = await loginRes.json();
    authToken = loginData.accessToken;
    const headers = { Cookie: `meridian_session=${authToken}` };

    // Create field definition
    const fieldRes = await request.post(`${BASE_URL}/api/v1/field-definitions`, {
      headers,
      data: { label: fieldLabel, key: fieldKey, fieldType: 'text', required: true },
    });
    expect(fieldRes.ok()).toBeTruthy();
    const fieldDef = await fieldRes.json();

    // Create form
    const formRes = await request.post(`${BASE_URL}/api/v1/custom-forms`, {
      headers,
      data: { name: formName, slug: formSlug, ticketType: 'SERVICE_REQUEST' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;

    // Set layout with section + required field, requireAuth=false
    const instanceId = `inst_${Date.now()}`;
    const patchRes = await request.patch(`${BASE_URL}/api/v1/custom-forms/${formId}`, {
      headers,
      data: {
        requireAuth: false,
        showInPortal: true,
        layoutJson: {
          sections: [{
            id: 'section_1',
            title: 'Request Details',
            description: '',
            fields: [{
              instanceId,
              fieldDefinitionId: fieldDef.id,
              key: fieldKey,
              label: fieldLabel,
              fieldType: 'text',
              labelOverride: 'Your Request',
              placeholderOverride: 'Describe your request',
              helpTextOverride: null,
              requiredOverride: true,
            }],
          }],
        },
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Publish
    const pubRes = await request.post(`${BASE_URL}/api/v1/custom-forms/${formId}/publish`, { headers });
    expect(pubRes.ok()).toBeTruthy();
  });

  test('public form loads without auth', async ({ page }) => {
    await page.goto(`${BASE_URL}/public/forms/${formId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Should show form name
    await expect(page.getByText(formName)).toBeVisible({ timeout: 10000 });
  });

  test('identity fields are visible for anonymous users', async ({ page }) => {
    await page.goto(`${BASE_URL}/public/forms/${formId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Should show identity section for anonymous users
    const pageText = await page.textContent('body');
    const hasIdentity = pageText?.includes('First Name') || pageText?.includes('Email') || pageText?.includes('Your Information');
    expect(hasIdentity).toBeTruthy();
  });

  test('successful anonymous submission', async ({ page }) => {
    await page.goto(`${BASE_URL}/public/forms/${formId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Fill all visible text and email inputs
    const inputs = page.locator('input[type="text"], input[type="email"]');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const placeholder = (await input.getAttribute('placeholder')) ?? '';
      const id = (await input.getAttribute('id')) ?? '';
      const isVisible = await input.isVisible();
      if (!isVisible) continue;

      if (placeholder.toLowerCase().includes('first') || id.toLowerCase().includes('first')) {
        await input.fill('Test');
      } else if (placeholder.toLowerCase().includes('last') || id.toLowerCase().includes('last')) {
        await input.fill('User');
      } else if (placeholder.toLowerCase().includes('email') || id.toLowerCase().includes('email')) {
        await input.fill(`test-${Date.now()}@example.com`);
      } else {
        await input.fill('Public anonymous submission test');
      }
    }

    // Submit
    await page.getByRole('button', { name: /submit/i }).click();
    await page.waitForTimeout(5000);

    // Check for success
    const pageText = await page.textContent('body');
    const hasSuccess = pageText?.includes('Submitted Successfully') || pageText?.includes('TKT-');
    expect(hasSuccess).toBeTruthy();
  });

  test('invalid form ID shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/public/forms/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const pageText = await page.textContent('body');
    const hasError = pageText?.includes('not be loaded') || pageText?.includes('not found') || pageText?.includes('Error') || pageText?.includes('error');
    expect(hasError).toBeTruthy();
  });
});
