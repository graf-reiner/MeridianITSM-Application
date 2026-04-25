import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Custom Forms Ticket Mapping', () => {
  test.describe.configure({ mode: 'serial' });

  let formName: string;
  let formSlug: string;
  let formId: string;

  // Field labels
  let subjectLabel: string;
  let detailsLabel: string;
  let urgencyLabel: string;

  // Instance IDs for mapping
  let instSubject: string;
  let instDetails: string;
  let instUrgency: string;

  let ticketNumber: string;

  test('setup: create fields, form, configure mapping via API', async ({ page, request }) => {
    formName = uniqueName('map-form');
    formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    subjectLabel = uniqueName('Subject');
    detailsLabel = uniqueName('Details');
    urgencyLabel = uniqueName('Urgency');

    const subjectKey = subjectLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');
    const detailsKey = detailsLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');
    const urgencyKey = urgencyLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');

    // Create "Subject" text field
    const subRes = await request.post('/api/v1/field-definitions', {
      data: { label: subjectLabel, key: subjectKey, fieldType: 'text', required: false },
    });
    expect(subRes.ok()).toBeTruthy();
    const subDef = await subRes.json();

    // Create "Details" textarea field
    const detRes = await request.post('/api/v1/field-definitions', {
      data: { label: detailsLabel, key: detailsKey, fieldType: 'textarea', required: false },
    });
    expect(detRes.ok()).toBeTruthy();
    const detDef = await detRes.json();

    // Create "Urgency" select field
    const urgRes = await request.post('/api/v1/field-definitions', {
      data: {
        label: urgencyLabel, key: urgencyKey, fieldType: 'select', required: false,
        optionsJson: [
          { label: 'High', value: 'high' },
          { label: 'Medium', value: 'medium' },
          { label: 'Low', value: 'low' },
        ],
      },
    });
    expect(urgRes.ok()).toBeTruthy();
    const urgDef = await urgRes.json();

    // Create form via API
    const formRes = await request.post('/api/v1/custom-forms', {
      data: { name: formName, slug: formSlug, ticketType: 'INCIDENT' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;

    // Build layout with mapping
    instSubject = `inst_subj_${Date.now()}`;
    instDetails = `inst_det_${Date.now() + 1}`;
    instUrgency = `inst_urg_${Date.now() + 2}`;

    const patchRes = await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: {
        layoutJson: {
          sections: [{
            id: 'section_1',
            title: 'Incident Details',
            description: '',
            fields: [
              {
                instanceId: instSubject,
                fieldDefinitionId: subDef.id,
                key: subDef.key ?? subjectKey,
                label: subDef.label ?? subjectLabel,
                fieldType: 'text',
                labelOverride: subjectLabel,
                placeholderOverride: null,
                helpTextOverride: null,
                requiredOverride: false,
              },
              {
                instanceId: instDetails,
                fieldDefinitionId: detDef.id,
                key: detDef.key ?? detailsKey,
                label: detDef.label ?? detailsLabel,
                fieldType: 'textarea',
                labelOverride: detailsLabel,
                placeholderOverride: null,
                helpTextOverride: null,
                requiredOverride: false,
              },
              {
                instanceId: instUrgency,
                fieldDefinitionId: urgDef.id,
                key: urgDef.key ?? urgencyKey,
                label: urgDef.label ?? urgencyLabel,
                fieldType: 'select',
                labelOverride: urgencyLabel,
                placeholderOverride: null,
                helpTextOverride: null,
                requiredOverride: false,
              },
            ],
          }],
        },
        mappingJson: {
          title: instSubject,
          description: instDetails,
          priority: null,
          category: null,
          type: null,
          titleTemplate: '',
          descriptionTemplate: '',
        },
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Publish via API
    const publishRes = await request.post(`/api/v1/custom-forms/${formId}/publish`);
    expect(publishRes.ok()).toBeTruthy();

    // Quick verification
    await loginAsAdmin(page, `/portal/forms/${formSlug}`);
    await expect(page.locator('h1', { hasText: formName })).toBeVisible({ timeout: 15000 });
  });

  test('submit form via portal', async ({ page }) => {
    const portalUrl = `/portal/forms/${formSlug}`;
    await loginAsAdmin(page, portalUrl);
    await page.waitForTimeout(2000);

    // Fill Subject
    const subjectInput = page.getByLabel(new RegExp(subjectLabel, 'i'));
    await expect(subjectInput).toBeVisible({ timeout: 5000 });
    await subjectInput.fill('Laptop Issue');

    // Fill Details
    const detailsInput = page.getByLabel(new RegExp(detailsLabel, 'i'));
    await expect(detailsInput).toBeVisible({ timeout: 5000 });
    await detailsInput.fill('Screen broken');

    // Select Urgency
    const urgencySelect = page.getByLabel(new RegExp(urgencyLabel, 'i'));
    await expect(urgencySelect).toBeVisible({ timeout: 5000 });
    await urgencySelect.selectOption('high');

    // Submit
    await page.getByRole('button', { name: /Submit/i }).click();

    // Verify success with ticket number
    await expect(page.getByText(/submitted successfully|request submitted|thank you/i)).toBeVisible({ timeout: 15000 });

    // Capture ticket number (TKT-XXX)
    const ticketText = page.locator('text=/TKT-\\d+/');
    await expect(ticketText).toBeVisible({ timeout: 10000 });
    const ticketContent = await ticketText.textContent();
    const match = ticketContent?.match(/TKT-\d+/);
    expect(match).toBeTruthy();
    ticketNumber = match![0];
  });

  test('verify success page shows ticket number', async ({ page }) => {
    // ticketNumber was captured in the previous test
    expect(ticketNumber).toBeTruthy();
    expect(ticketNumber).toMatch(/^TKT-\d+$/);
  });

  test('navigate to ticket and verify data', async ({ page }) => {
    const portalUrl = `/portal/forms/${formSlug}`;
    await loginAsAdmin(page, portalUrl);
    await page.waitForTimeout(2000);

    // Fill and submit again to get to the success page with the View Ticket link
    const subjectInput = page.getByLabel(new RegExp(subjectLabel, 'i'));
    await subjectInput.fill('Laptop Issue Verify');
    const detailsInput = page.getByLabel(new RegExp(detailsLabel, 'i'));
    await detailsInput.fill('Screen broken verify');
    const urgencySelect = page.getByLabel(new RegExp(urgencyLabel, 'i'));
    await urgencySelect.selectOption('high');
    await page.getByRole('button', { name: /Submit/i }).click();
    await expect(page.getByText(/submitted successfully|request submitted|thank you/i)).toBeVisible({ timeout: 15000 });

    // Look for a "View Ticket" link
    const viewTicketLink = page.getByRole('link', { name: /view ticket|view request/i });
    if (await viewTicketLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewTicketLink.click();
      await page.waitForTimeout(3000);

      // Verify we are on a ticket page and the title contains our subject
      await expect(page.getByText(/Laptop Issue/i)).toBeVisible({ timeout: 10000 });
    } else {
      // Navigate directly to dashboard tickets and search
      await loginAsAdmin(page, '/dashboard/tickets');
      await page.waitForTimeout(3000);

      // Look for a ticket with our subject text
      await expect(page.getByText(/Laptop Issue/i).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('ticket was created with correct data', async ({ page }) => {
    // Navigate to tickets list and verify the ticket exists
    await loginAsAdmin(page, '/dashboard/tickets');
    await page.waitForTimeout(3000);

    // Look for ticket with our subject
    const ticketRow = page.locator('tr, [data-testid*="ticket"]').filter({ hasText: /Laptop Issue/i }).first();
    await expect(ticketRow).toBeVisible({ timeout: 10000 });

    // Click to open
    await ticketRow.click();
    await page.waitForTimeout(3000);

    // Verify ticket page loaded with relevant data
    await expect(page.getByText(/Laptop Issue/i).first()).toBeVisible({ timeout: 10000 });
  });
});
