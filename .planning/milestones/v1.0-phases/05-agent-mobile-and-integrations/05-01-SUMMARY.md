---
phase: 05-agent-mobile-and-integrations
plan: "01"
subsystem: api
tags: [fastify, prisma, bullmq, agent, push-notifications, api-keys, cmdb]

# Dependency graph
requires:
  - phase: 04-cmdb-change-management-and-asset-portfolio
    provides: cmdb-reconciliation worker, CmdbChangeRecord model with changedBy enum

provides:
  - Agent enrollment API (POST /api/v1/agents/enroll) with SHA-256 token hashing and agentKey generation
  - Agent heartbeat, inventory snapshot, and CMDB sync external endpoints
  - Admin agent management settings routes (list, tokens CRUD, delete)
  - Push device token registration (POST /api/v1/push/register, DELETE unregister)
  - API key CRUD settings routes with SHA-256 hash storage
  - CMDB reconciliation merge guard — manual edits win over agent data
  - Schema fields: consecutiveFailures on Webhook, pushPreferences on User
  - Queue definitions: WEBHOOK_DELIVERY, PUSH_NOTIFICATION

affects:
  - 05-02 through 05-09 (agent management UI, mobile push, webhook delivery all depend on these routes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - AgentKey auth in separate server.ts scope (not JWT, not ApiKey)
    - Queue instances created per-module with REDIS_URL env var parsing (webhook.ts precedent)
    - Token/key generated as randomBytes(32).hex, hashed SHA-256, raw returned once
    - CMDB field-level merge guard via CmdbChangeRecord.changedBy=USER lookup

key-files:
  created:
    - apps/api/src/routes/v1/agents/index.ts
    - apps/api/src/routes/v1/settings/agents.ts
    - apps/api/src/routes/v1/push/index.ts
    - apps/api/src/routes/v1/settings/api-keys.ts
    - apps/api/src/routes/v1/agents/agents.test.ts
    - apps/api/src/routes/v1/push/push.test.ts
    - apps/api/src/routes/v1/settings/api-keys.test.ts
  modified:
    - packages/db/prisma/schema.prisma
    - apps/worker/src/queues/definitions.ts
    - apps/api/src/routes/v1/settings/index.ts
    - apps/api/src/routes/v1/index.ts
    - apps/api/src/server.ts
    - apps/worker/src/workers/cmdb-reconciliation.ts

key-decisions:
  - "Agent routes registered in dedicated server.ts scope (not external ApiKey scope) — AgentKey header is a different auth scheme from ApiKey"
  - "Queue instances created locally in agent route using REDIS_URL env var — follows billing/webhook.ts precedent, avoids cross-app imports from apps/worker"
  - "CMDB merge guard queries CmdbChangeRecord per field before overwrite — changedBy=USER means skip agent update for that field"
  - "Admin agent token generation returns raw token once (rawToken only in response body) — mirrors API key pattern from api-keys.ts"
  - "AgentStatus DEREGISTERED treated as invalid for heartbeat auth — SUSPENDED/OFFLINE agents can still reconnect"

patterns-established:
  - "Pattern: resolveAgent() helper in agent routes reads Authorization: AgentKey <key> and returns agent or null (with 401 reply)"
  - "Pattern: settings routes return prefix (tokenHash.slice(0,8)) never full hash for enrollment tokens"
  - "Pattern: DeviceToken upserted by userId_deviceId unique constraint — handles token rotation on device reinstall"

requirements-completed:
  - AGNT-03
  - AGNT-04
  - AGNT-05
  - AGNT-06
  - AGNT-08
  - PUSH-02
  - INTG-01

# Metrics
duration: 22min
completed: 2026-03-23
---

# Phase 05 Plan 01: Agent API Routes, Push Registration, and API Key CRUD Summary

**Agent enrollment/heartbeat/inventory/cmdb-sync endpoints with AgentKey auth, admin agent management settings routes, push device token upsert, API key CRUD with SHA-256 hash storage, and CMDB reconciliation manual-edit-wins merge guard**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-23T17:38:05Z
- **Completed:** 2026-03-23T18:00:00Z
- **Tasks:** 2 (Task 1 pre-committed in 05-06; Task 2 implemented)
- **Files modified:** 13

## Accomplishments

- Agent enrollment validates SHA-256 token hash, expiry, and maxEnrollments cap; returns unique agentKey on success
- Agent heartbeat/inventory/cmdb-sync routes use AgentKey header auth with dedicated resolveAgent() helper
- Admin settings routes allow listing agents (with STALE display status), generating enrollment tokens (returned once), revoking tokens, and deleting agents
- Push device token registration upserts by userId+deviceId supporting token rotation on reinstall
- API key management stores SHA-256 hash, returns raw key once, lists without hash, revokes by isActive=false
- CMDB reconciliation worker now checks CmdbChangeRecord.changedBy per field before overwriting — USER-edited fields are preserved

## Task Commits

1. **Task 1: Schema migration + queue definitions + test scaffolds** - `be3f076` (feat — pre-committed in plan 05-06)
2. **Task 2: Agent routes + admin routes + push + API keys + CMDB merge guard** - `1382ead` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/api/src/routes/v1/agents/index.ts` - Agent external routes: enroll, heartbeat, inventory, cmdb-sync
- `apps/api/src/routes/v1/settings/agents.ts` - Admin agent management: list agents, token CRUD, delete agent
- `apps/api/src/routes/v1/push/index.ts` - Push registration: register/unregister device tokens
- `apps/api/src/routes/v1/settings/api-keys.ts` - API key CRUD with hash storage
- `apps/api/src/routes/v1/agents/agents.test.ts` - Wave 0 test scaffolds (it.todo stubs)
- `apps/api/src/routes/v1/push/push.test.ts` - Wave 0 test scaffolds (it.todo stubs)
- `apps/api/src/routes/v1/settings/api-keys.test.ts` - Wave 0 test scaffolds (it.todo stubs)
- `packages/db/prisma/schema.prisma` - Added consecutiveFailures on Webhook, pushPreferences on User
- `apps/worker/src/queues/definitions.ts` - Added WEBHOOK_DELIVERY and PUSH_NOTIFICATION queues
- `apps/api/src/routes/v1/settings/index.ts` - Registered agentSettingsRoutes and apiKeySettingsRoutes
- `apps/api/src/routes/v1/index.ts` - Registered pushRoutes
- `apps/api/src/server.ts` - Registered agentRoutes in dedicated scope
- `apps/worker/src/workers/cmdb-reconciliation.ts` - CMDB merge guard: manual edits win over agent data

## Decisions Made

- Agent routes registered in a dedicated server.ts scope rather than the existing external ApiKey scope — AgentKey auth (`Authorization: AgentKey <key>`) is a different protocol from ApiKey auth; mixing them in the same scope would force all agent routes through `apiKeyPreHandler` which expects a different token format.
- Queue instances created locally using REDIS_URL env var parsing — follows billing/webhook.ts precedent to avoid cross-app imports from apps/worker (mapStripeStatus decision chain).
- CMDB merge guard implemented at the field level via CmdbChangeRecord queries — each field independently checks if its last change was by USER before allowing agent overwrite. This avoids a coarser "lock entire CI" approach.

## Deviations from Plan

None — plan executed exactly as written. The Task 1 artifacts (schema fields, queue definitions, test scaffolds) were already committed in plan 05-06 as pre-work, so Task 1 commit verification found them at `be3f076`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Agent enrollment, heartbeat, inventory, and CMDB sync endpoints ready for use by the .NET inventory agent (apps/inventory-agent)
- Admin agent management routes ready for Plan 09 (web settings UI)
- Push device token registration ready for Plan 02 (mobile app)
- API key settings routes ready for Plan 09 (integrations settings UI)
- CMDB reconciliation worker now respects manual edits — safe for concurrent agent and human CMDB editing

---
*Phase: 05-agent-mobile-and-integrations*
*Completed: 2026-03-23*
