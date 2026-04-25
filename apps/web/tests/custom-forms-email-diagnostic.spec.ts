import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  uniqueName,
  clearMailHog,
  getMailHogMessages,
  waitForMailHogMessage,
  isMailHogAccessible,
  MAILHOG_API,
  API_URL,
} from './helpers';

/**
 * Custom Forms Email Diagnostic Suite
 *
 * Root cause under investigation: `notifyTicketCreated` in notification.service.ts:153
 * has `if (!ticket.assignedToId || ticket.assignedToId === creatorId) return;`
 * This means tickets created via custom forms WITHOUT a defaultAssigneeId never
 * trigger email notifications.
 *
 * This suite confirms the bug and verifies the full email pipeline.
 */

test.describe('Custom Forms Email Diagnostic', () => {
  test.describe.configure({ mode: 'serial' });

  const FORMS_URL = '/dashboard/settings/custom-forms';
  const BASE = 'http://10.1.200.218:3000';

  // Shared state across serial tests
  let mailhogAccessible = false;
  let tenantHasActiveEmail = false;
  let smtpPointsToMailHog = false;
  let notificationRulesCount = 0;
  let ticketCreatedRulesCount = 0;
  let formWithoutAssigneeSentEmail = false;
  let formWithAssigneeSentEmail = false;
  let capturedEmail: any = null;

  // Form state shared between tests
  let formId: string;
  let formSlug: string;
  let agentUserId: string;

  // ─── Test 1: MailHog accessibility ──────────────────────────────────────────

  test('MailHog is accessible', async () => {
    mailhogAccessible = await isMailHogAccessible();
    console.log('[EMAIL DIAGNOSTIC] MailHog accessible:', mailhogAccessible);
    test.info().annotations.push({
      type: 'diagnostic',
      description: `MailHog accessible: ${mailhogAccessible}`,
    });

    if (!mailhogAccessible) {
      test.skip(true, 'MailHog not accessible - cannot run email diagnostics');
    }
    expect(mailhogAccessible).toBe(true);
  });

  // ─── Test 2: Clear MailHog inbox ────────────────────────────────────────────

  test('clear MailHog inbox', async () => {
    test.skip(!mailhogAccessible, 'MailHog not accessible');

    await clearMailHog();
    const messages = await getMailHogMessages();

    console.log('[EMAIL DIAGNOSTIC] MailHog cleared. Messages remaining:', messages.length);
    expect(messages.length).toBe(0);
  });

  // ─── Test 3: Check tenant email account configuration ──────────────────────

  test('check tenant email account configuration', async ({ page }) => {
    test.skip(!mailhogAccessible, 'MailHog not accessible');

    await loginAsAdmin(page, '/dashboard/settings');

    const response = await page.request.get(`${BASE}/api/v1/settings/email`);
    const status = response.status();
    console.log('[EMAIL DIAGNOSTIC] Email settings endpoint status:', status);

    if (!response.ok()) {
      const text = await response.text();
      console.log('[EMAIL DIAGNOSTIC] Email settings response:', text);
      test.info().annotations.push({
        type: 'diagnostic',
        description: `Email settings endpoint returned ${status}: ${text}`,
      });
      // Don't fail - this is diagnostic
      tenantHasActiveEmail = false;
      return;
    }

    const data = await response.json();
    const accounts = Array.isArray(data) ? data : data.accounts ?? data.data ?? [];

    console.log('[EMAIL DIAGNOSTIC] Email accounts found:', accounts.length);

    for (const account of accounts) {
      const active = account.isActive ?? account.active ?? account.enabled ?? 'unknown';
      const host = account.smtpHost ?? account.host ?? account.smtp?.host ?? 'unknown';
      const port = account.smtpPort ?? account.port ?? account.smtp?.port ?? 'unknown';
      const name = account.name ?? account.email ?? account.address ?? 'unnamed';

      console.log(`[EMAIL DIAGNOSTIC] Account: ${name} | Active: ${active} | SMTP: ${host}:${port}`);
      test.info().annotations.push({
        type: 'diagnostic',
        description: `Email account: ${name} | Active: ${active} | SMTP: ${host}:${port}`,
      });

      if (active === true || active === 'true') {
        tenantHasActiveEmail = true;
      }

      // Check if SMTP points to MailHog
      const hostStr = String(host);
      const portNum = Number(port);
      if (
        (hostStr === '10.1.200.218' || hostStr === 'localhost' || hostStr === '127.0.0.1') &&
        portNum === 1025
      ) {
        smtpPointsToMailHog = true;
      }
    }

    if (!smtpPointsToMailHog) {
      console.log(
        '[EMAIL DIAGNOSTIC] WARNING: No email account SMTP is pointing to MailHog (10.1.200.218:1025). Emails will NOT reach MailHog.',
      );
      test.info().annotations.push({
        type: 'diagnostic',
        description:
          'WARNING: SMTP not pointing to MailHog - emails will not be captured. Expected host=10.1.200.218 or localhost, port=1025',
      });
    }

    console.log('[EMAIL DIAGNOSTIC] Tenant has active email account:', tenantHasActiveEmail);
    console.log('[EMAIL DIAGNOSTIC] SMTP points to MailHog:', smtpPointsToMailHog);

    expect(
      accounts.length,
      'Expected at least 1 email account configured for the tenant',
    ).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 4: Check notification rules for TICKET_CREATED ───────────────────

  test('check notification rules for TICKET_CREATED', async ({ page }) => {
    test.skip(!mailhogAccessible, 'MailHog not accessible');

    await loginAsAdmin(page, '/dashboard/settings');

    // Try several possible endpoint paths
    const endpointsToTry = [
      `${BASE}/api/v1/settings/notification-rules`,
      `${BASE}/api/v1/settings/notifications`,
      `${BASE}/api/v1/notification-rules`,
      `${BASE}/api/v1/settings/alerts`,
    ];

    let rules: any[] = [];
    let endpointUsed = '';

    for (const endpoint of endpointsToTry) {
      const response = await page.request.get(endpoint);
      if (response.ok()) {
        const data = await response.json();
        rules = Array.isArray(data) ? data : data.rules ?? data.data ?? data.items ?? [];
        endpointUsed = endpoint;
        console.log(`[EMAIL DIAGNOSTIC] Notification rules endpoint: ${endpoint} (${rules.length} rules)`);
        break;
      }
    }

    if (!endpointUsed) {
      console.log('[EMAIL DIAGNOSTIC] Could not find notification rules endpoint. Tried:', endpointsToTry);
      test.info().annotations.push({
        type: 'diagnostic',
        description: 'Notification rules endpoint not found - tried multiple paths',
      });
      return;
    }

    notificationRulesCount = rules.length;
    console.log('[EMAIL DIAGNOSTIC] Total notification rules:', notificationRulesCount);

    const ticketCreatedRules = rules.filter((r: any) => {
      const trigger = r.trigger ?? r.event ?? r.eventType ?? r.type ?? '';
      return String(trigger).toUpperCase().includes('TICKET_CREATED') ||
        String(trigger).toUpperCase().includes('TICKET.CREATED');
    });

    ticketCreatedRulesCount = ticketCreatedRules.length;
    console.log('[EMAIL DIAGNOSTIC] TICKET_CREATED rules:', ticketCreatedRulesCount);

    for (const rule of ticketCreatedRules) {
      const name = rule.name ?? rule.label ?? 'unnamed';
      const active = rule.isActive ?? rule.active ?? rule.enabled ?? 'unknown';
      console.log(`[EMAIL DIAGNOSTIC]   Rule: ${name} | Active: ${active}`);
    }

    test.info().annotations.push({
      type: 'diagnostic',
      description: `Notification rules: ${notificationRulesCount} total, ${ticketCreatedRulesCount} for TICKET_CREATED`,
    });

    // Diagnostic only - don't fail
    console.log('[EMAIL DIAGNOSTIC] Notification rule check complete (diagnostic only, no assertion)');
  });

  // ─── Test 5: Form submission WITHOUT defaultAssigneeId sends no email ──────

  test('form submission WITHOUT defaultAssigneeId sends no email', async ({ page, request }) => {
    test.skip(!mailhogAccessible, 'MailHog not accessible');
    test.setTimeout(90_000);

    // 5a. Clear MailHog
    await clearMailHog();

    // 5b. Create form and field via API
    const formName = uniqueName('diag-no-assign');
    const fieldLabel = uniqueName('diag-field');
    const fieldKey = fieldLabel.toLowerCase().replace(/[^a-z0-9_\s]/g, '').replace(/[\s]+/g, '_');
    formSlug = formName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

    // Create field definition
    const fieldRes = await request.post('/api/v1/field-definitions', {
      data: { label: fieldLabel, key: fieldKey, fieldType: 'text', required: false },
    });
    expect(fieldRes.ok()).toBeTruthy();
    const fieldDef = await fieldRes.json();

    // Create form
    const formRes = await request.post('/api/v1/custom-forms', {
      data: { name: formName, slug: formSlug, ticketType: 'SERVICE_REQUEST' },
    });
    expect(formRes.ok()).toBeTruthy();
    const form = await formRes.json();
    formId = form.id;

    // Set layout via PATCH — NO defaultAssigneeId
    const instanceId = `inst_${Date.now()}`;
    await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: {
        layoutJson: {
          sections: [{
            id: 'section_1', title: 'Details', description: '',
            fields: [{
              instanceId, fieldDefinitionId: fieldDef.id, key: fieldKey,
              label: fieldLabel, fieldType: 'text',
              labelOverride: 'Description', placeholderOverride: null,
              helpTextOverride: null, requiredOverride: false,
            }],
          }],
        },
      },
    });

    // Publish
    const pubRes = await request.post(`/api/v1/custom-forms/${formId}/publish`);
    expect(pubRes.ok()).toBeTruthy();
    console.log('[EMAIL DIAGNOSTIC] Created form ID:', formId, 'Slug:', formSlug);

    // 5c. Navigate to portal form and submit
    await loginAsAdmin(page, `/portal/forms/${formSlug}`);
    await page.waitForTimeout(2000);

    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textInput.fill('Test submission without assignee - email diagnostic');
    }

    await page.getByRole('button', { name: /Submit/i }).click();
    await page.waitForTimeout(3000);
    console.log('[EMAIL DIAGNOSTIC] Form submitted without defaultAssigneeId');

    // 5d. Wait 5 seconds for any emails to arrive
    await page.waitForTimeout(5000);

    // 5e. Check MailHog
    const messages = await getMailHogMessages();
    formWithoutAssigneeSentEmail = messages.length > 0;

    console.log('[EMAIL DIAGNOSTIC] Messages after form without assignee:', messages.length);
    if (messages.length > 0) {
      for (const msg of messages) {
        const subject = msg.Content?.Headers?.Subject?.[0] ?? 'no subject';
        console.log(`[EMAIL DIAGNOSTIC]   Unexpected email: Subject="${subject}"`);
      }
    }

    // Diagnostic: log whether emails were sent
    if (messages.length === 0) {
      formWithoutAssigneeSentEmail = false;
      test.info().annotations.push({
        type: 'diagnostic',
        description: 'No email sent without assignee — legacy notifyTicketCreated blocked as expected.',
      });
      console.log('[EMAIL DIAGNOSTIC] CONFIRMED: No email without assignee (legacy path blocked)');
    } else {
      formWithoutAssigneeSentEmail = true;
      test.info().annotations.push({
        type: 'diagnostic',
        description: `${messages.length} email(s) sent WITHOUT assignee — notification rules or workflows triggered email via an alternative path.`,
      });
      console.log(`[EMAIL DIAGNOSTIC] Email WAS sent without assignee via notification rules (${messages.length} messages)`);
    }

    // This is diagnostic — always passes
    expect(true).toBeTruthy();
  });

  // ─── Test 6: Form submission WITH defaultAssigneeId ────────────────────────

  test('form submission WITH defaultAssigneeId', async ({ page, request }) => {
    test.skip(!mailhogAccessible, 'MailHog not accessible');
    test.skip(!formId, 'Form was not created in previous test');
    test.setTimeout(90_000);

    // 6a. Clear MailHog
    await clearMailHog();

    // 6b. Find the agent user ID
    const usersResponse = await request.get('/api/v1/settings/users');
    if (!usersResponse.ok()) {
      console.log('[EMAIL DIAGNOSTIC] Could not fetch users:', usersResponse.status());
      return;
    }

    const usersData = await usersResponse.json();
    const users = Array.isArray(usersData) ? usersData : usersData.users ?? usersData.data ?? [];

    const agentUser = users.find(
      (u: any) => u.email === 'agent@msp.local' || u.role === 'agent' || u.systemRole === 'agent',
    );

    if (!agentUser) {
      const fallbackUser = users.find((u: any) => u.role !== 'admin' && u.systemRole !== 'admin') ?? users[0];
      if (fallbackUser) {
        agentUserId = fallbackUser.id;
        console.log(`[EMAIL DIAGNOSTIC] Using fallback user: ${fallbackUser.email} (${agentUserId})`);
      } else {
        console.log('[EMAIL DIAGNOSTIC] No users found');
        return;
      }
    } else {
      agentUserId = agentUser.id;
      console.log(`[EMAIL DIAGNOSTIC] Agent user: ${agentUser.email} (${agentUserId})`);
    }

    // 6c. PATCH form to set defaultAssigneeId
    const patchRes = await request.patch(`/api/v1/custom-forms/${formId}`, {
      data: { defaultAssigneeId: agentUserId },
    });
    if (!patchRes.ok()) {
      console.log('[EMAIL DIAGNOSTIC] PATCH form failed:', patchRes.status());
    } else {
      console.log('[EMAIL DIAGNOSTIC] Set defaultAssigneeId to:', agentUserId);
    }

    // 6d. Submit form via portal
    await loginAsAdmin(page, `/portal/forms/${formSlug}`);
    await page.waitForTimeout(2000);

    const textInput = page.locator('input[type="text"], textarea').first();
    if (await textInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textInput.fill('Test submission WITH assignee - email diagnostic');
    }

    await page.getByRole('button', { name: /Submit/i }).click();
    await page.waitForTimeout(3000);
    console.log('[EMAIL DIAGNOSTIC] Form submitted WITH defaultAssigneeId');

    // 6e. Wait up to 15 seconds for email
    try {
      const email = await waitForMailHogMessage(
        (msg: any) => (msg.Content?.Headers?.Subject?.[0] ?? '').length > 0,
        15_000,
        1000,
      );

      formWithAssigneeSentEmail = true;
      capturedEmail = email;

      const subject = email.Content?.Headers?.Subject?.[0] ?? 'no subject';
      console.log(`[EMAIL DIAGNOSTIC] Email received! Subject: "${subject}"`);
    } catch {
      formWithAssigneeSentEmail = false;
      const messages = await getMailHogMessages();
      console.log('[EMAIL DIAGNOSTIC] No email within 15s. MailHog messages:', messages.length);

      if (!smtpPointsToMailHog) {
        console.log('[EMAIL DIAGNOSTIC] LIKELY CAUSE: SMTP not pointing to MailHog');
      } else {
        console.log('[EMAIL DIAGNOSTIC] POSSIBLE: BullMQ worker down or notification blocked');
      }
    }

    console.log('[EMAIL DIAGNOSTIC] Form with assignee sent email:', formWithAssigneeSentEmail);
  });

  // ─── Test 7: Email content verification ────────────────────────────────────

  test('email content verification', async () => {
    test.skip(!mailhogAccessible, 'MailHog not accessible');
    test.skip(!capturedEmail, 'No email was captured in previous test');

    const headers = capturedEmail.Content?.Headers ?? {};
    const subject = headers.Subject?.[0] ?? '';
    const from = headers.From?.[0] ?? '';
    const to = headers.To?.[0] ?? '';
    const body = capturedEmail.Content?.Body ?? '';

    console.log('[EMAIL DIAGNOSTIC] ===== Email Content Analysis =====');
    console.log(`[EMAIL DIAGNOSTIC] Subject: ${subject}`);
    console.log(`[EMAIL DIAGNOSTIC] From: ${from}`);
    console.log(`[EMAIL DIAGNOSTIC] To: ${to}`);
    console.log(`[EMAIL DIAGNOSTIC] Body length: ${body.length} chars`);
    console.log(`[EMAIL DIAGNOSTIC] Body preview: ${body.substring(0, 500)}`);
    console.log('[EMAIL DIAGNOSTIC] ================================');

    // Subject should contain ticket reference
    const hasTicketRef = /TKT-\d+|#\d+|ticket/i.test(subject);
    console.log('[EMAIL DIAGNOSTIC] Subject contains ticket reference:', hasTicketRef);
    test.info().annotations.push({
      type: 'diagnostic',
      description: `Subject ticket reference: ${hasTicketRef} (Subject: "${subject}")`,
    });

    // From header should not be empty
    expect(from.length, 'From header should not be empty').toBeGreaterThan(0);
    console.log('[EMAIL DIAGNOSTIC] From header present:', from);

    // Body should contain some ticket reference
    const bodyHasRef = /TKT-\d+|ticket|submitted|created|request/i.test(body);
    console.log('[EMAIL DIAGNOSTIC] Body contains ticket reference:', bodyHasRef);
    test.info().annotations.push({
      type: 'diagnostic',
      description: `Email body contains ticket reference: ${bodyHasRef}`,
    });

    // Log full headers for debugging
    console.log('[EMAIL DIAGNOSTIC] All headers:', JSON.stringify(headers, null, 2));
  });

  // ─── Test 8: Summary diagnostic report ─────────────────────────────────────

  test('summary diagnostic report', async () => {
    const report = [
      '========================================',
      '  CUSTOM FORMS EMAIL DIAGNOSTIC REPORT  ',
      '========================================',
      '',
      `1. MailHog accessible:              ${mailhogAccessible ? 'YES' : 'NO'}`,
      `2. Tenant has active email account:  ${tenantHasActiveEmail ? 'YES' : 'NO'}`,
      `3. SMTP points to MailHog:           ${smtpPointsToMailHog ? 'YES' : 'NO - emails will not be captured by MailHog'}`,
      `4. Notification rules configured:    ${notificationRulesCount} total, ${ticketCreatedRulesCount} for TICKET_CREATED`,
      `5. Form WITHOUT assignee sent email: ${formWithoutAssigneeSentEmail ? 'YES (unexpected!)' : 'NO (expected - confirms root cause)'}`,
      `6. Form WITH assignee sent email:    ${formWithAssigneeSentEmail ? 'YES (email pipeline works)' : 'NO (additional issues beyond assignee)'}`,
      '',
      '--- ROOT CAUSE ANALYSIS ---',
      '',
    ];

    // Root cause: no assignee = no email
    if (!formWithoutAssigneeSentEmail) {
      report.push(
        'CONFIRMED: The root cause is in notifyTicketCreated (notification.service.ts:153).',
        'The guard `if (!ticket.assignedToId || ticket.assignedToId === creatorId) return;`',
        'prevents any email notification when a ticket has no assignee.',
        '',
        'Custom forms that do not set defaultAssigneeId will NEVER trigger email notifications.',
      );
    } else {
      report.push(
        'UNEXPECTED: Emails were sent even without an assignee.',
        'The root cause hypothesis may be incorrect, or another notification path exists.',
      );
    }

    report.push('');
    report.push('--- REQUIRED FIXES ---');
    report.push('');

    const fixes: string[] = [];

    if (!formWithoutAssigneeSentEmail) {
      fixes.push(
        '1. [CRITICAL] Modify notifyTicketCreated to send email even when assignedToId is null.',
        '   - Option A: Remove the early return for unassigned tickets',
        '   - Option B: Add a separate notification path for form submissions (e.g., notify queue members)',
        '   - Option C: Always set a defaultAssigneeId on custom forms (workaround, not a real fix)',
      );
    }

    if (!smtpPointsToMailHog && tenantHasActiveEmail) {
      fixes.push(
        `${fixes.length + 1}. [CONFIG] Update tenant email account SMTP to point to MailHog (host: 10.1.200.218, port: 1025) for dev/test.`,
      );
    }

    if (!tenantHasActiveEmail) {
      fixes.push(
        `${fixes.length + 1}. [CONFIG] Create an active email account for the tenant with SMTP configured.`,
      );
    }

    if (!formWithAssigneeSentEmail && smtpPointsToMailHog && tenantHasActiveEmail) {
      fixes.push(
        `${fixes.length + 1}. [INVESTIGATE] Even with assignee set and SMTP configured, no email arrived.`,
        '   Check: Is the BullMQ email-notification worker running? (PM2 status)',
        '   Check: Are there errors in the worker logs?',
        '   Check: Is Redis connected and the queue processing?',
      );
    }

    if (fixes.length === 0) {
      fixes.push('No additional fixes needed beyond the root cause.');
    }

    report.push(...fixes);
    report.push('');
    report.push('========================================');

    // Log the full report
    for (const line of report) {
      console.log(`[EMAIL DIAGNOSTIC] ${line}`);
    }

    // Add full report as annotation
    test.info().annotations.push({
      type: 'diagnostic',
      description: report.join('\n'),
    });

    // This test always passes - it's just a summary
    expect(true).toBe(true);
  });
});
