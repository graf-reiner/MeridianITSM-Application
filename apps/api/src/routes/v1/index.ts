import type { FastifyInstance } from 'fastify';
import { applicationRoutes } from './applications/index.js';
import { assetRoutes } from './assets/index.js';
import { billingPlanRoutes } from './billing-plan.js';
import { cabRoutes } from './cab/index.js';
import { changeRoutes } from './changes/index.js';
import { cmdbRoutes } from './cmdb/index.js';
import { dashboardRoutes } from './dashboard/index.js';
import { emailAccountRoutes } from './email-accounts/index.js';
import { knowledgeRoutes } from './knowledge/index.js';
import { notificationRoutes } from './notifications/index.js';
import { pushRoutes } from './push/index.js';
import { reportRoutes } from './reports/index.js';
import { settingsRoutes } from './settings/index.js';
import { slaRoutes } from './sla/index.js';
import { ticketRoutes } from './tickets/index.js';
import { webhookRoutes } from './webhooks/index.js';

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
}
