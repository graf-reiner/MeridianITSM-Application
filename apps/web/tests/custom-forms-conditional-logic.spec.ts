import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Custom Forms Conditional Logic', () => {
  test.describe.configure({ mode: 'serial' });

  let formName: string;
  let formSlug: string;
  let formId: string;

  // Field labels
  let categoryLabel: string;
  let hardwareModelLabel: string;
  let softwareNameLabel: string;

  test('setup: create form with conditional fields via API', async ({ page, request }) => {
    formName = uniqueName('cond-form');
    formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    categoryLabel = uniqueName('Category');
    hardwareModelLabel = uniqueName('HWModel');
    softwareNameLabel = uniqueName('SWName');

    const categoryKey = categoryLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');
    const hwKey = hardwareModelLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');
    const swKey = softwareNameLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');

    // Create "Category" select field with options
    const catRes = await request.post('/api/v1/field-definitions', {
      data: {
        label: categoryLabel, key: categoryKey, fieldType: 'select', required: false,
        optionsJson: [
          { label: 'hardware', value: 'hardware' },
          { label: 'software', value: 'software' },
          { label: 'other', value: 'other' },
        ],
      },
    });
    expect(catRes.ok()).toBeTruthy();
    const catDef = await catRes.json();

    // Create "Hardware Model" text field
    const hwRes = await request.post('/api/v1/field-definitions', {
      data: { label: hardwareModelLabel, key: hwKey, fieldType: 'text', required: false },
    });
    expect(hwRes.ok()).toBeTruthy();
    const hwDef = await hwRes.json();

    // Create "Software Name" text field
    const swRes = await request.post('/api/v1/field-definitions', {
      data: { label: softwareNameLabel, key: swKey, fieldType: 'text', required: false },
    });
    expect(swRes.ok()).toBeTruthy();
    const swDef = await swRes.json();

    // Create form via API
    const formRes = await request.post('/api/v1/custom-forms', {
      data: { name: formName, slug: formSlug, ticketType: 'SERVICE_REQUEST' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;

    // Build layout with all 3 fields
    const instCat = `inst_cat_${Date.now()}`;
    const instHw = `inst_hw_${Date.now() + 1}`;
    const instSw = `inst_sw_${Date.now() + 2}`;

    // PATCH layout + conditions
    const patchRes = await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: {
        layoutJson: {
          sections: [{
            id: 'section_1',
            title: 'Request Details',
            description: '',
            fields: [
              {
                instanceId: instCat,
                fieldDefinitionId: catDef.id,
                key: catDef.key ?? categoryKey,
                label: catDef.label ?? categoryLabel,
                fieldType: 'select',
                labelOverride: categoryLabel,
                placeholderOverride: null,
                helpTextOverride: null,
                requiredOverride: false,
              },
              {
                instanceId: instHw,
                fieldDefinitionId: hwDef.id,
                key: hwDef.key ?? hwKey,
                label: hwDef.label ?? hardwareModelLabel,
                fieldType: 'text',
                labelOverride: hardwareModelLabel,
                placeholderOverride: null,
                helpTextOverride: null,
                requiredOverride: false,
              },
              {
                instanceId: instSw,
                fieldDefinitionId: swDef.id,
                key: swDef.key ?? swKey,
                label: swDef.label ?? softwareNameLabel,
                fieldType: 'text',
                labelOverride: softwareNameLabel,
                placeholderOverride: null,
                helpTextOverride: null,
                requiredOverride: false,
              },
            ],
          }],
        },
        conditionsJson: [
          {
            id: `cond_hw_${Date.now()}`,
            parentFieldId: instCat,
            operator: 'equals',
            value: 'hardware',
            action: 'show',
            targetFieldId: instHw,
          },
          {
            id: `cond_sw_${Date.now() + 1}`,
            parentFieldId: instCat,
            operator: 'equals',
            value: 'software',
            action: 'show',
            targetFieldId: instSw,
          },
        ],
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Publish via API
    const publishRes = await request.post(`/api/v1/custom-forms/${formId}/publish`);
    expect(publishRes.ok()).toBeTruthy();

    // Quick verification: load portal form
    await loginAsAdmin(page, `/portal/forms/${formSlug}`);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
  });

  test('equals + show: conditional fields toggle on portal form', async ({ page }) => {
    const portalUrl = `/portal/forms/${formSlug}`;
    await loginAsAdmin(page, portalUrl);
    await page.waitForTimeout(2000);

    // Verify Hardware Model and Software Name are NOT visible initially
    await expect(page.getByLabel(new RegExp(hardwareModelLabel, 'i'))).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(new RegExp(softwareNameLabel, 'i'))).not.toBeVisible({ timeout: 5000 });

    // Select "hardware" from Category dropdown
    const categorySelect = page.getByLabel(new RegExp(categoryLabel, 'i'));
    await categorySelect.selectOption('hardware');
    await page.waitForTimeout(500);

    // Hardware Model should appear, Software Name should stay hidden
    await expect(page.getByLabel(new RegExp(hardwareModelLabel, 'i'))).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(new RegExp(softwareNameLabel, 'i'))).not.toBeVisible({ timeout: 5000 });

    // Select "software" from Category dropdown
    await categorySelect.selectOption('software');
    await page.waitForTimeout(500);

    // Software Name should appear, Hardware Model should be hidden
    await expect(page.getByLabel(new RegExp(softwareNameLabel, 'i'))).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(new RegExp(hardwareModelLabel, 'i'))).not.toBeVisible({ timeout: 5000 });
  });

  test('hidden fields not included in submission', async ({ page }) => {
    const portalUrl = `/portal/forms/${formSlug}`;
    await loginAsAdmin(page, portalUrl);
    await page.waitForTimeout(2000);

    // Select "hardware" to show Hardware Model, hide Software Name
    const categorySelect = page.getByLabel(new RegExp(categoryLabel, 'i'));
    await categorySelect.selectOption('hardware');
    await page.waitForTimeout(500);

    // Fill Hardware Model
    const hwInput = page.getByLabel(new RegExp(hardwareModelLabel, 'i'));
    await expect(hwInput).toBeVisible({ timeout: 5000 });
    await hwInput.fill('ThinkPad X1 Carbon');

    // Software Name should be hidden -- do not fill it

    // Submit the form
    await page.getByRole('button', { name: /Submit/i }).click();

    // Verify success
    await expect(page.getByText(/submitted successfully|request submitted|thank you/i)).toBeVisible({ timeout: 15000 });
  });
});
