import type { FastifyInstance } from 'fastify';
import { applicationRoutes } from './applications/index.js';
import { assetRoutes } from './assets/index.js';
import { billingPlanRoutes } from './billing-plan.js';
import { cabRoutes } from './cab/index.js';
import { changeRoutes } from './changes/index.js';
import { cmdbRoutes } from './cmdb/index.js';
import { cmdbReferenceRoutes } from './cmdb/reference.js';
import { cmdbGovernanceRoutes } from './cmdb/governance.js';
import { dashboardRoutes } from './dashboard/index.js';
import { emailAccountRoutes } from './email-accounts/index.js';
import { knowledgeRoutes } from './knowledge/index.js';
import { notificationRoutes } from './notifications/index.js';
import { pushRoutes } from './push/index.js';
import { reportRoutes } from './reports/index.js';
import { softwareInventoryReportRoutes } from './reports/software-installed.js';
import { ciSoftwareRoutes } from './cmdb/cis/[id]/software.js';
import { settingsRoutes } from './settings/index.js';
import { slaRoutes } from './sla/index.js';
import { ticketRoutes } from './tickets/index.js';
import { webhookRoutes } from './webhooks/index.js';
import { preferencesRoutes } from './preferences.js';
import { aiChatRoutes } from './ai-chat/index.js';
import { portalAiChatRoutes } from './portal-ai-chat/index.js';
import { cannedResponseRoutes } from './canned-responses/index.js';
import { surveyRoutes } from './surveys/index.js';
import { escalationPolicyRoutes } from './escalation-policies/index.js';
import { recurringTicketRoutes } from './recurring-tickets/index.js';
import { ticketTemplateRoutes } from './ticket-templates/index.js';
import { fieldDefinitionRoutes } from './field-definitions/index.js';
import { customFormRoutes } from './custom-forms/index.js';
import { profileRoutes } from './profile.js';
import { problemRoutes } from './problems/index.js';
import { searchRoutes } from './search.js';
import { changeTemplateRoutes } from './change-templates/index.js';
import { holidayRoutes } from './holidays/index.js';
import { notificationTemplateRoutes } from './notification-templates/index.js';

/**
 * V1 API routes — protected scope (requires JWT + tenant + RBAC).
 * Feature routes will be registered here in Phase 2+.
 */
export async function v1Routes(app: FastifyInstance): Promise<void> {
  // Placeholder — feature routes registered in later phases
  app.get('/api/v1/status', async () => ({
    status: 'ok',
    version: 'v1',
  }));

  // Billing plan endpoint — returns tenant's current plan tier, limits, and status
  await app.register(billingPlanRoutes);

  // Dashboard stats — ticket counts, volume charts, recent activity, SLA overdue
  await app.register(dashboardRoutes);

  // Reports — ticket/SLA/change CSV+JSON export, system health, scheduled reports
  await app.register(reportRoutes);

  // Phase 8 (CASR-03 / CRIT-5): license reporting endpoints.
  //   - GET /api/v1/reports/software-installed (reports.read; licenseKey OMITTED)
  //   - GET /api/v1/cmdb/cis/:id/software (cmdb.view; licenseKey INCLUDED)
  await app.register(softwareInventoryReportRoutes);
  await app.register(ciSoftwareRoutes);

  // Email account management — SMTP/IMAP configuration, connection testing, email-to-ticket
  await app.register(emailAccountRoutes);

  // Knowledge base — article CRUD, lifecycle, search, voting, view tracking
  await app.register(knowledgeRoutes);

  // Settings routes — user management, roles, groups, queues, categories, sites, vendors, etc.
  await app.register(settingsRoutes);

  // SLA policies — CRUD management and live ticket SLA status
  await app.register(slaRoutes);

  // Notification center — in-app notifications, unread count, mark-read, mark-all-read
  await app.register(notificationRoutes);

  // Ticket management — full ITSM ticket lifecycle: CRUD, comments, attachments, assignment,
  // KB/CI linking, audit trail
  await app.register(ticketRoutes);

  // Asset management — CRUD, status lifecycle, assignment to users and sites
  await app.register(assetRoutes);

  // CMDB — CI CRUD, relationships, impact analysis, categories
  await app.register(cmdbRoutes);
  await app.register(cmdbReferenceRoutes);
  await app.register(cmdbGovernanceRoutes);

  // Change management — lifecycle, approvals, scheduling, risk scoring, asset/app linking
  await app.register(changeRoutes);

  // CAB meetings — agenda, RSVP, iCal downloads, per-change outcomes
  await app.register(cabRoutes);

  // Application portfolio — CRUD, dependencies, documents, asset relationships
  await app.register(applicationRoutes);

  // Push notification device token registration (PUSH-02)
  await app.register(pushRoutes);

  // Webhook management — CRUD, test delivery endpoint (INTG-03, INTG-04, INTG-05)
  await app.register(webhookRoutes);

  // User preferences — theme, notification settings
  await app.register(preferencesRoutes);

  // AI Assistant — chat conversations with function-calling over ITSM data
  await app.register(aiChatRoutes);

  // Portal AI Assistant — governed chatbot for portal users (own tickets + published KB only)
  await app.register(portalAiChatRoutes);

  // Canned responses / quick replies for ticket comments
  await app.register(cannedResponseRoutes);

  // CSAT surveys — templates, responses, aggregate stats
  await app.register(surveyRoutes);

  // Escalation policies — multi-level escalation rules linked to SLAs
  await app.register(escalationPolicyRoutes);

  // Recurring tickets — cron-scheduled ticket creation
  await app.register(recurringTicketRoutes);

  // Ticket templates — form-builder with custom fields, conditions, sections
  await app.register(ticketTemplateRoutes);

  // Field definitions — reusable field library for custom forms
  await app.register(fieldDefinitionRoutes);

  // Custom forms — form builder, portal rendering, submission → ticket creation
  await app.register(customFormRoutes);

  // Self-service user profile — read/update own profile without admin permissions
  await app.register(profileRoutes);

  // Problem management — list, detail, incident linking, root cause tracking
  await app.register(problemRoutes);

  // Global search — FTS across tickets, KB articles, comments, documents
  await app.register(searchRoutes);

  // Change templates — reusable change request templates with default fields
  await app.register(changeTemplateRoutes);

  // Holiday calendar — date-based SLA exclusions (skipped from business hours)
  await app.register(holidayRoutes);

  // Notification templates — tenant-authored reusable templates (email, telegram, slack, teams, discord)
  await app.register(notificationTemplateRoutes);
}
