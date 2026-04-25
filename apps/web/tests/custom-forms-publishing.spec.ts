import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Custom Forms Publishing', () => {
  test.describe.configure({ mode: 'serial' });

  let formName: string;
  let formSlug: string;
  let formId: string;
  let builderUrl: string;

  test('setup: create form with section and field via API', async ({ page, request }) => {
    formName = uniqueName('PubForm');
    formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    const fieldLabel = uniqueName('PubField');
    const fieldKey = fieldLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');

    // Create field definition via API
    const fieldRes = await request.post('/api/v1/field-definitions', {
      data: { label: fieldLabel, key: fieldKey, fieldType: 'text', required: false },
    });
    expect(fieldRes.ok()).toBeTruthy();
    const fieldDef = await fieldRes.json();

    // Create form via API
    const formRes = await request.post('/api/v1/custom-forms', {
      data: { name: formName, slug: formSlug, ticketType: 'INCIDENT' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;
    builderUrl = `/dashboard/settings/custom-forms/${formId}`;

    // Set layout with section and field via PATCH
    const instanceId = `inst_${Date.now()}`;
    const patchRes = await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: {
        layoutJson: {
          sections: [{
            id: 'section_1',
            title: 'Test Section',
            description: '',
            fields: [{
              instanceId,
              fieldDefinitionId: fieldDef.id,
              key: fieldDef.key ?? fieldKey,
              label: fieldDef.label ?? fieldLabel,
              fieldType: fieldDef.fieldType ?? 'text',
              labelOverride: fieldLabel,
              placeholderOverride: null,
              helpTextOverride: null,
              requiredOverride: false,
            }],
          }],
        },
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Verify builder loads with the section and field
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[value="Test Section"]')).toBeVisible({ timeout: 10000 });
  });

  test('publish form', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Click Publish button
    await page.getByRole('button', { name: 'Publish' }).click();

    // Verify success message
    await expect(page.getByText(/published successfully/i)).toBeVisible({ timeout: 10000 });

    // Verify status badge changes to PUBLISHED
    await expect(page.locator('span', { hasText: /^PUBLISHED$/ })).toBeVisible({ timeout: 5000 });
  });

  test('published form appears in portal catalog', async ({ page }) => {
    await loginAsAdmin(page, '/portal/forms');
    await page.waitForTimeout(2000);

    // Verify form name appears on the page
    await expect(page.getByText(formName)).toBeVisible({ timeout: 10000 });
  });

  test('unpublish form', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // When published, button text is "Unpublish"
    await page.getByRole('button', { name: 'Unpublish' }).click();

    // Verify status changes to DRAFT
    await expect(page.locator('span', { hasText: /^DRAFT$/ })).toBeVisible({ timeout: 10000 });
  });

  test('unpublished form not in portal', async ({ page }) => {
    await loginAsAdmin(page, '/portal/forms');
    await page.waitForTimeout(2000);

    // Verify form name is NOT visible
    await expect(page.getByText(formName)).not.toBeVisible({ timeout: 5000 });
  });

  test('republish and verify', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('span', { hasText: /^PUBLISHED$/ })).toBeVisible({ timeout: 10000 });

    // Navigate to portal and verify form appears again
    await page.goto('/portal/forms', { waitUntil: 'networkidle' });
    await expect(page.getByText(formName)).toBeVisible({ timeout: 10000 });
  });
});
