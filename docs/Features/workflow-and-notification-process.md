# Workflow & Notification Process

How MeridianITSM turns an in-app event ("ticket created", "SLA breached") into outbound notifications and automated actions.

All code referenced here lives in the shared package `packages/notifications/src/`. Both `apps/api` and `apps/worker` import the same dispatcher — there is exactly one engine.

---

## 1. The Big Picture

Every event flows through a single entry point: `dispatchNotificationEvent(tenantId, trigger, eventContext)` (`packages/notifications/src/dispatch.ts:121`).

That one call fans out into **two parallel, independent systems**:

| | NotificationRules | Workflows |
|---|---|---|
| Authored as | Flat list of `{conditions, actions}` rows | Visual graph of nodes + edges (React Flow) |
| Stored in | `NotificationRule` table | `Workflow` + `WorkflowVersion` tables |
| Order between rules/workflows | `priority` ascending, with `stopAfterMatch` short-circuit | Unordered, fired in parallel (fire-and-forget) |
| Order within a rule/workflow | All actions in parallel (`Promise.allSettled`) | Sequential graph traversal with branching |
| Cache | Redis `rules:{tenantId}:{trigger}` (60s) | Redis `workflows:{tenantId}:{trigger}` (60s) |
| Fallback | `legacyFallback` runs only when zero rules exist | None |

Both systems share the same `EventContext`, the same operator library, the same template engine, and the same outbound channels. Workflows are a near-superset of rules with a graph-based mental model.

```
                      dispatchNotificationEvent(tenantId, trigger, ctx)
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
        loadRules(tenantId, trigger)              dispatchWorkflows(tenantId, trigger, ctx)
        (orderBy priority asc)                    (load PUBLISHED workflows)
                │                                             │
                ▼                                             ▼
        for each rule (sequential)               for each workflow (parallel, fire-and-forget)
          ├─ scopedQueueId match?                   ├─ scopedQueueId match?
          ├─ evaluateConditionGroups               └─ executeWorkflow(versionId)
          ├─ executeActions (parallel)                  └─ walkGraph from trigger node
          ├─ log NotificationRuleLog                       ├─ executeNode (records step)
          └─ if stopAfterMatch → break                     └─ follow edge by nextPort
```

---

## 2. The Trigger Catalogue

The authoritative list lives in `packages/notifications/src/types.ts:2-11`:

```ts
export type NotificationTrigger =
  | 'TICKET_CREATED'
  | 'TICKET_ASSIGNED'
  | 'TICKET_COMMENTED'
  | 'TICKET_RESOLVED'
  | 'TICKET_UPDATED'
  | 'SLA_BREACH'
  | 'SLA_WARNING'
  | 'MAJOR_INCIDENT_DECLARED'
  | 'CERT_EXPIRY_WARNING';
```

### Where each trigger fires

| Trigger | Fired by |
|---|---|
| `TICKET_CREATED` | `apps/api/src/services/ticket.service.ts` on `createTicket`; `apps/worker/src/services/email-inbound.service.ts` when an inbound email becomes a new ticket; `apps/worker/src/workers/inbound-webhook-process.ts` when a webhook is mapped to a new ticket |
| `TICKET_ASSIGNED` | `ticket.service.ts` on assignment change |
| `TICKET_COMMENTED` | `ticket.service.ts` on `addComment` |
| `TICKET_RESOLVED` | `ticket.service.ts` on status → resolved |
| `TICKET_UPDATED` | `ticket.service.ts` on any non-targeted field change |
| `SLA_BREACH` / `SLA_WARNING` | `apps/api/src/workers/sla-monitor.worker.ts` (runs every minute) |
| `MAJOR_INCIDENT_DECLARED` | `apps/api/src/services/ticket.service.ts` when an incident is promoted to major |
| `CERT_EXPIRY_WARNING` | `apps/worker/src/workers/cert-expiry-monitor.ts` (APM ↔ CMDB bridge, daily scan) |

### Workflow trigger nodes

A workflow's row-level `Workflow.trigger` column is what gets matched against the dispatched event. The trigger **node** inside the graph is just a visual entry point with no `execute` function — the executor finds it via `n.type?.startsWith('trigger_')` and starts walking from there (`executor.ts:87`).

Nine trigger nodes are registered (`packages/notifications/src/workflows/nodes/triggers/`):

