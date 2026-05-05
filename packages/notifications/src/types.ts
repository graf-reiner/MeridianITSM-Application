// Trigger names. Authoritative list — used by dispatcher, conditions, actions, and workflow engine.
export type NotificationTrigger =
  | 'TICKET_CREATED'
  | 'TICKET_ASSIGNED'
  | 'TICKET_COMMENTED'
  | 'TICKET_RESOLVED'
  | 'TICKET_UPDATED'
  | 'TICKET_APPROVAL_REQUESTED'
  | 'SLA_BREACH'
  | 'SLA_WARNING'
  | 'MAJOR_INCIDENT_DECLARED'
  | 'CERT_EXPIRY_WARNING';

// Re-export from conditions for backwards-compat with existing api callers.
export type { Condition, ConditionGroup, EventContext } from './conditions.js';
