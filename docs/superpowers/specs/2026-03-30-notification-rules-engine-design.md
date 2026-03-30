# Notification Rules Engine — Design Spec

**Date**: 2026-03-30
**Status**: Draft
**Author**: Claude + Graf Reiner

---

## Summary

A configurable notification rules engine that replaces the current hardcoded notification dispatch. Admins define rules with a trigger event, compound AND/OR conditions, and multiple delivery actions. Rules are priority-ordered with optional stop-processing flags. Queue managers can create rules scoped to their queues. Rules are importable/exportable as YAML.

---

## Data Model

### NotificationRule

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PK | |
| tenantId | UUID FK to Tenant | Tenant scope |
| name | String | Human-readable rule name |
| description | String? | Optional explanation |
| isActive | Boolean | Enable/disable without deleting |
| trigger | String | Single event type that fires this rule |
| conditionGroups | JSON | Array of OR-joined groups, each with AND-joined conditions |
| actions | JSON | Array of action objects to execute when matched |
| priority | Int (default 100) | Lower number = higher priority |
| stopAfterMatch | Boolean | If true, no lower-priority rules execute after this one |
| scopedQueueId | UUID? FK to Queue | If set, only queue managers of this queue can edit |
| createdById | UUID FK to User | Who created the rule |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Indexes: [tenantId, trigger, isActive], [tenantId, priority], [scopedQueueId]

### NotificationRuleLog

| Field | Type | Description |
|-------|------|-------------|
| id | UUID PK | |
| tenantId | UUID FK to Tenant | |
| ruleId | UUID FK to NotificationRule | |
| trigger | String | Event type that fired |
| matched | Boolean | Whether conditions matched |
| eventPayload | JSON | Snapshot of event context |
| actionsFired | JSON | Which actions executed and their results |
| error | String? | Error message if execution failed |
| firedAt | DateTime | |

Indexes: [tenantId, firedAt], [ruleId, firedAt]

### Trigger Events

TICKET_CREATED, TICKET_ASSIGNED, TICKET_COMMENTED, TICKET_RESOLVED, TICKET_UPDATED, SLA_WARNING, SLA_BREACH, CHANGE_CREATED, CHANGE_APPROVED, CHANGE_UPDATED, CAB_INVITATION, MENTION, SYSTEM

---

## Condition Groups

Top level is OR (match any group). Within each group, AND (all must match).

Example:
```json
{
  "conditionGroups": [
    {
      "conditions": [
        { "field": "priority", "operator": "equals", "value": "CRITICAL" },
        { "field": "queue", "operator": "in", "value": ["id1", "id2"] }
      ]
    },
    {
      "conditions": [
        { "field": "slaStatus", "operator": "equals", "value": "BREACHED" }
      ]
    }
  ]
}
```

### Condition Fields by Trigger

- Ticket events: priority, queue, category, assignedGroup, type, source, requestedBy, customFields, slaStatus, assignedTo
- SLA events: All ticket fields + slaPercentage, slaPolicy, breachType
- Change events: changeType, riskLevel, status, requestedBy, assignedTo
- CAB events: meetingTitle, scheduledFor

### Operators by Field Type

- String/Enum: equals, not_equals, in, not_in, contains
- Number: equals, not_equals, greater_than, less_than, between
- Boolean: is_true, is_false
- DateTime: before, after, between, within_hours
- Reference: equals, in, not_in

---

## Actions

Multiple actions per rule, fired in parallel.

| Type | Delivery | Config |
|------|----------|--------|
| in_app | DB insert Notification table | recipients: dynamic or specific userIds |
| email | BullMQ email-notification queue | recipients: dynamic or addresses, templateName |
| slack | HTTP POST webhook | alertChannelId, messageTemplate |
| teams | HTTP POST webhook | alertChannelId, messageTemplate (Adaptive Card) |
| webhook | HTTP POST URL | url, headers, secret (HMAC) |
| sms | Twilio API | recipients: dynamic or phone numbers |
| push | BullMQ push-notification queue | same as in_app, filtered by DeviceTokens |
| escalate | DB update | targetQueueId, targetGroupId, targetUserId |
| update_field | DB update | field, value |
| webhook_wait | HTTP POST + await (5s) | url + responseMapping |

