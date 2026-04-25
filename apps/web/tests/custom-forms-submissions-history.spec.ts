import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Custom Forms Submissions History', () => {
  test.describe.configure({ mode: 'serial' });

  let formName: string;
  let formSlug: string;
  let formId: string;
  let fieldLabel: string;
  let fieldValue: string;
  let ticketNumber: string;

  test('setup: create form, publish, and submit via portal', async ({ page, request }) => {
    formName = uniqueName('sub-hist');
    formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    fieldLabel = uniqueName('HistField');
    fieldValue = 'Submission history test value ' + Date.now();

    const fieldKey = fieldLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');

    // Create text field via API
    const fieldRes = await request.post('/api/v1/field-definitions', {
      data: { label: fieldLabel, key: fieldKey, fieldType: 'text', required: false },
    });
    expect(fieldRes.ok()).toBeTruthy();
    const fieldDef = await fieldRes.json();

    // Create form via API
    const formRes = await request.post('/api/v1/custom-forms', {
      data: { name: formName, slug: formSlug, ticketType: 'SERVICE_REQUEST' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;

    // Set layout with section and field via PATCH
    const instanceId = `inst_${Date.now()}`;
    const patchRes = await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: {
        layoutJson: {
          sections: [{
            id: 'section_1',
            title: 'Details',
            description: '',
            fields: [{
              instanceId,
              fieldDefinitionId: fieldDef.id,
              key: fieldDef.key ?? fieldKey,
              label: fieldDef.label ?? fieldLabel,
              fieldType: 'text',
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

    // Publish via API
    const publishRes = await request.post(`/api/v1/custom-forms/${formId}/publish`);
    expect(publishRes.ok()).toBeTruthy();

    // Submit the form via portal UI
    const portalUrl = `/portal/forms/${formSlug}`;
    await loginAsAdmin(page, portalUrl);
    await page.waitForTimeout(2000);

    // Fill the field
    const fieldInput = page.getByLabel(new RegExp(fieldLabel, 'i'));
    if (await fieldInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fieldInput.fill(fieldValue);
    } else {
      // Fallback: fill the first text input on the form
      const textInputs = page.locator('input[type="text"]');
      await textInputs.first().fill(fieldValue);
    }

    // Submit
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText(/submitted successfully|request submitted|thank you/i)).toBeVisible({ timeout: 15000 });

    // Capture ticket number
    const ticketText = page.locator('text=/TKT-\\d+/');
    if (await ticketText.isVisible({ timeout: 5000 }).catch(() => false)) {
      const content = await ticketText.textContent();
      const match = content?.match(/TKT-\d+/);
      if (match) ticketNumber = match[0];
    }
  });

  test('submissions page loads with table', async ({ page }) => {
    const submissionsUrl = `/dashboard/settings/custom-forms/${formId}/submissions`;
    await loginAsAdmin(page, submissionsUrl);
    await page.waitForTimeout(3000);

    // Verify table headers are visible
    await expect(page.getByText('Date').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Submitted By/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Ticket').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Status').first()).toBeVisible({ timeout: 10000 });
  });

  test('submission row appears with COMPLETED status', async ({ page }) => {
    const submissionsUrl = `/dashboard/settings/custom-forms/${formId}/submissions`;
    await loginAsAdmin(page, submissionsUrl);
    await page.waitForTimeout(3000);

    // Verify at least one row exists
    const tableRows = page.locator('tbody tr, [data-testid="submission-row"]');
    await expect(tableRows.first()).toBeVisible({ timeout: 10000 });

    // Verify COMPLETED status badge
    await expect(page.getByText('COMPLETED').first()).toBeVisible({ timeout: 10000 });
  });

  test('ticket link visible in submission row', async ({ page }) => {
    const submissionsUrl = `/dashboard/settings/custom-forms/${formId}/submissions`;
    await loginAsAdmin(page, submissionsUrl);
    await page.waitForTimeout(3000);

    // Verify TKT- text is present in the submissions table
    await expect(page.locator('text=/TKT-\\d+/').first()).toBeVisible({ timeout: 10000 });
  });

  test('click row shows submission detail', async ({ page }) => {
    const submissionsUrl = `/dashboard/settings/custom-forms/${formId}/submissions`;
    await loginAsAdmin(page, submissionsUrl);
    await page.waitForTimeout(3000);

    // Click the first submission row
    const firstRow = page.locator('tbody tr, [data-testid="submission-row"]').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await page.waitForTimeout(2000);

    // Verify a detail modal or expanded view appears showing the submitted values
    const detailVisible = await page.getByText(fieldValue).isVisible({ timeout: 5000 }).catch(() => false);
    const labelVisible = await page.getByText(fieldLabel).isVisible({ timeout: 3000 }).catch(() => false);
    const modalVisible = await page.locator('[role="dialog"], .modal, [data-testid="submission-detail"]').isVisible({ timeout: 3000 }).catch(() => false);

    // At least one of these should be true
    expect(detailVisible || labelVisible || modalVisible).toBeTruthy();
  });
});
