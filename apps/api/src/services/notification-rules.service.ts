// ─── Notification Rules — api-side dispatcher wrapper ───────────────────────
// Fires workflow engine (api-only) AND notification rules (shared package).
// The actual rule evaluation and action execution live in @meridian/notifications.

import {
  dispatchNotificationEvent as sharedDispatch,
  type EventContext,
} from '@meridian/notifications';
import {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyTicketCommented,
  notifyTicketResolved,
  notifyTicketUpdated,
  notifyMajorIncidentDeclared,
} from './notification.service.js';
import { dispatchWorkflows } from './workflow-engine/index.js';

// Legacy fallback — delegates to per-trigger notify*() helpers in
// notification.service.ts. Called by the shared dispatcher when no
// NotificationRule rows match the trigger for the tenant.
async function fireLegacyNotification(
  tenantId: string,
  trigger: string,
  context: EventContext,
): Promise<void> {
  switch (trigger) {
    case 'TICKET_CREATED':
      if (context.ticket && context.actorId) {
        await notifyTicketCreated(tenantId, context.ticket as any, context.actorId);
      }
      break;
    case 'TICKET_ASSIGNED':
      if (context.ticket && context.newAssignedToId && context.actorId) {
        await notifyTicketAssigned(tenantId, context.ticket as any, context.newAssignedToId, context.actorId);
      }
      break;
    case 'TICKET_COMMENTED':
      if (context.ticket && context.comment && context.actorId) {
        await notifyTicketCommented(tenantId, context.ticket as any, context.comment as any, context.actorId);
      }
      break;
    case 'TICKET_RESOLVED':
      if (context.ticket && context.actorId) {
        await notifyTicketResolved(tenantId, context.ticket as any, context.actorId);
      }
      break;
    case 'TICKET_UPDATED':
      if (context.ticket && context.changedFields && context.actorId) {
        await notifyTicketUpdated(tenantId, context.ticket as any, context.changedFields, context.actorId);
      }
      break;
    case 'MAJOR_INCIDENT_DECLARED':
      if (context.ticket && context.coordinatorId && context.actorId) {
        await notifyMajorIncidentDeclared(tenantId, context.ticket as any, context.coordinatorId, context.actorId);
      }
      break;
    default:
      break;
  }
}

/**
 * api-side dispatch entry point. Fires user-built workflows (which still live
 * in this app), then delegates to the shared dispatcher for NotificationRule
 * actions and legacy fallback. NEVER throws.
 */
export async function dispatchNotificationEvent(
  tenantId: string,
  trigger: string,
  eventContext: EventContext,
): Promise<void> {
  // Workflow dispatch — apps/api-only until Phase 1.5.
  try { await dispatchWorkflows(tenantId, trigger, eventContext); }
  catch (err) { console.error('[notifications] workflow dispatch failed:', err); }

  await sharedDispatch(tenantId, trigger, eventContext, {
    legacyFallback: fireLegacyNotification,
  });
}

// Re-export shared cache helpers so existing api callers keep their imports.
export { loadRules, invalidateRulesCache } from '@meridian/notifications';
