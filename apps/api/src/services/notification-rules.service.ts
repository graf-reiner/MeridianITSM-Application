// ─── Notification Rules — api-side dispatcher wrapper ───────────────────────
// Thin wrapper around the shared dispatcher that injects the api's legacy
// per-trigger notify*() helpers as the legacyFallback. Workflow dispatch
// itself now lives in @meridian/notifications and fires automatically for both
// api- and worker-originated events.

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
 * api-side dispatch entry point. Delegates to the shared dispatcher (which
 * fires user-built workflows AND NotificationRule actions) and supplies the
 * api's legacy per-trigger helpers as the fallback when no rules exist.
 * NEVER throws.
 */
export async function dispatchNotificationEvent(
  tenantId: string,
  trigger: string,
  eventContext: EventContext,
): Promise<void> {
  await sharedDispatch(tenantId, trigger, eventContext, {
    legacyFallback: fireLegacyNotification,
  });
}

// Re-export shared cache helpers so existing api callers keep their imports.
export { loadRules, invalidateRulesCache } from '@meridian/notifications';