- `trigger_ticket_created`
- `trigger_ticket_assigned`
- `trigger_ticket_commented`
- `trigger_ticket_resolved`
- `trigger_ticket_updated`
- `trigger_sla_breach`
- `trigger_sla_warning`
- `trigger_major_incident_declared`
- `trigger_cert_expiry_warning`

Each trigger node declares a `notificationTrigger` field on its `NodeDefinition` linking it to the dispatcher literal. The create-workflow editor dropdown is driven directly off the registry endpoint (`GET /api/v1/settings/workflows/node-definitions`), so adding a new trigger node + literal automatically surfaces it in the UI — no frontend dict to keep in sync.

> **Coverage gap**: `TICKET_APPROVAL_REQUESTED` is dispatched but does not yet have a matching workflow trigger node — only NotificationRules can react to approval requests today.

---

## 3. The EventContext

Every condition and template renders against an `EventContext` (`packages/notifications/src/conditions.ts:19-76`). Shape:

```ts
{
  ticket?:    { id, ticketNumber, title, type, priority, status, queueId,
                categoryId, assignedToId, assignedGroupId, requestedById,
                slaId, slaBreachAt, tags, customFields, ... }
  change?:    { id, type, riskLevel, status, requestedById, assignedToId, ... }
  comment?:   { id, visibility, ... }
  certExpiry? // APM ↔ CMDB bridge — only set for CERT_EXPIRY_WARNING

  actorId?           // who triggered the event
  newAssignedToId?   // for assignment changes
  coordinatorId?     // major incident
  changedFields?     // for TICKET_UPDATED
  slaPercentage?, slaPolicy?, breachType?
  source?            // 'web' | 'email' | 'webhook' | 'api' ...

  // Auto-populated by the dispatcher (cached 5min):
  tenantName?, tenantSubdomain?, tenantCustomDomain?, tenantBaseUrl?
  trigger             // assigned by dispatchNotificationEvent

  // Provenance — recommended on every dispatch, set by the originating caller.
  origin?: {
    type: 'user' | 'api' | 'email' | 'webhook' | 'workflow' | 'rule' | 'system' | 'agent';
    workflowId?, workflowExecutionId?, workflowNodeId?, ruleId?, actorId?
  }
}
```

The `origin` field lets workflows filter out their own follow-up updates via a `condition_field` on `origin.type`. Today's dispatcher callsites set `origin` as follows: `ticket.service.ts` → `user`, `approvals.ts` → `user`, `sla-monitor.worker.ts` → `system`, `email-inbound.service.ts` → `email`, `inbound-webhook-process.ts` → `webhook`.

The dispatcher enriches every context with the tenant's identity + a pre-resolved base URL so downstream renderers can produce vanity-FQDN-aware ticket links without any per-callsite code.

---

## 4. Conditions

### NotificationRules

Stored on each rule as `conditionGroups: ConditionGroup[]`. The shape:

```ts
type ConditionGroup = { conditions: { field, operator, value }[] }
```

Evaluation logic (`evaluateConditionGroups`, `conditions.ts:231`):

- **OR** between groups (any group passing is enough).
- **AND** within a group (every condition must pass).
- An empty/undefined groups array always matches.

### Workflows

Three condition node types (`packages/notifications/src/workflows/nodes/conditions/`):

| Node type | Purpose |
|---|---|
| `condition_field` | Single `{field, operator, value}` test against the event context. Two outputs: `true` / `false`. |
| `condition_group` | Free-form JSON array of conditions with selectable `and` / `or` logic. Two outputs: `true` / `false`. |
| `condition_form_field` | Test a Custom Form's submitted field. Optionally restrict to a specific form via `customFields.__formId`. Operators include `is_empty` / `is_not_empty`. |

When a condition node executes it returns `nextPort: 'true' | 'false'`, and `walkGraph` follows the edge whose `sourceHandle` matches that port (`executor.ts:153-161`).

### Field resolver

`resolveFieldValue` (`conditions.ts:80`) supports:

- Direct names: `priority`, `status`, `type`, `queue`, `category`, `assignedTo`, `assignedGroup`, `requestedBy`, `tags`, `source`
- Synthetic fields: `slaStatus` (computed: `BREACHED` if `slaBreachAt < now`, else `OK`), `slaPercentage`, `slaPolicy`, `breachType`, `changeType`, `riskLevel`
- `customFields.<key>` — drills into the ticket's custom field JSON
- `cert.<key>` — drills into the cert-expiry context (APM ↔ CMDB)
- Fallback: any other name is looked up first on `ticket`, then on the top-level context

