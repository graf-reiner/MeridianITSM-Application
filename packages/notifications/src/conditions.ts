// ─── Notification Rules — Condition Evaluator ────────────────────────────────
// Evaluates condition groups attached to notification rules.
// Groups use OR logic (any group match = pass); conditions within a group use
// AND logic (all must match). Also provides a simple template renderer for
// notification message interpolation.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Condition {
  field: string;
  operator: string;
  value: unknown;
}

export interface ConditionGroup {
  conditions: Condition[];
}

export interface EventContext {
  ticket?: {
    id: string;
    ticketNumber: number;
    title: string;
    type: string;
    priority: string;
    status: string;
    queueId?: string | null;
    categoryId?: string | null;
    assignedToId?: string | null;
    assignedGroupId?: string | null;
    requestedById?: string | null;
    slaId?: string | null;
    slaBreachAt?: string | null;
    tags?: string[];
    customFields?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  change?: {
    id: string;
    type: string;
    riskLevel?: string;
    status: string;
    requestedById?: string | null;
    assignedToId?: string | null;
    [key: string]: unknown;
  };
  comment?: { id: string; visibility: string; [key: string]: unknown };
  // APM ↔ CMDB bridge — context for cert_expiry_warning notifications
  certExpiry?: {
    applicationId: string;
    applicationName: string;
    ciId: string;
    ciName: string;
    url: string | null;
    certificateExpiryDate: string;
    certificateIssuer: string | null;
    daysUntilExpiry: number;
    threshold: '60' | '30' | '14' | '7' | 'expired';
  };
  actorId?: string;
  newAssignedToId?: string;
  /** Major Incident workflow — coordinator assigned during promotion. */
  coordinatorId?: string;
  changedFields?: string[];
  slaPercentage?: number;
  slaPolicy?: string;
  breachType?: string;
  source?: string;
  [key: string]: unknown;
}

// ─── Field Resolver ──────────────────────────────────────────────────────────

export function resolveFieldValue(field: string, context: EventContext): unknown {
  // Custom fields: "customFields.someField" drill into ticket.customFields
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    return context.ticket?.customFields?.[key];
  }

  // Cert expiry fields: "cert.daysUntilExpiry" etc. — APM ↔ CMDB bridge
  if (field.startsWith("cert.")) {
    const key = field.slice("cert.".length);
    return context.certExpiry
      ? (context.certExpiry as Record<string, unknown>)[key]
      : undefined;
  }

  switch (field) {
    case "priority":
      return context.ticket?.priority;
    case "queue":
      return context.ticket?.queueId;
    case "category":
      return context.ticket?.categoryId;
    case "assignedGroup":
      return context.ticket?.assignedGroupId;
    case "type":
      return context.ticket?.type;
    case "status":
      return context.ticket?.status;
    case "source":
      return context.source ?? context.ticket?.source;
    case "requestedBy":
      return context.ticket?.requestedById;
    case "assignedTo":
      return context.ticket?.assignedToId ?? context.newAssignedToId;
    case "slaStatus": {
      const breachAt = context.ticket?.slaBreachAt;
      if (!breachAt) return undefined;
      return new Date(breachAt) < new Date() ? "BREACHED" : "OK";
    }
    case "slaPercentage":
      return context.slaPercentage;
    case "slaPolicy":
      return context.slaPolicy;
    case "breachType":
      return context.breachType;
    case "changeType":
      return context.change?.type;
    case "riskLevel":
      return context.change?.riskLevel;
    case "tags":
      return context.ticket?.tags;
    default:
      // Fallback: try ticket first, then top-level context
      return context.ticket?.[field] ?? context[field];
  }
}

// ─── Operator Evaluation ─────────────────────────────────────────────────────

