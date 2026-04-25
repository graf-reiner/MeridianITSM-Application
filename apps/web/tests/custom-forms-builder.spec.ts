import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

/**
 * Custom Forms — Form Builder Tests
 *
 * The form builder has complex React state management. To avoid hydration
 * timing issues with clicks, we use a hybrid approach:
 * - Create form layout via API (PATCH) for reliable setup
 * - Test UI rendering and read-only interactions via Playwright
 * - Test save/publish via UI buttons
 */
test.describe('Custom Form Builder', () => {
  test.describe.configure({ mode: 'serial' });

  let formId: string;
  let formName: string;
  let formSlug: string;
  let builderUrl: string;
  let fieldDefId: string;
  let fieldKey: string;

  test('setup: create form and field via API', async ({ page, request }) => {
    formName = uniqueName('builder-form');
    formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    const fieldLabel = uniqueName('builder-text');
    fieldKey = fieldLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');

    // Create field definition
    await loginAsAdmin(page, '/dashboard/settings/field-library');
    const fieldRes = await request.post('/api/v1/field-definitions', {
      data: { label: fieldLabel, key: fieldKey, fieldType: 'text', required: false },
    });
    expect(fieldRes.ok()).toBeTruthy();
    const fieldDef = await fieldRes.json();
    fieldDefId = fieldDef.id;

    // Create form
    const formRes = await request.post('/api/v1/custom-forms', {
      data: { name: formName, slug: formSlug, ticketType: 'SERVICE_REQUEST' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;
    builderUrl = `/dashboard/settings/custom-forms/${formId}`;
  });

  test('builder loads and shows form name', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Add a section to start building your form')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Section' })).toBeVisible();
  });

  test('add section and field via API, verify in builder', async ({ page, request }) => {
    // Add layout via API PATCH
    const instanceId = `inst_${Date.now()}`;
    const patchRes = await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: {
        layoutJson: {
          sections: [{
            id: 'section_1',
            title: 'General Information',
            description: 'Enter general details',
            fields: [{
              instanceId,
              fieldDefinitionId: fieldDefId,
              key: fieldKey,
              label: fieldKey,
              fieldType: 'text',
              labelOverride: 'Subject',
              placeholderOverride: 'Enter subject',
              helpTextOverride: null,
              requiredOverride: true,
            }],
          }],
        },
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Navigate to builder and verify
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });

    // Section title should be visible as an input value
    await expect(page.locator('input[value="General Information"]')).toBeVisible({ timeout: 10000 });

    // Field should be visible in the section
    await expect(page.getByText('Subject')).toBeVisible({ timeout: 5000 });
  });

  test('right panel tabs are present', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });

    // Verify all 4 config tabs
    await expect(page.getByRole('button', { name: 'Fields' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mapping' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conditions' })).toBeVisible();
    // Settings tab may be truncated as "Set..." in the UI
    const settingsTab = page.locator('button', { hasText: /Settings|Set/ });
    await expect(settingsTab.first()).toBeVisible();
  });

  test('fields tab shows field config when field is clicked', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.getByText('Subject')).toBeVisible({ timeout: 15000 });

    // Click on the field in the canvas
    await page.getByText('Subject').click();
    await page.waitForTimeout(500);

    // The Fields tab should show override inputs
    await expect(page.getByText('Label Override')).toBeVisible({ timeout: 5000 });
  });

  test('mapping tab shows template fields', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });

    // Click Mapping tab
    await page.getByRole('button', { name: 'Mapping' }).click();
    await page.waitForTimeout(500);

    // Verify mapping fields are visible
    await expect(page.getByText('Title Template')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Description Template')).toBeVisible();
  });

  test('conditions tab shows add condition button', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });

    // Click Conditions tab
    await page.getByRole('button', { name: 'Conditions' }).click();
    await page.waitForTimeout(500);

    // Verify conditions panel
    await expect(page.getByRole('button', { name: 'Add Condition' })).toBeVisible({ timeout: 5000 });
  });

  test('save draft shows success message', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Click Save Draft
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.waitForTimeout(2000);

    // Verify success message
    await expect(page.getByText('Form saved successfully')).toBeVisible({ timeout: 5000 });
  });

  test('publish form', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Click Publish
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForTimeout(3000);

    // Verify status changed to PUBLISHED
    await expect(page.locator('span', { hasText: /^PUBLISHED$/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/published successfully/i)).toBeVisible({ timeout: 5000 });
  });

  test('unpublish form', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // When published, the button says "Unpublish"
    await page.getByRole('button', { name: 'Unpublish' }).click();
    await page.waitForTimeout(3000);

    // Verify status changed to DRAFT
    await expect(page.locator('span', { hasText: /^DRAFT$/ })).toBeVisible({ timeout: 5000 });
  });

  test('preview modal opens', async ({ page }) => {
    await loginAsAdmin(page, builderUrl);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Click Preview
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.waitForTimeout(1000);

    // Verify preview modal opens with the section
    await expect(page.getByText('Preview:')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('General Information')).toBeVisible();
  });
});