### Operators

`evaluateCondition` (`conditions.ts:139`) implements:

| Operator | Notes |
|---|---|
| `equals`, `not_equals` | Case-insensitive for strings |
| `in`, `not_in` | Expected value must be an array; case-insensitive for string members |
| `contains` | Case-insensitive substring (strings only) |
| `greater_than`, `less_than` | Numbers only |
| `between` | Expected value `[lo, hi]` inclusive |
| `is_true`, `is_false` | Strict boolean compare |
| `before`, `after` | Date compare |
| `within_hours` | `|now - actual| <= expected hours` |

Unknown operator → returns `false`.

---

## 5. Actions / Action Nodes

### NotificationRules action types

Registered in `ACTION_EXECUTORS` (`packages/notifications/src/actions.ts:746-762`). All actions on a matched rule run in parallel via `Promise.allSettled` — one failure does not block the others.

| `type` | What it does |
|---|---|
| `in_app` | Creates `Notification` rows for resolved recipient user IDs |
| `email` | Enqueues `email-notification` BullMQ jobs (per-recipient) |
| `slack` / `teams` / `discord` / `telegram` | Posts to the configured `AlertConfiguration` webhook (Teams uses Adaptive Card, Discord includes ticket embed, Telegram uses HTML parse mode) |
| `webhook` | Fire-and-forget POST. If `secret` is set, signs payload with HMAC-SHA256 in `X-Meridian-Signature: sha256=...` |
| `webhook_wait` | Synchronous POST with 5s timeout. Parses JSON response and applies `responseMapping` (response key → ticket field) back to the ticket |
| `sms` | Placeholder — no provider wired up yet |
| `push` | Enqueues `push-notification` jobs (Expo / FCM / APNs) per resolved user |
| `escalate` | Updates `ticket.queueId` / `assignedGroupId` / `assignedToId` and writes `TicketActivity` (`ESCALATED`) |
| `update_field` | Updates an arbitrary ticket field and writes a `FIELD_CHANGED` activity |

### Workflow action nodes

Registered under `packages/notifications/src/workflows/nodes/actions/`:

| Node type | Notification-rule equivalent | Notes |
|---|---|---|
| `action_send_in_app` | `in_app` | |
| `action_send_email` | `email` | |
| `action_send_slack` | `slack` | |
| `action_send_teams` | `teams` | |
| `action_send_discord` | `discord` | |
| `action_send_telegram` | `telegram` | |
| `action_send_push` | `push` | |
| `action_send_webhook` | `webhook` | |
| `action_escalate` | `escalate` | |
| `action_update_field` | `update_field` | |
| `action_assign_ticket` | (none — use `escalate` or `update_field`) | First-class assignment node |
| `action_change_status` | (none — use `update_field`) | Convenience wrapper |
| `action_change_priority` | (none — use `update_field`) | Convenience wrapper |
| `action_add_comment` | **none** | Only available in workflows. Adds a `[Automated] {{ rendered }}` comment to the ticket with PUBLIC/INTERNAL visibility and writes a `COMMENT_ADDED` activity. |
| `action_webhook_wait` | `webhook_wait` | Synchronous POST with configurable timeout (default 5s). Templated URL/body, optional HMAC signing, JSON response mapping back to the ticket (including `customFields.*`). Four output ports for branching: `success`, `failure` (HTTP error), `timeout`, `invalid_response`. |

> **Action gaps**: workflows have no `sms` node today (the rule-side `sms` action is itself a placeholder).

Mutation nodes (`mutates: true` on the `NodeDefinition`) — `action_escalate`, `action_update_field`, `action_change_status`, `action_change_priority`, `action_assign_ticket`, `action_add_comment`, `action_webhook_wait` — surface a warning banner in the editor's properties panel so authors know the workflow can react to its own updates if conditions are not scoped properly.

### Recipient resolution

Both systems use the same resolver (`actions.ts:111-187`). Recipient tokens:

- `assignee` → `ticket.assignedToId`
- `requester` → `ticket.requestedById`
- `group_members` → all `UserGroupMember` rows for `ticket.assignedGroupId`
- Anything else → treated as a literal user ID