Message templates: {{variable}} syntax. Default messages generated if none provided.
Retry: delivery actions 3x exponential backoff. Local actions immediate, no retry.

---

## Evaluation Engine

```
dispatchNotificationEvent(tenantId, trigger, eventContext)
  1. Load rules from Redis cache (rules:{tenantId}:{trigger}, 60s TTL)
  2. If no rules -> legacy hardcoded behavior (backward compatible)
  3. For each rule by priority ASC:
     a. Evaluate conditionGroups (OR groups, AND conditions)
     b. If matched: fire actions, log, if stopAfterMatch -> break
     c. If not matched: continue
```

Cache invalidated on rule CRUD. 60s TTL safety net.

### Backward Compatibility

- Zero rules = current behavior unchanged
- Rules replace hardcoded logic only for triggers that have rules
- "Generate default rules" button for migration

---

## Integration

Replace hardcoded notify calls:
```typescript
// Before
await notifyTicketCreated(tenantId, ticket, actorId);
// After
await dispatchNotificationEvent(tenantId, 'TICKET_CREATED', { ticket, actorId, assignee, requester });
```

Dispatch points: ticket.service (create/assign/comment/resolve/update), sla-monitor worker, change.service, cab.service

---

## YAML Import/Export

```yaml
version: 1
exportedAt: "2026-03-30T12:00:00Z"
tenant: msp-default
rules:
  - name: "Critical SLA Breach -> Slack + Escalate"
    trigger: SLA_BREACH
    priority: 10
    stopAfterMatch: false
    isActive: true
    conditionGroups:
      - conditions:
          - field: priority
            operator: equals
            value: CRITICAL
    actions:
      - type: slack
        config:
          alertChannel: "Incidents Slack"
      - type: escalate
        config:
          targetQueue: "Tier 2 Support"
```

Import: name-based reference resolution, preview before commit, warnings for missing refs.

---

## API Routes

| Method | Route | Auth |
|--------|-------|------|
| GET | /notification-rules | settings.read |
| POST | /notification-rules | settings.update |
| GET | /notification-rules/:id | settings.read |
| PATCH | /notification-rules/:id | settings.update |
| DELETE | /notification-rules/:id | settings.update |
| PATCH | /notification-rules/reorder | settings.update |
| POST | /notification-rules/:id/test | settings.update |
| GET | /notification-rules/:id/logs | settings.read |
| GET | /notification-rules/export | settings.read |
| POST | /notification-rules/import | settings.update |
| POST | /notification-rules/import/confirm | settings.update |
| POST | /notification-rules/generate-defaults | settings.update |

---

## UI Pages

1. Rules List (/dashboard/settings/notification-rules) — drag-reorder table, trigger badges, action chips, active toggle
2. Rule Editor (/dashboard/settings/notification-rules/[id]) — trigger dropdown, condition group builder, action cards
3. Import Preview — modal with file upload, preview table, confirm

---

## Permissions

- Tenant admin: full CRUD, import/export, generate defaults
- Queue manager: CRUD scoped to their queue, no stopAfterMatch, no unscoped rules
- Other users: read-only

---

## Acceptance Criteria

- [ ] Rules with trigger, AND/OR conditions, multiple actions
- [ ] Priority ordering with stopAfterMatch
- [ ] All 10 action types deliver correctly
- [ ] All 10 condition fields evaluate correctly
- [ ] YAML export/import with name-based references
- [ ] Backward compatible (zero rules = current behavior)
- [ ] Generate default rules from hardcoded behavior
- [ ] Queue manager scoping
- [ ] Redis-cached evaluation (60s TTL)
- [ ] NotificationRuleLog audit trail
- [ ] Working condition group builder UI
- [ ] Drag-reorder priority in rules list
