import type { FastifyInstance } from 'fastify';
import { billingPlanRoutes } from './billing-plan.js';
import { emailAccountRoutes } from './email-accounts/index.js';
import { knowledgeRoutes } from './knowledge/index.js';
import { notificationRoutes } from './notifications/index.js';
import { settingsRoutes } from './settings/index.js';
import { slaRoutes } from './sla/index.js';
import { ticketRoutes } from './tickets/index.js';

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
}