For email actions, static addresses can also be passed via `config.emails`. The string form `"a@x, b@y; c@z"` is split on `,` `;` and newlines (`normalizeStaticEmails`) — important because the workflow UI saves this field as a comma-separated string while rules pass arrays.

### Cross-system dedupe net

`alreadyFired` (`actions.ts:19-36`) writes a Redis key `notify:dedup:{tenantId}:{resourceId}:{trigger}:{channel}:{recipient}` with `EX 60, NX`. If the key already existed, the channel skips that recipient.

This protects against the **rule + workflow firing for the same trigger** scenario — the dedupe is a safety net around overlapping notification systems and dispatcher retries.

### Action-level idempotency (state mutations)

State-mutating actions (`escalate`, `update_field`, `webhook_wait`) and the workflow mutation nodes (`action_change_status`, `action_change_priority`, `action_assign_ticket`, `action_escalate`, `action_update_field`, `action_add_comment`, `action_webhook_wait`) are wrapped with a SET-NX idempotency check using a key shaped like:

```
automation:dedup:{tenantId}:{resourceId}:{trigger}:{actionType}:{fingerprintHash}
```

The fingerprint is a SHA-256 over `[workflowId, currentNodeId, actorId, slaPercentage, ...action-specific inputs]` so:

- Two identical mutation attempts for the same trigger event collapse to one.
- SLA at 75% / 90% / breach are kept distinct (different `slaPercentage` → different fingerprint).
- Two distinct mutation nodes in the same workflow (different `currentNodeId`) both fire.
- Different workflows targeting the same field (different `workflowId`) both fire — by design; both authors wanted that.

Helpers live in `@meridian/core` (`buildIdempotencyKey`, `sha256Fingerprint`, `checkIdempotencyKey`, `DEFAULT_IDEMPOTENCY_TTL_SECONDS = 60`). The Redis check fails open: if Redis is down, mutations proceed and a warning is logged.

---

## 6. Templating