export function evaluateCondition(condition: Condition, context: EventContext): boolean {
  const actual = resolveFieldValue(condition.field, context);
  const expected = condition.value;

  switch (condition.operator) {
    case "equals": {
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase() === expected.toLowerCase();
      }
      return actual === expected;
    }

    case "not_equals": {
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase() !== expected.toLowerCase();
      }
      return actual !== expected;
    }

    case "in": {
      if (!Array.isArray(expected)) return false;
      if (typeof actual === "string") {
        const lowerActual = actual.toLowerCase();
        return expected.some(
          (v) => typeof v === "string" && v.toLowerCase() === lowerActual,
        );
      }
      return expected.includes(actual);
    }

    case "not_in": {
      if (!Array.isArray(expected)) return true;
      if (typeof actual === "string") {
        const lowerActual = actual.toLowerCase();
        return !expected.some(
          (v) => typeof v === "string" && v.toLowerCase() === lowerActual,
        );
      }
      return !expected.includes(actual);
    }

    case "contains": {
      if (typeof actual !== "string" || typeof expected !== "string") return false;
      return actual.toLowerCase().includes(expected.toLowerCase());
    }

    case "greater_than": {
      if (typeof actual !== "number" || typeof expected !== "number") return false;
      return actual > expected;
    }

    case "less_than": {
      if (typeof actual !== "number" || typeof expected !== "number") return false;
      return actual < expected;
    }

    case "between": {
      if (typeof actual !== "number") return false;
      if (!Array.isArray(expected) || expected.length < 2) return false;
      const [lo, hi] = expected as [number, number];
      return actual >= lo && actual <= hi;
    }

    case "is_true":
      return actual === true;

    case "is_false":
      return actual === false;

    case "before": {
      if (actual == null || expected == null) return false;
      return new Date(actual as string).getTime() < new Date(expected as string).getTime();
    }

    case "after": {
      if (actual == null || expected == null) return false;
      return new Date(actual as string).getTime() > new Date(expected as string).getTime();
    }

    case "within_hours": {
      if (actual == null || typeof expected !== "number") return false;
      const diff = Math.abs(Date.now() - new Date(actual as string).getTime());
      return diff <= expected * 60 * 60 * 1000;
    }

    default:
      return false;
  }
}

// ─── Group Evaluator (OR between groups, AND within each group) ──────────────

export function evaluateConditionGroups(
  groups: ConditionGroup[] | undefined,
  context: EventContext,
): boolean {
  // No conditions = always match
  if (!groups || groups.length === 0) return true;

  // OR: any group passing is enough
  return groups.some((group) => {
    if (!group.conditions || group.conditions.length === 0) return true;
    // AND: all conditions in the group must pass
    return group.conditions.every((cond) => evaluateCondition(cond, context));
  });
}

// ─── Template Renderer ───────────────────────────────────────────────────────

import { renderTemplate as renderSharedTemplate } from "@meridian/core";

/**
 * Renders a notification-rule template using the shared `@meridian/core`
 * engine. Builds a dual-shape context that exposes:
 *
 *   - **Flat legacy keys** — `{{ticketNumber}}`, `{{ticketTitle}}`,
 *     `{{priority}}`, `{{status}}`, `{{assigneeName}}`, `{{requesterName}}`,
 *     `{{queueName}}`, `{{categoryName}}`, `{{tenantName}}`, `{{timestamp}}`
 *     so old templates (authored before the unified registry) keep working
 *     without a data migration.
 *
 *   - **Nested paths** — `{{ticket.number}}`, `{{ticket.title}}`,
 *     `{{ticket.priority}}`, `{{requester.displayName}}`,
 *     `{{assignee.displayName}}`, `{{tenant.name}}`, `{{now.iso}}` —
 *     these are the keys the variable picker UI offers going forward
 *     and match the shared registry in @meridian/core.
 *
 * The single source of truth is the shared engine in @meridian/core;
 * this wrapper only assembles the context object.
 */
export function renderTemplate(template: string, context: EventContext): string {
  const t: Record<string, unknown> = (context.ticket ?? {}) as Record<string, unknown>;
  const now = new Date();
  const ticketNumber = typeof t.ticketNumber === 'number' ? t.ticketNumber.toString() : '';
  const title = typeof t.title === 'string' ? t.title : '';
  const priority = typeof t.priority === 'string' ? t.priority : '';
  const status = typeof t.status === 'string' ? t.status : '';
  const assigneeName = typeof t.assigneeName === 'string' ? t.assigneeName : '';
  const requesterName = typeof t.requesterName === 'string' ? t.requesterName : '';
  const queueName = typeof t.queueName === 'string' ? t.queueName : '';
  const categoryName = typeof t.categoryName === 'string' ? t.categoryName : '';
  const tenantName = typeof context.tenantName === 'string' ? context.tenantName : '';

  // Dual-shape context: flat legacy keys AND nested paths.
  const ctx: Record<string, unknown> = {
    // flat legacy
    ticketNumber,
    ticketTitle: title,
    priority,
    status,
    assigneeName,
    requesterName,
    queueName,
    categoryName,
    tenantName,
    timestamp: now.toISOString(),
    // nested (picker registry paths)
    ticket: {
      number: ticketNumber,
      title,
      priority,
      status,
      category: categoryName,
      queue: queueName,
    },
    requester: { displayName: requesterName },
    assignee: { displayName: assigneeName },
    tenant: { name: tenantName },
    now: {
      iso: now.toISOString(),
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
    },
  };
  // Also expose every direct context field as a top-level legacy key
  // (some callers pass extras like `slaPolicy`, `breachType`, etc.)
  for (const [k, v] of Object.entries(context)) {
    if (ctx[k] === undefined) ctx[k] = v;
  }
  return renderSharedTemplate(template, ctx);
}