Both systems share `renderTemplate` in `conditions.ts:269` (which delegates to `@meridian/core`'s shared engine). It exposes a **dual-shape context**:

**Flat legacy keys** (kept working without data migration):
`{{ticketNumber}}`, `{{ticketTitle}}`, `{{priority}}`, `{{status}}`, `{{assigneeName}}`, `{{requesterName}}`, `{{queueName}}`, `{{categoryName}}`, `{{tenantName}}`, `{{timestamp}}`

**Nested paths** (what the variable picker UI offers going forward):
`{{ticket.id}}`, `{{ticket.number}}`, `{{ticket.title}}`, `{{ticket.priority}}`, `{{ticket.status}}`, `{{ticket.dashboardUrl}}`, `{{ticket.portalUrl}}`,
`{{requester.displayName}}`, `{{assignee.displayName}}`,
`{{tenant.name}}`, `{{tenant.url}}`, `{{tenant.dashboardUrlBase}}`, `{{tenant.portalUrlBase}}`,
`{{now.iso}}`, `{{now.date}}`, `{{now.time}}`

`ticket.number` renders as the human-facing record (`SR-#####`); use `ticket.numericId` if you really need the raw integer.

Tenant URLs honour the per-tenant vanity FQDN (custom domain → subdomain fallback) — set automatically by the dispatcher.

### Channel templates

For email/Slack/Teams/Discord/Telegram, an action can reference a `NotificationTemplate` by `templateId`. `resolveTemplate` (`actions.ts:89`) loads it scoped by `tenantId + channel + isActive`. Inline `subject` / `body` / `message` config is used as a fallback when no template is selected. Email templates carry `subject + htmlBody`; Teams templates carry `title + body` (collapsed into one block); the rest carry `message`.

---

## 7. Workflow Execution Model

When `dispatchWorkflows` finds matching `PUBLISHED` workflows, each one is fired as `void executeWorkflow(...)` — completely independent, no awaiting between workflows.

### Direct vs queue-backed execution

Controlled by the `WORKFLOW_QUEUE_EXECUTION` env var, read once at module load:

- **OFF (default)** — `dispatchWorkflows` calls `executeWorkflow` directly via `void`. Historical behavior; safe rollback for the queue migration.
- **ON** (`WORKFLOW_QUEUE_EXECUTION=1`) — `dispatchWorkflows` enqueues a `workflow-execution` BullMQ job consumed by `apps/worker/src/workers/workflow-execution.worker.ts`. Failed jobs retry with exponential backoff (3 attempts, base delay 5s). Completed jobs are pruned after 1h or 500 entries; failed jobs retained 7 days for diagnosis.

If enqueue itself throws (e.g. Redis offline at the producer), the dispatcher falls back to direct execution so the event isn't lost.

The action-level idempotency from Phase 2 is what makes retry safe: when a job retries, mutation nodes (`action_change_status`, `action_update_field`, etc.) detect the duplicate via the SET-NX guard and return synthetic success without re-mutating.

### Step output `_meta` envelope

Every `WorkflowExecutionStep.outputData` now carries a `_meta` object with structured observability fields:

| Field | When set | Purpose |
|---|---|---|
| `durationMs` | always | step wall-clock from `startedAt` to `completedAt` |
| `branchTaken` | when the node returns `nextPort` | which output port the executor followed (`true` / `false` / etc.) |
| `dedupeSkipped` | when the step result has `output.deduped: true` | mutation skipped because the idempotency guard tripped |
| `queueJobId` | first step only, queue-backed mode | BullMQ job id — lets operators jump from step → originating queue job |
| `retryCount` | first step only, queue-backed mode | BullMQ `attemptsMade` (1 = first attempt, 2+ = retry) |

### Secret masking at the log boundary

Node config is passed through `maskObject` from `@meridian/core` before being persisted as `WorkflowExecutionStep.inputData`. This catches the `secret` field on `action_send_webhook` and `action_webhook_wait` so HMAC signing keys never land in the database in plaintext. The runtime still receives the raw config — only the persisted log copy is masked.

The webhook-wait node also masks its `responseBody` before storing it on `outputData`, since external services can echo headers or token-shaped fields back in their JSON response.


`executeWorkflow` (`packages/notifications/src/workflows/executor.ts:20`):

1. **Recursion check** — Redis key `wf-depth:{tenantId}:{ticketId}` capped at 3.
2. **Create execution record** — `WorkflowExecution` row with `status = RUNNING`, the full event payload, and an `isSimulation` flag for dry-runs.
3. **Load the graph** — `WorkflowVersion.graphJson` (a `{ nodes, edges }` shape compatible with React Flow).
4. **Find the trigger node** — first node whose `type` starts with `trigger_`.
5. **Walk the graph** from that trigger:
   - Build adjacency (`source → outgoing edges[]`).
   - At each node, run its `execute(config, context)` (or pass through if no `execute` — triggers are pass-throughs).
   - **Cycle detection** — `visited` set; if a node is revisited the walk stops.
   - **Routing**:
     - If the node returned `nextPort` (condition nodes), follow the edge whose `sourceHandle` matches.
     - Otherwise follow the single (or first) outgoing edge.
   - Each node creates a `WorkflowExecutionStep` with `RUNNING → COMPLETED/FAILED` for full per-node observability.
   - Every node's `output` is stored in `context.variables[node.id]` so downstream nodes can reference upstream results.
6. **Safety limit** — at most 50 nodes per execution.
7. **Mark done** — `status = COMPLETED` (or `FAILED` with the error message).

Simulation mode (`isSimulation = true`) skips side effects in nodes like `action_add_comment` and returns synthetic outputs — used by the workflow editor's "Test Run" button.

---

## 8. NotificationRule Execution Model

`dispatchNotificationEvent` body (`dispatch.ts:147-202`):

```
load rules from cache or DB (ordered by priority asc)
if rules.length === 0:
    legacyFallback?.run()        # only when zero rules exist
    return

for rule in rules:
    if rule.scopedQueueId and ticket.queueId != rule.scopedQueueId: continue
    if not evaluateConditionGroups(rule.conditionGroups, ctx): continue
    results = await executeActions(rule.actions, ctx, tenantId)   # parallel
    write NotificationRuleLog (matched=true, eventPayload, actionsFired)
    if rule.stopAfterMatch: break
```

If a single rule throws, it's caught and logged with `matched=false`; the loop continues. If the entire dispatcher path throws (DB outage), `legacyFallback` runs as a last-resort.

Workflows and rules dispatch are independent — workflows always run regardless of `stopAfterMatch` on any rule.

---

## 9. Cache Invalidation

| Cache | Invalidator | Called from |
|---|---|---|
| `rules:{tenantId}:*` | `invalidateRulesCache(tenantId)` | `apps/api/src/services/notification-rules.service.ts` after create/update/delete/toggle of a NotificationRule |
| `workflows:{tenantId}:*` | `invalidateWorkflowCache(tenantId)` | API after publish / disable / delete of a Workflow |
| Tenant identity (in-memory, 5-min TTL) | `_resetTenantIdentityCacheForTests` | Tests only — production refreshes on TTL expiry |

Cache misses just hit the DB; failures are logged but never throw.

---

## 10. Storage / Data Model

### Rules

```
NotificationRule(
  id, tenantId, name, trigger, conditionGroups (JSON), actions (JSON),
  priority, stopAfterMatch, scopedQueueId, isActive
)

NotificationRuleLog(
  id, tenantId, ruleId, trigger, matched,
  eventPayload (JSON), actionsFired (JSON), error
)

NotificationTemplate(
  id, tenantId, name, channel (EMAIL|SLACK|TEAMS|DISCORD|TELEGRAM),
  content (JSON), contexts (string[]), isActive
)

AlertConfiguration(
  id, tenantId, type, config (JSON: webhookUrl | botToken+chatId), isActive
)
```

### Workflows

```
Workflow(
  id, tenantId, name, trigger, status (DRAFT|PUBLISHED|DISABLED),
  scopedQueueId, currentVersionId
)

WorkflowVersion(
  id, workflowId, version, graphJson (JSON: { nodes, edges })
)

WorkflowExecution(
  id, tenantId, workflowId, versionId, trigger, status,
  eventPayload (JSON), error, isSimulation, completedAt
)

WorkflowExecutionStep(
  id, executionId, nodeId, nodeType, status,
  inputData (JSON), outputData (JSON), error,
  startedAt, completedAt
)
```

---

## 11. End-to-End Walkthrough — A New Ticket via Email

1. Inbound email lands → `apps/worker/src/services/email-inbound.service.ts` parses it, creates the Ticket, and calls `dispatchNotificationEvent(tenantId, 'TICKET_CREATED', ctx)`.
2. Dispatcher enriches `ctx` with tenant identity + `tenantBaseUrl`.
3. **Workflow path** (parallel, fire-and-forget):
   - `dispatchWorkflows` loads `PUBLISHED` workflows where `trigger = 'TICKET_CREATED'`.
   - For each, `executeWorkflow` walks the graph: trigger node → maybe a `condition_field` (Priority equals HIGH) → `true` branch → `action_assign_ticket` → `action_send_email` → end.
   - Each node writes a `WorkflowExecutionStep` row.
4. **NotificationRule path** (sequential, ordered):
   - `loadRules` returns active rules ordered by `priority asc`.
   - First rule checks `scopedQueueId`, evaluates conditionGroups (OR-of-AND), runs all actions in parallel via `Promise.allSettled`.
   - If `stopAfterMatch`, the loop stops. Otherwise the next rule runs.
   - Each rule writes a `NotificationRuleLog`.
5. Outbound channels enqueue:
   - `email-notification` → consumed by the email worker (SMTP / Microsoft Graph / Google API).
   - `push-notification` → consumed by the push worker (Expo).
   - In-app rows → polled by the web UI.
   - Slack/Teams/Discord/Telegram → posted directly via `fetch`.
6. The Redis dedupe key blocks any duplicate `(tenant, resource, trigger, channel, recipient)` combo within 60s.

---

## 12. Quick Reference

**Entry point**: `dispatchNotificationEvent(tenantId, trigger, eventContext, options?)` — `packages/notifications/src/dispatch.ts:121`.

**Add a new trigger**:
1. Add the literal to `NotificationTrigger` in `types.ts`.
2. Find the place that should fire it (service or worker) and call the dispatcher.
3. (For workflows) add a `trigger_<name>` registration under `workflows/nodes/triggers/`.

**Add a new operator**: extend the `switch` in `evaluateCondition` (`conditions.ts:139`).

**Add a new field to filter on**: extend `resolveFieldValue` (`conditions.ts:80`) and (if needed) the `field` options of `condition_field`.

**Add a new action type / node**:
- Rules: write an executor and add it to `ACTION_EXECUTORS` (`actions.ts:746`).
- Workflows: drop a new file under `workflows/nodes/actions/` calling `registerNode(...)`.

**Add a new template variable**: extend the context object built in `renderTemplate` (`conditions.ts:269`); the variable picker reads from `@meridian/core`'s shared registry.
