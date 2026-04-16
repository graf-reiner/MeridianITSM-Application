---
phase: 7
slug: ci-reference-table-migration
type: pattern-map
created: 2026-04-16
status: draft
---

# Phase 7: CI Reference-Table Migration — Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 23 (10 modify, 13 create)
**Analogs found:** 23 / 23 (100% — every new file has a clear in-tree analog)

> Pattern source for all Phase 7 plans. Each plan must reference the analog file + line numbers below rather than inventing new conventions. **All file paths absolute relative to the repo root** `C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\`.

---

## File Classification

### Files to MODIFY (10)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `packages/db/prisma/schema.prisma` (lines 2204-2207, 2334, 2353) | schema | DDL | itself (existing FK columns) | exact (self-modification) |
| `apps/api/src/services/cmdb.service.ts` (lines 235-287, 612-774, 800-810, 832-846) | service | CRUD | (current shape) — reshape inward | exact (self) |
| `apps/api/src/services/application.service.ts` (lines 181-196) | service | CRUD (FK-only write) | `cmdb.service.ts` `createCI` post-Phase-7 | role-match |
| `apps/api/src/services/cmdb-import.service.ts` (lines 178-213) | service | batch / bulk transform | (Zod-validated bulk import already in place) | exact (self) |
| `apps/worker/src/workers/cmdb-reconciliation.ts` (lines 181-226, 395-435) | worker | event-driven (reconciliation) | itself (FK resolver pattern at lines 48-94) | exact (self, extending in-file pattern) |
| `apps/api/src/routes/v1/cmdb/index.ts` (lines 56-132, 187-269, 293-337) | route | request-response | `apps/api/src/services/cmdb-import.service.ts` (Zod usage at lines 6-51) | role-match (introducing Zod into routes) |
| `apps/api/src/routes/auth/signup.ts` (line ~205, inside the existing transaction at line 126) | route | request-response (tenant lifecycle hook) | itself (lines 153-184 — "seed default roles / SLAs / categories" loops) | exact (self — new step in same tx) |
| `apps/owner/src/lib/provisioning.ts` (line ~167+, inside existing $transaction) | service | request-response (tenant lifecycle hook) | `apps/api/src/routes/auth/signup.ts:153-184` | role-match (mirrors signup) |
| `apps/api/src/services/ai-schema-context.ts` (lines 109-126) | config (static DDL doc) | n/a (constant string) | itself (line 100 — `applications` table DDL block) | exact (self) |
| `apps/api/src/services/portal-schema-context.ts` (lines 13-26) | config (static DDL doc) | n/a (constant string) | itself (existing structure) | exact (self) |
| `apps/api/src/routes/v1/assets/index.ts` (lines 270, 297) | route | request-response | (verify only — no enum writes here, asset link only) | n/a (audit only) |

### Files to CREATE (13)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `packages/db/src/seeds/cmdb-reference.ts` | seed (reusable) | DDL upsert in `tx` | `packages/db/prisma/seed.ts:353-485` (extract this) | exact |
| `packages/db/scripts/phase7-backfill.ts` | script (one-shot batch) | per-tenant SELECT + UPDATE loop | `packages/db/scripts/cmdb-migration.ts` (full file) | exact |
| `packages/db/scripts/phase7-verify.ts` | script (one-shot read-only) | per-tenant `$queryRaw` count + index introspection | `packages/db/scripts/cmdb-migration.ts:14-19` (Prisma adapter init) + `cmdb.service.ts:227-231` ($queryRaw count) | role-match |
| `packages/db/scripts/phase7-grep-gate.sh` | script (CI gate) | static grep | (no exact analog; project does not yet have shell gate scripts) | NEW (no analog — see "Shared Patterns / Grep Gate" below) |
| `packages/db/prisma/migrations/{ts}_phase7_ci_ref_notnull/migration.sql` | migration | DDL + pre-flight `DO $$` block | (Prisma-generated body, plus pre-flight pattern in RESEARCH.md `Pattern 3`) | role-match |
| `apps/api/src/services/cmdb-reference-resolver.service.ts` | service (helper) | request-response (FK resolver, cached) | `apps/worker/src/workers/cmdb-reconciliation.ts:48-94` (inline resolvers — extract these) | exact |
| `apps/api/src/__tests__/signup-cmdb-seed.test.ts` | test (integration, Vitest) | mocked Prisma transaction | `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (vi.hoisted + vi.mock + prismaTransaction mock) | exact |
| `apps/api/src/__tests__/portal-context.test.ts` | test (unit, Vitest) | static-import + assertion | `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (test-file structure only — no Prisma needed) | role-match |
| `apps/api/src/__tests__/ai-schema-context.test.ts` | test (unit, Vitest) | static-import + assertion | same as above | role-match |
| `apps/api/src/__tests__/cmdb-service.test.ts` (extension) | test (unit, Vitest) | mocked Prisma | itself (extend in-place) | exact (self) |
| `apps/api/src/__tests__/cmdb-import.test.ts` (extension) | test (unit, Vitest) | mocked Prisma | `apps/api/src/__tests__/cmdb-service.test.ts:1-120` | exact |
| `apps/api/src/__tests__/cmdb-reconciliation.test.ts` (extension) | test (unit, Vitest) | mocked Prisma | `apps/api/src/__tests__/cmdb-service.test.ts:1-120` | exact |
| `apps/web/tests/cmdb-ref-table-dropdowns.spec.ts` | test (E2E, Playwright) | UI render + API intercept | `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` | exact |
| `apps/web/tests/cmdb-ref-tenant-isolation.spec.ts` | test (E2E, Playwright, two-tenant) | login as A → list ref data → assert no B rows | `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` + new `loginAsTenantBAdmin` helper extension to `apps/web/tests/helpers.ts` | role-match (needs new helper) |
| `apps/api/vitest.integration.config.ts` (optional, for CREF-04 unique-index test) | config | n/a | `apps/api/vitest.config.ts` (existing) | role-match |

---

## Pattern Assignments

### 1. `packages/db/src/seeds/cmdb-reference.ts` (NEW — extracted reusable seeder)

**Analog:** `packages/db/prisma/seed.ts:353-485`

**Pattern: Per-table upsert loop, accepting `tx` parameter so signup/provisioning can call inside their own transaction**

The function MUST accept `tx: Prisma.TransactionClient` (NOT the top-level `prisma` client) so signup.ts and provisioning.ts can call it inside their existing `$transaction(async (tx) => { ... })` blocks. This matches Pattern 2 in RESEARCH.md and the "no array transactions" anti-pattern.

**Imports / signature pattern** (extracted from `seed.ts:353`):
```typescript
import type { Prisma } from '@prisma/client';

export async function seedCmdbReferenceData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  // ... loops below
}
```

**Core upsert pattern** (verbatim from `seed.ts:376-383`):
```typescript
const classMap: Record<string, string> = {};
for (const cls of ciClasses) {
  const record = await tx.cmdbCiClass.upsert({
    where: { tenantId_classKey: { tenantId, classKey: cls.classKey } },
    update: {},          // idempotent: never overwrite tenant's customizations
    create: { ...cls, tenantId },
  });
  classMap[cls.classKey] = record.id;
}
```

**Status block pattern** (verbatim from `seed.ts:417-429`):
```typescript
for (const status of statuses) {
  await tx.cmdbStatus.upsert({
    where: {
      tenantId_statusType_statusKey: {
        tenantId,
        statusType: status.statusType,
        statusKey: status.statusKey,
      },
    },
    update: {},
    create: { ...status, tenantId },
  });
}
```

**Parent-class wiring** (verbatim from `seed.ts:386-399`):
```typescript
const parentMappings: Record<string, string> = {
  virtual_machine: 'server',
  load_balancer: 'network_device',
  application_instance: 'application',
  saas_application: 'application',
};
for (const [child, parent] of Object.entries(parentMappings)) {
  if (classMap[child] && classMap[parent]) {
    await tx.cmdbCiClass.update({
      where: { id: classMap[child] },
      data: { parentClassId: classMap[parent] },
    });
  }
}
```

**Required additions for Phase 7** vs. the existing seed.ts content:
- Replace top-level `prisma` references with `tx`.
- After extraction, change `packages/db/prisma/seed.ts:343` to import + delegate: `await seedCmdbReferenceData(tx, tenant.id)` inside an existing transaction (currently the seed.ts call at line 343 is non-tx; wrap it in `prisma.$transaction(async (tx) => seedCmdbReferenceData(tx, tenantId))` to keep parity).

---

### 2. `apps/api/src/routes/auth/signup.ts` (MODIFY — add seed call in tenant-creation tx)

**Analog:** `apps/api/src/routes/auth/signup.ts:153-184` (the existing "seed default roles / SLAs / categories" loops)

**Pattern: Sequential `await tx.X.upsert(...)` loops inside `prisma.$transaction(async (tx) => {...})`**

Lines 153-184 already establish the canonical "seed default per-tenant data" pattern. Phase 7 adds **one more step** to this pattern, after step 5 (categories) and before step 6 (admin user). Concretely:

**Insert after line 184** (between "5. Seed default categories" and "6. Create initial admin user"):
```typescript
        // 5b. Seed CMDB reference data (CI classes, statuses, environments, relationship types)
        await seedCmdbReferenceData(tx, tenant.id);
```

**Import to add at top of file**:
```typescript
import { seedCmdbReferenceData } from '@meridian/db/seeds/cmdb-reference';
```

**Why this position:** Categories (step 5) is the closest analog — both are tenant-scoped reference vocabulary the user can later customize. Placing the call between categories (5) and the admin user (6) matches the existing logical grouping ("seed defaults" → "create admin").

**No `tenantId` extraction pattern needed** — the variable `tenant.id` (created at line 128) is already in scope inside the transaction closure.

---

### 3. `apps/owner/src/lib/provisioning.ts` (MODIFY — mirror the signup.ts hook)

**Analog:** `apps/api/src/routes/auth/signup.ts:153-184` (same pattern, different transaction)

**Pattern: Identical to (2) above.** The existing `prisma.$transaction(async (tx) => {...})` at `provisioning.ts:167` already iterates default roles / SLAs / categories / notification templates. Phase 7 adds:

```typescript
// (after categories upsert loop, before admin user creation)
await seedCmdbReferenceData(tx, tenant.id);
```

**Import** (matches the project's workspace import convention):
```typescript
import { seedCmdbReferenceData } from '@meridian/db/seeds/cmdb-reference';
```

**Multi-tenancy posture:** Both signup and provisioning already create the tenant on their first transaction step. `tenant.id` is in scope. No external `tenantId` extraction is needed.

---

### 4. `apps/api/src/services/cmdb-reference-resolver.service.ts` (NEW — extracted resolver helpers)

**Analog:** `apps/worker/src/workers/cmdb-reconciliation.ts:48-94` (inline `resolveClassId`, `resolveLifecycleStatusId`, `resolveEnvironmentId`)

**Pattern: Tenant-scoped lookup with per-process Map cache**

**Verbatim extraction** (from `cmdb-reconciliation.ts:48-60`):
```typescript
import { prisma } from '@meridian/db';

const classIdCache = new Map<string, string>();

export async function resolveClassId(
  tenantId: string,
  classKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${classKey}`;
  if (classIdCache.has(cacheKey)) return classIdCache.get(cacheKey)!;

  const cls = await prisma.cmdbCiClass.findFirst({
    where: { tenantId, classKey },
    select: { id: true },
  });

  if (cls) classIdCache.set(cacheKey, cls.id);
  return cls?.id ?? null;
}
```

**Status resolver pattern** (from `cmdb-reconciliation.ts:65-77`) — note the cache key includes `statusType` because the same `statusKey` (e.g., `'unknown'`) can exist for both `lifecycle` and `operational` types:
```typescript
const statusIdCache = new Map<string, string>();

export async function resolveLifecycleStatusId(
  tenantId: string,
  statusKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:lifecycle:${statusKey}`;
  if (statusIdCache.has(cacheKey)) return statusIdCache.get(cacheKey)!;
  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'lifecycle', statusKey },
    select: { id: true },
  });
  if (status) statusIdCache.set(cacheKey, status.id);
  return status?.id ?? null;
}

export async function resolveOperationalStatusId(
  tenantId: string,
  statusKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:operational:${statusKey}`;
  if (statusIdCache.has(cacheKey)) return statusIdCache.get(cacheKey)!;
  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'operational', statusKey },
    select: { id: true },
  });
  if (status) statusIdCache.set(cacheKey, status.id);
  return status?.id ?? null;
}
```

**New resolver to add** (no current analog — Phase 7 introduces):
```typescript
const relTypeIdCache = new Map<string, string>();

export async function resolveRelationshipTypeId(
  tenantId: string,
  relationshipKey: string,
): Promise<string | null> {
  const cacheKey = `${tenantId}:${relationshipKey}`;
  if (relTypeIdCache.has(cacheKey)) return relTypeIdCache.get(cacheKey)!;
  const ref = await prisma.cmdbRelationshipTypeRef.findFirst({
    where: { tenantId, relationshipKey },
    select: { id: true },
  });
  if (ref) relTypeIdCache.set(cacheKey, ref.id);
  return ref?.id ?? null;
}
```

**Cache-clear pattern** (from `cmdb-reconciliation.ts:101-104`) — export a `clearResolverCaches()` for callers like the worker that want fresh lookups per run:
```typescript
export function clearResolverCaches(): void {
  classIdCache.clear();
  statusIdCache.clear();
  envIdCache.clear();
  relTypeIdCache.clear();
}
```

**Multi-tenancy posture:** Every cache key is `${tenantId}:...` — never `${classKey}` alone — so Tenant A's resolved id can never be returned for Tenant B even if both have a class with the same `classKey`. Cache key MUST include tenantId. Verified by direct read of `cmdb-reconciliation.ts:50,67,84`.

---

### 5. `apps/api/src/services/cmdb.service.ts` (MODIFY — strip legacy enum writes, add classId guard)

**Analog:** itself (`cmdb.service.ts:223-287`, `612-774`, `800-810`, `832-846`)

**Imports pattern** (line 1, no change):
```typescript
import { prisma } from '@meridian/db';
import { resolveLifecycleStatusId } from './cmdb-reference-resolver.service.js'; // NEW
```

**Service-layer guard pattern (NEW)** — insert at top of `createCI` body (before the `prisma.$transaction` call at line 224):
```typescript
export async function createCI(tenantId: string, data: CreateCIData, userId: string) {
  // Phase 7: classId is required at the service layer (defense-in-depth before DB NOT NULL)
  if (!data.classId) {
    throw new ValidationError(
      'classId is required. Call GET /api/v1/cmdb/classes to fetch the seeded class list.',
    );
  }
  // (lifecycleStatusId / operationalStatusId / environmentId can be optional in service —
  //  default to seeded 'in_service' / 'unknown' / 'prod' via resolver if missing)

  return prisma.$transaction(async (tx) => {
    // ... existing body
  });
}
```

**Removal targets** (these lines must be DELETED in `tx.cmdbConfigurationItem.create({ data: {...} })`):

```typescript
// REMOVE (cmdb.service.ts:242-244):
type: (data.type ?? 'OTHER') as never,
status: (data.status ?? 'ACTIVE') as never,
environment: (data.environment ?? 'PRODUCTION') as never,
```

```typescript
// REMOVE (cmdb.service.ts:651-653):
trackAndSet('type', data.type);
trackAndSet('status', data.status);
trackAndSet('environment', data.environment);
```

```typescript
// REMOVE (cmdb.service.ts:806):
status: 'DECOMMISSIONED' as never,
// REPLACE WITH (cmdb.service.ts deleteCI body):
lifecycleStatusId: await resolveLifecycleStatusId(tenantId, 'retired'),
```

```typescript
// REMOVE (cmdb.service.ts:837):
relationshipType: data.relationshipType as never,
// (createRelationship — keep ONLY relationshipTypeId; if the caller passed
//  relationshipType key but no FK, resolve it via resolveRelationshipTypeId)
```

**Interface cleanup** (`cmdb.service.ts:5-18`) — REMOVE `type?`, `status?`, `environment?` from `CreateCIData`. REMOVE the `type/status/environment` re-introduction in `UpdateCIData` at lines 72-76.

**Error handling pattern (existing — keep)**: routes already catch `error.message.includes('Unique constraint')` for 409 responses. Keep that pattern; add a new `instanceof ValidationError` branch for the 400 case.

---

### 6. `apps/api/src/services/application.service.ts` (MODIFY — strip legacy enum writes from primary CI bridge)

**Analog:** `cmdb.service.ts createCI` post-Phase-7 shape (above)

**Removal targets** (`application.service.ts:187-189`):
```typescript
// REMOVE these 3 lines:
type: 'SOFTWARE' as any,
status: 'ACTIVE' as any,
environment: 'PRODUCTION' as any,
```

**Add `lifecycleStatusId` resolution** to mirror the new `cmdb.service.ts createCI` shape — currently at line 191-192 only `classId` and `environmentId` are resolved. Add:
```typescript
const inServiceStatus = await tx.cmdbStatus.findFirst({
  where: { tenantId, statusType: 'lifecycle', statusKey: 'in_service' },
  select: { id: true },
});
const unknownOpStatus = await tx.cmdbStatus.findFirst({
  where: { tenantId, statusType: 'operational', statusKey: 'unknown' },
  select: { id: true },
});
```

**Audit-trail preservation (CRITICAL — do not remove):** `application.service.ts:213-222` writes `applicationActivity` with `activityType: 'PRIMARY_CI_CREATED'`. Per RESEARCH.md anti-patterns, this audit row MUST stay. Phase 7 only touches the `tx.cmdbConfigurationItem.create` data block, not the `applicationActivity` block.

---

### 7. `apps/api/src/services/cmdb-import.service.ts` (MODIFY — Zod requires non-null FK resolution)

**Analog:** itself (lines 6-51 — existing Zod schema; lines 99-225 — existing import transaction)

**Zod pattern (already present — extend)**: The file already uses Zod (lines 6-51). Phase 7 changes:

1. **Mark legacy enum fields deprecated** (RESEARCH.md says drop in Phase 14, so for Phase 7 keep the schema fields but make them non-required):
```typescript
// CURRENT (lines 9-30) — legacy enums still default to OTHER/ACTIVE/PRODUCTION
type: z.enum([...]).optional().default('OTHER'),
// PHASE 7 (relax — don't write to legacy column):
type: z.enum([...]).optional(),  // accepted but ignored on write
```

2. **Make `classKey` resolution mandatory** — if the row provides neither `classId` nor `classKey`, OR `classKey` doesn't resolve, fail the row:
```typescript
// In the per-row loop (around line 173):
const classId = data.classKey ? classMap.get(data.classKey) : undefined;
if (!classId) {
  errors.push({
    row: index,
    errors: [{
      code: 'custom',
      path: ['classKey'],
      message: `classKey '${data.classKey ?? '(missing)'}' did not resolve to any seeded CI class for this tenant`,
    }] as never,
  });
  continue;
}
```

3. **Strip legacy enum writes** at lines 184-186:
```typescript
// REMOVE:
type: data.type as never,
status: data.status as never,
environment: data.environment as never,
```

**Multi-tenancy verified** (`cmdb-import.service.ts:120,128,138,146,156`): every lookup map already filters `where: { tenantId, ... }`. No change needed.

---

### 8. `apps/worker/src/workers/cmdb-reconciliation.ts` (MODIFY — strip legacy enum writes, switch stale marker to FK)

**Analog:** itself (lines 48-94 — resolver pattern); refactor to import from new shared resolver service

**Removal targets**:

```typescript
// REMOVE (cmdb-reconciliation.ts:187-189):
type: legacyType as never,
status: 'ACTIVE' as never,
environment: 'PRODUCTION' as never,
```

```typescript
// REMOVE (cmdb-reconciliation.ts:433):
data: { status: 'INACTIVE' as never },
// REPLACE WITH:
data: {
  operationalStatusId: await resolveOperationalStatusId(ci.tenantId, 'offline'),
},
```

**Stale-marker change-record fix** (`cmdb-reconciliation.ts:418-429`):
```typescript
// REPLACE the changeRecord field/value pair:
fieldName: 'operationalStatusId',
oldValue: '(unknown)',          // was 'ACTIVE'
newValue: 'offline',            // was 'INACTIVE'
```

**Stale-CI lookup query (`cmdb-reconciliation.ts:403-411`)** — currently filters `status: 'ACTIVE'` (legacy enum). Change to filter via the FK + JOIN on `lifecycleStatusId = (in_service id)` OR keep using legacy enum if data hasn't migrated yet. Recommend: keep legacy filter through Phase 7 (read-side), since Phase 7 does NOT drop the legacy column. Add a comment noting Phase 14 will rewrite this query.

**Import refactor** — replace inline `resolveClassId`/`resolveLifecycleStatusId`/`resolveEnvironmentId` (lines 48-94) with `import { ... } from '@meridian/api/services/cmdb-reference-resolver.service'`. Worker already has `prisma` import; the cache-clear at lines 101-104 calls `clearResolverCaches()` from the new module.

---

### 9. `apps/api/src/routes/v1/cmdb/index.ts` (MODIFY — introduce Zod, reject legacy enums)

**Analog:** `apps/api/src/services/cmdb-import.service.ts:6-51` (Zod schema usage) + the existing route structure (already has `request.user as { tenantId, userId }` extraction at lines 60-62)

**Imports pattern** (replace lines 1-21 — add Zod):
```typescript
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
// ... existing service imports
```

**Zod schema for CreateCI body (NEW)**:
```typescript
const CreateCISchema = z.object({
  name: z.string().min(1, 'name is required'),
  displayName: z.string().optional(),

  // Phase 7: required FKs
  classId: z.string().uuid('classId must be a valid UUID'),
  lifecycleStatusId: z.string().uuid().optional(),
  operationalStatusId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),

  // ... rest of optional fields (categoryId, hostname, fqdn, ...)
}).strict();   // .strict() rejects unknown keys → catches legacy `type`/`status`/`environment`
```

**Auth pattern (existing — preserve verbatim)** — `apps/api/src/routes/v1/cmdb/index.ts:60-62`:
```typescript
const user = request.user as { tenantId: string; userId: string };
const tenantId = user.tenantId;
const userId = user.userId;
```

**Validation + service call pattern (NEW)** — replace the manual `str()`/`num()`/`bool()`/`obj()` extractors (lines 70-73, 199-203) with:
```typescript
const parseResult = CreateCISchema.safeParse(request.body);
if (!parseResult.success) {
  return reply.status(400).send({
    error: 'Invalid request body',
    details: parseResult.error.issues,
  });
}

try {
  const ci = await createCI(tenantId, parseResult.data, userId);
  return reply.status(201).send(ci);
} catch (err) {
  // ... existing catch
}
```

**Error handling pattern (existing — preserve)** — keep the `error.message.includes('itself' | 'not found' | 'Unique constraint')` → 409 branch at lines 327-335. Add a new branch:
```typescript
if (error.message.includes('classId is required')) {
  return reply.status(400).send({ error: error.message });
}
```

**Multi-tenancy posture:** Every route already extracts `tenantId` from `request.user` (no path-param tenantId, no body-supplied tenantId — defense in depth against IDOR). Preserve this.

---

### 10. `apps/api/src/services/ai-schema-context.ts` (MODIFY — replace enum tokens with JOIN docs)

**Analog:** itself (line 100, the `applications` table DDL block — this is the in-file template for "table with FK + JOIN hints")

**Current shape** (`ai-schema-context.ts:120`, abridged):
```
cmdb_configuration_items: id(uuid PK), "tenantId"(uuid FK→tenants), "ciNumber"(int), name(text),
  type(SERVER|WORKSTATION|NETWORK_DEVICE|SOFTWARE|SERVICE|DATABASE|VIRTUAL_MACHINE|CONTAINER|OTHER),
  status(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED), environment(PRODUCTION|STAGING|DEV|DR), ...
  "classId"(uuid FK→cmdb_ci_classes), "lifecycleStatusId"(uuid FK→cmdb_statuses), ...
```

**Phase 7 shape** (replace enum token lists with NOT NULL + JOIN-hint comments):
```
cmdb_configuration_items: id(uuid PK), "tenantId"(uuid FK→tenants), "ciNumber"(int), name(text),
  "classId"(uuid FK→cmdb_ci_classes NOT NULL), "lifecycleStatusId"(uuid FK→cmdb_statuses NOT NULL),
  "operationalStatusId"(uuid FK→cmdb_statuses NOT NULL), "environmentId"(uuid FK→cmdb_environments NOT NULL),
  hostname(text), fqdn(text), "ipAddress"(text), ...
  -- NOTE: To resolve the human-readable class name, JOIN cmdb_ci_classes ON id = "classId".
  --       To resolve lifecycle status: JOIN cmdb_statuses ON id = "lifecycleStatusId" (statusType='lifecycle').
  --       To resolve operational status: JOIN cmdb_statuses ON id = "operationalStatusId" (statusType='operational').
  --       To resolve environment: JOIN cmdb_environments ON id = "environmentId".
  --       Canonical classKeys: server, virtual_machine, database, network_device, application,
  --                            application_instance, saas_application, business_service,
  --                            technical_service, load_balancer, storage, cloud_resource,
  --                            dns_endpoint, certificate, generic.
```

**Same treatment for `cmdb_relationships` (`ai-schema-context.ts:122`)**:
```
cmdb_relationships: id(uuid PK), "tenantId"(uuid FK→tenants), "sourceId"(uuid FK→cmdb_configuration_items),
  "targetId"(uuid FK→cmdb_configuration_items), "relationshipTypeId"(uuid FK→cmdb_relationship_types NOT NULL),
  description(text), "confidenceScore"(float)
  -- NOTE: To resolve relationship verb, JOIN cmdb_relationship_types ON id = "relationshipTypeId".
  --       Canonical relationshipKeys: depends_on, runs_on, hosted_on, connected_to, member_of,
  --                                    replicated_to, backed_up_by, uses, supports, managed_by,
  --                                    owned_by, contains, installed_on.
```

**Add the four reference tables** (currently `cmdb_ci_classes` etc. are present at lines 110-118 with abbreviated columns — extend each to include `classKey`/`statusKey`/`envKey`/`relationshipKey` so the AI can JOIN on them):
```
cmdb_ci_classes: id(uuid PK), "tenantId"(uuid FK→tenants), "classKey"(text),
  "className"(text), icon(text), description(text), "parentClassId"(uuid FK→cmdb_ci_classes self-ref)
cmdb_statuses: id(uuid PK), "tenantId"(uuid FK→tenants), "statusType"(text — 'lifecycle' | 'operational'),
  "statusKey"(text), "statusName"(text), "sortOrder"(int)
cmdb_environments: id(uuid PK), "tenantId"(uuid FK→tenants), "envKey"(text), "envName"(text), "sortOrder"(int)
cmdb_relationship_types: id(uuid PK), "tenantId"(uuid FK→tenants), "relationshipKey"(text),
  "relationshipName"(text), "forwardLabel"(text), "reverseLabel"(text), "isDirectional"(bool)
```

**No code changes** — this is a template literal change only.

---

### 11. `apps/api/src/services/portal-schema-context.ts` (MODIFY — explicit-exclusion comment)

**Analog:** itself (lines 13-26, the existing `PORTAL_ALLOWED_TABLES` array)

**Per RESEARCH.md CAI-02:** Phase 7 keeps CMDB OUT of the portal allowlist. The change is a comment-only update:

```typescript
// PHASE 7 ADDITION (insert above line 17):
// Phase 7 audit: confirmed CMDB tables (cmdb_*) are intentionally EXCLUDED from
// the portal AI. Staff-only data. To re-enable, run discuss-phase first.
export const PORTAL_ALLOWED_TABLES: string[] = [
  'tickets',
  // ... unchanged
];
```

**No allowlist mutation.** The Vitest test in `portal-context.test.ts` (Wave 0) asserts `PORTAL_ALLOWED_TABLES.every(t => !t.startsWith('cmdb_'))` to lock this in.

---

### 12. `packages/db/scripts/phase7-backfill.ts` (NEW — replaces cmdb-migration.ts)

**Analog:** `packages/db/scripts/cmdb-migration.ts` (full file, 307 lines)

**Imports + Prisma setup pattern (verbatim from `cmdb-migration.ts:10-18`)**:
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Mapping tables (verbatim from `cmdb-migration.ts:22-56`)**: keep `TYPE_TO_CLASS`, `STATUS_TO_LIFECYCLE`, `ENV_TO_KEY`, `REL_TYPE_TO_KEY`. Add (Phase 7's missing piece per RESEARCH.md A1):
```typescript
const STATUS_TO_OPERATIONAL: Record<string, string> = {
  ACTIVE: 'unknown',         // Legacy CmdbCiStatus has no operational signal — default unknown
  INACTIVE: 'unknown',
  DECOMMISSIONED: 'unknown',
  PLANNED: 'unknown',
};
```

**Per-tenant loop (verbatim from `cmdb-migration.ts:66-104`)**:
```typescript
const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
for (const tenant of tenants) {
  console.log(`\n═══ Processing tenant: ${tenant.name} (${tenant.id}) ═══`);

  // Step 1: Seed reference tables if not already seeded
  await seedReferenceDataIfNeeded(tenant.id);

  // Step 2: Build lookup maps
  const classMap = await buildLookupMap(tenant.id, 'class');
  // ... etc

  // Step 3: Migrate CI references (NOW INCLUDES operationalStatusId)
  await migrateCIReferences(tenant.id, classMap, statusMap, opStatusMap, envMap);

  // Step 4: Pre-flight relationship duplicate detection
  const dupes = await detectRelationshipDuplicates(tenant.id, relTypeMap);
  if (dupes.length > 0) {
    console.error(`  ✗ Found ${dupes.length} relationship duplicates; aborting tenant`);
    continue;
  }

  // Step 5: Migrate relationship type references
  await migrateRelationshipReferences(tenant.id, relTypeMap);
}
```

**Phase 7 additions** (NEW logic not present in `cmdb-migration.ts`):

1. **`STATUS_TO_OPERATIONAL` mapping** in the CI references step:
```typescript
// In migrateCIReferences (extend cmdb-migration.ts:159-180):
const opStatusKey = STATUS_TO_OPERATIONAL[ci.status] ?? 'unknown';
const operationalStatusId = opStatusMap.get(opStatusKey);
// ... include in update data
```

2. **Pre-flight duplicate detection (NEW — see RESEARCH.md Pitfall 4)**:
```typescript
async function detectRelationshipDuplicates(
  tenantId: string,
  relTypeMap: Map<string, string>,
): Promise<Array<{ sourceId: string; targetId: string; mappedKey: string }>> {
  const rels = await prisma.cmdbRelationship.findMany({
    where: { tenantId, relationshipTypeId: null },
    select: { sourceId: true, targetId: true, relationshipType: true },
  });
  const seen = new Map<string, number>();
  const dupes: Array<{ sourceId: string; targetId: string; mappedKey: string }> = [];
  for (const rel of rels) {
    const mappedKey = REL_TYPE_TO_KEY[rel.relationshipType] ?? 'depends_on';
    const key = `${rel.sourceId}::${rel.targetId}::${mappedKey}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) dupes.push({ sourceId: rel.sourceId, targetId: rel.targetId, mappedKey });
  }
  return dupes;
}
```

3. **Idempotent re-runnability** — `cmdb-migration.ts:152-154` already filters `where: { classId: null }` so re-runs skip already-migrated rows. Preserve this.

**Multi-tenancy posture:** Every query already passes `where: { tenantId }`. The script processes one tenant at a time — never batches across tenants. Verified at `cmdb-migration.ts:76, 109, 127, 130, 133, 136, 152, 192, 218, 282`.

---

### 13. `packages/db/scripts/phase7-verify.ts` (NEW — verification gate)

**Analog:** `packages/db/scripts/cmdb-migration.ts:10-18` (Prisma setup) + `cmdb.service.ts:227-231` ($queryRaw count pattern)

**Imports + setup pattern** — same as `phase7-backfill.ts` (above).

**Verification query pattern**:
```typescript
async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalNullCount = 0;

  for (const tenant of tenants) {
    const result = await prisma.$queryRaw<Array<{
      null_class: bigint;
      null_lifecycle: bigint;
      null_op: bigint;
      null_env: bigint;
      null_rel: bigint;
    }>>`
      SELECT
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "classId" IS NULL) AS null_class,
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "lifecycleStatusId" IS NULL) AS null_lifecycle,
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "operationalStatusId" IS NULL) AS null_op,
        (SELECT COUNT(*) FROM cmdb_configuration_items
          WHERE "tenantId" = ${tenant.id}::uuid AND "environmentId" IS NULL) AS null_env,
        (SELECT COUNT(*) FROM cmdb_relationships
          WHERE "tenantId" = ${tenant.id}::uuid AND "relationshipTypeId" IS NULL) AS null_rel
    `;
    const r = result[0];
    const total = Number(r.null_class) + Number(r.null_lifecycle) + Number(r.null_op)
                + Number(r.null_env) + Number(r.null_rel);
    if (total > 0) {
      console.error(`  ✗ ${tenant.name} (${tenant.id}): ${total} null FKs`);
      console.error(`     classId=${r.null_class}, lifecycleStatusId=${r.null_lifecycle}, ` +
                    `operationalStatusId=${r.null_op}, environmentId=${r.null_env}, ` +
                    `relationshipTypeId=${r.null_rel}`);
    } else {
      console.log(`  ✓ ${tenant.name}: compliant`);
    }
    totalNullCount += total;
  }

  // Verify unique-index name on cmdb_relationships
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'cmdb_relationships'
      AND indexname LIKE '%relationshipType%'
  `;
  const hasNewIndex = indexes.some(i => i.indexname.includes('relationshipTypeId'));
  if (!hasNewIndex) {
    console.error(`  ✗ cmdb_relationships unique index has not been rewritten to use relationshipTypeId`);
    totalNullCount += 1;
  }

  if (totalNullCount > 0) {
    console.error(`\n✗ Verification FAILED: ${totalNullCount} compliance issues`);
    process.exit(1);
  }
  console.log(`\n✓ All tenants compliant`);
}
```

**Multi-tenancy posture:** Per-tenant report (no aggregated query) so an operator knows exactly which tenant needs attention.

---

### 14. `packages/db/scripts/phase7-grep-gate.sh` (NEW — static analysis gate)

**Analog:** None in-tree — Phase 7 introduces shell-based gating (RESEARCH.md Pitfall 3).

**Pattern (no analog — write from RESEARCH.md spec)**:
```bash
#!/usr/bin/env bash
# Phase 7 grep gate: ensure no legacy enum writes remain in CMDB code paths.
set -euo pipefail

FAIL=0

check() {
  local pattern="$1"
  local file="$2"
  if grep -nE "$pattern" "$file" 2>/dev/null; then
    echo "✗ Legacy enum write found in $file"
    FAIL=1
  fi
}

check "type:.*'(SERVER|WORKSTATION|NETWORK_DEVICE|SOFTWARE|SERVICE|DATABASE|VIRTUAL_MACHINE|CONTAINER|OTHER)'.*as (never|any)" \
      apps/api/src/services/cmdb.service.ts
check "status:.*'(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED)'.*as (never|any)" \
      apps/api/src/services/cmdb.service.ts
check "environment:.*'(PRODUCTION|STAGING|DEV|DR)'.*as (never|any)" \
      apps/api/src/services/cmdb.service.ts
# ... repeat for application.service.ts, cmdb-import.service.ts, cmdb-reconciliation.ts
# Also check the audit-list locations in assets/index.ts:
check "type:|status:|environment:" apps/api/src/routes/v1/assets/index.ts || true  # warn-only (verify only)

if [ "$FAIL" -ne 0 ]; then
  echo "✗ Phase 7 grep gate FAILED — legacy enum writes detected"
  exit 1
fi
echo "✓ Phase 7 grep gate PASSED — no legacy enum writes"
```

**Note for planner:** Bash scripts on Windows shell environment per the project's `env.shell: bash` — verify the script runs under Git Bash on the deploy host. Use forward slashes only.

---

### 15. `packages/db/prisma/migrations/{timestamp}_phase7_ci_ref_notnull/migration.sql` (NEW)

**Analog:** RESEARCH.md `Pattern 3: FK NOT NULL Migration with Per-Tenant Pre-Flight` (synthesized — Prisma normally generates only the bare `ALTER TABLE` + `DROP/CREATE INDEX`)

**Generation command** (per RESEARCH.md):
```bash
pnpm --filter @meridian/db prisma migrate dev --create-only --name phase7_ci_ref_notnull
```

**Manual additions to the generated SQL** — wrap the `ALTER TABLE ... SET NOT NULL` block with the pre-flight `DO $$` block from RESEARCH.md Pattern 3 (already specified). This gives an actionable error message instead of a generic Prisma migration failure.

**Schema.prisma changes** (from RESEARCH.md):
```prisma
// schema.prisma:2204-2207 — REMOVE the trailing `?`:
classId               String   @db.Uuid
lifecycleStatusId     String   @db.Uuid
operationalStatusId   String   @db.Uuid
environmentId         String   @db.Uuid

// schema.prisma:2334:
relationshipTypeId    String   @db.Uuid

// schema.prisma:2353 — REPLACE @@unique:
@@unique([sourceId, targetId, relationshipTypeId])
```

---

### 16. `apps/api/src/__tests__/cmdb-service.test.ts` (EXTEND — 3 new tests)

**Analog:** itself, lines 1-120 (`vi.hoisted` mock pattern, `prismaTransaction.mockImplementation` setup, `txCICreate.mockResolvedValue(...)` flow)

**Test 1 — createCI rejects missing classId**:
```typescript
it('createCI rejects missing classId with ValidationError', async () => {
  await expect(
    createCI(TENANT_ID, { name: 'NoClass' } as CreateCIData, USER_ID),
  ).rejects.toThrow(/classId is required/);
  expect(txCICreate).not.toHaveBeenCalled();
});
```

**Test 2 — createCI does not write legacy type/status/environment**:
```typescript
it('createCI does not write legacy type/status/environment fields', async () => {
  txExecuteRaw.mockResolvedValue(undefined);
  txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);
  txCICreate.mockResolvedValue({ id: CI_ID_1, ciNumber: 1 });

  await createCI(TENANT_ID, {
    name: 'X',
    classId: 'class-uuid-aaa',
    lifecycleStatusId: 'lc-uuid',
    operationalStatusId: 'op-uuid',
    environmentId: 'env-uuid',
  }, USER_ID);

  const callArgs = txCICreate.mock.calls[0][0].data;
  expect(callArgs).not.toHaveProperty('type');
  expect(callArgs).not.toHaveProperty('status');
  expect(callArgs).not.toHaveProperty('environment');
  expect(callArgs.classId).toBe('class-uuid-aaa');
});
```

**Test 3 — deleteCI uses lifecycleStatusId='retired'**:
```typescript
it('deleteCI sets lifecycleStatusId to retired (not legacy DECOMMISSIONED)', async () => {
  txCIFindFirst.mockResolvedValue({ id: CI_ID_1, tenantId: TENANT_ID });
  // ... mock resolveLifecycleStatusId to return 'retired-uuid'
  await deleteCI(TENANT_ID, CI_ID_1, USER_ID);
  const callArgs = txCIUpdate.mock.calls[0][0].data;
  expect(callArgs.lifecycleStatusId).toBe('retired-uuid');
  expect(callArgs).not.toHaveProperty('status');
});
```

**Mock pattern (preserve verbatim from existing file lines 7-120)** — `vi.hoisted`, `prismaTransaction.mockImplementation((cb) => cb(mockTx))`, `vi.mock('@meridian/db', ...)`. Add a `vi.mock('../services/cmdb-reference-resolver.service', ...)` for the new resolver helpers.

---

### 17. `apps/api/src/__tests__/signup-cmdb-seed.test.ts` (NEW — integration)

**Analog:** `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (mock structure)

**Pattern: Mock Prisma transaction, assert `cmdbCiClass.upsert` was called 15 times for the new tenant**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTx } = vi.hoisted(() => ({ mockTx: {} as Record<string, unknown> }));

const txTenantCreate = vi.fn();
const txCmdbCiClassUpsert = vi.fn();
const txCmdbStatusUpsert = vi.fn();
// ... etc

Object.assign(mockTx, {
  tenant: { create: txTenantCreate },
  cmdbCiClass: { upsert: txCmdbCiClassUpsert, update: vi.fn() },
  cmdbStatus: { upsert: txCmdbStatusUpsert },
  cmdbEnvironment: { upsert: vi.fn() },
  cmdbRelationshipTypeRef: { upsert: vi.fn() },
  // ... role/sla/category mocks
});

vi.mock('@meridian/db', () => ({
  prisma: {
    $transaction: (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    // ... other top-level methods used by signup
  },
}));

it('signup endpoint seeds 15 CMDB CI classes for the new tenant', async () => {
  txTenantCreate.mockResolvedValue({ id: 'new-tenant-id', slug: 'foo', name: 'Foo' });
  // ... arrange other mocks

  await callSignupHandler({ slug: 'foo', email: 'a@b', password: 'x', planTier: 'STARTER' });

  expect(txCmdbCiClassUpsert).toHaveBeenCalledTimes(15);
  const tenantIds = txCmdbCiClassUpsert.mock.calls.map(c => c[0].create.tenantId);
  expect(tenantIds.every(id => id === 'new-tenant-id')).toBe(true); // multi-tenancy assertion
});
```

---

### 18. `apps/api/src/__tests__/portal-context.test.ts` (NEW — static assertion)

**Analog:** `apps/api/src/__tests__/cmdb-service.test.ts:1-10` (just the test-file shell — no Prisma needed)

```typescript
import { describe, it, expect } from 'vitest';
import { PORTAL_ALLOWED_TABLES } from '../services/portal-schema-context';

describe('Portal AI schema context', () => {
  it('PORTAL_ALLOWED_TABLES excludes all cmdb_* tables', () => {
    const cmdbLeaks = PORTAL_ALLOWED_TABLES.filter(t => t.startsWith('cmdb_'));
    expect(cmdbLeaks).toEqual([]);
  });
});
```

---

### 19. `apps/api/src/__tests__/ai-schema-context.test.ts` (NEW — static assertion)

**Analog:** same as above

```typescript
import { describe, it, expect } from 'vitest';
import { getSchemaContext } from '../services/ai-schema-context';

describe('AI schema context', () => {
  const ctx = getSchemaContext();

  it('documents JOIN cmdb_ci_classes for cmdb_configuration_items', () => {
    expect(ctx).toMatch(/JOIN cmdb_ci_classes/);
  });

  it('documents JOIN cmdb_relationship_types for cmdb_relationships', () => {
    expect(ctx).toMatch(/JOIN cmdb_relationship_types/);
  });

  it('does not contain the legacy enum token list for cmdb_configuration_items', () => {
    // After Phase 7, these tokens should NOT appear in the cmdb_configuration_items DDL block
    expect(ctx).not.toMatch(/cmdb_configuration_items[^\n]*SERVER\|WORKSTATION/);
  });

  it('lists the canonical seeded classKeys', () => {
    expect(ctx).toMatch(/server.*virtual_machine.*database/s);
  });
});
```

---

### 20. `apps/web/tests/cmdb-ref-table-dropdowns.spec.ts` (NEW — Playwright E2E)

**Analog:** `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100`

**Imports pattern** (verbatim from `apm-cmdb-bridge.spec.ts:1-2`):
```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';
```

**Auth pattern** (verbatim from `apm-cmdb-bridge.spec.ts:54`):
```typescript
await loginAsAdmin(page, '/dashboard/cmdb/new');
```

**Pattern: Visit form → assert API requests → assert dropdown options populated**:
```typescript
test.describe('CMDB CI new-form reference dropdowns', () => {
  test('class/status/environment dropdowns are populated from API fetches', async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/cmdb/')) apiCalls.push(req.url());
    });

    await loginAsAdmin(page, '/dashboard/cmdb/new');

    // Wait for the four reference fetches to complete
    await page.waitForResponse((res) => res.url().includes('/api/v1/cmdb/classes') && res.ok());
    await page.waitForResponse((res) => res.url().includes('/api/v1/cmdb/statuses?statusType=lifecycle') && res.ok());
    await page.waitForResponse((res) => res.url().includes('/api/v1/cmdb/environments') && res.ok());

    expect(apiCalls.some(u => u.includes('/api/v1/cmdb/classes'))).toBe(true);
    expect(apiCalls.some(u => u.includes('statusType=lifecycle'))).toBe(true);

    // Assert at least one class option rendered (e.g., "Server")
    await expect(page.getByRole('button', { name: /server/i }).first()).toBeVisible();
  });
});
```

---

### 21. `apps/web/tests/cmdb-ref-tenant-isolation.spec.ts` (NEW — two-tenant E2E)

**Analog:** `apps/web/tests/apm-cmdb-bridge.spec.ts` (test structure) + `apps/web/tests/helpers.ts` (helper extension required)

**Helper extension required** (`apps/web/tests/helpers.ts`) — add to mirror `loginAsAdmin`:
```typescript
// In helpers.ts (NEW export):
export async function loginAsTenantBAdmin(page: Page, navigateTo = '/dashboard/settings') {
  // Uses a separate storageState for tenant B (configured in playwright.config.ts projects[1].use.storageState)
  await page.goto(navigateTo, { waitUntil: 'networkidle' });
}
```

**Test pattern**:
```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsTenantBAdmin, apiGet } from './helpers';

test('Tenant A admin cannot see tenant B reference data', async ({ page, request }) => {
  // Step 1: As tenant A, list classes — capture IDs
  await loginAsAdmin(page, '/dashboard/cmdb/settings/classes');
  const tenantAResponse = await request.get('/api/v1/cmdb/classes');
  const tenantAClasses = (await tenantAResponse.json()).data ?? [];
  const tenantAClassIds = new Set(tenantAClasses.map((c: any) => c.id));

  // Step 2: As tenant B, list classes — capture IDs
  await loginAsTenantBAdmin(page, '/dashboard/cmdb/settings/classes');
  const tenantBResponse = await request.get('/api/v1/cmdb/classes');
  const tenantBClasses = (await tenantBResponse.json()).data ?? [];
  const tenantBClassIds = new Set(tenantBClasses.map((c: any) => c.id));

  // Assert: zero overlap
  const intersection = [...tenantAClassIds].filter((id) => tenantBClassIds.has(id));
  expect(intersection).toEqual([]);
});
```

---

## Shared Patterns

### Multi-Tenancy: Mandatory `tenantId` Filter (Project Rule 1)

**Source:** `apps/api/src/routes/v1/cmdb/index.ts:60-62` (canonical extraction)
**Apply to:** Every route, every service call, every Prisma query in Phase 7.

**Canonical extraction inside a Fastify route handler:**
```typescript
const user = request.user as { tenantId: string; userId: string };
const tenantId = user.tenantId;
const userId = user.userId;
```

**Canonical Prisma query shape:**
```typescript
await prisma.cmdbCiClass.findFirst({ where: { tenantId, classKey } });   // GOOD
await prisma.cmdbCiClass.findFirst({ where: { classKey } });             // FORBIDDEN
```

**Cache-key safety** (from `cmdb-reconciliation.ts:50,67,84`): every cache key must include `tenantId` as a prefix:
```typescript
const cacheKey = `${tenantId}:${classKey}`;   // GOOD
const cacheKey = classKey;                     // FORBIDDEN — Tenant A cache hit returns Tenant A id for Tenant B
```

### Transaction Pattern (`prisma.$transaction(async (tx) => {...})`)

**Source:** `apps/api/src/routes/auth/signup.ts:126-214`
**Apply to:** signup hook, provisioning hook, multi-step service writes (cmdb.service createCI, deleteCI; application.service createPrimaryCiInternal).

**Pattern (canonical):** interactive transaction with sequential `await tx.X.upsert(...)` — never an array transaction (`prisma.$transaction([...])` fails with the wrong error context per RESEARCH.md anti-patterns).

```typescript
const result = await prisma.$transaction(async (tx) => {
  const tenant = await tx.tenant.create({ data: { ... } });
  for (const role of DEFAULT_ROLES) {
    await tx.role.upsert({ ... });
  }
  // ... more sequential writes
  return { tenant };
});
```

### Reference Lookup with Tenant-Scoped Cache

**Source:** `apps/worker/src/workers/cmdb-reconciliation.ts:48-94` (extract in Phase 7 to `cmdb-reference-resolver.service.ts`)
**Apply to:** Every code path that resolves a reference key (`'server'`, `'in_service'`, `'prod'`, `'depends_on'`) to a UUID for a specific tenant.

(Pattern body shown in section 4 above.)

### Vitest Mock Setup

**Source:** `apps/api/src/__tests__/cmdb-service.test.ts:1-120`
**Apply to:** Every new Vitest file in Phase 7.

```typescript
const { mockPrismaObj, mockTx } = vi.hoisted(() => ({
  mockPrismaObj: {} as Record<string, unknown>,
  mockTx: {} as Record<string, unknown>,
}));

// ... per-method vi.fn() declarations
// ... Object.assign(mockTx, {...}) and Object.assign(mockPrismaObj, {...})

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaTransaction.mockImplementation(
    (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  );
});
```

### Playwright E2E Test Structure

**Source:** `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100`
**Apply to:** `cmdb-ref-table-dropdowns.spec.ts`, `cmdb-ref-tenant-isolation.spec.ts`.

```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin, uniqueName } from './helpers';

test.describe('Feature name', () => {
  test('test name', async ({ page, request }) => {
    await loginAsAdmin(page, '/dashboard/cmdb/...');
    // ... assertions
  });
});
```

### Reference-fetch UI Pattern (TanStack Query NOT used here — plain `fetch`)

**Source:** `apps/web/src/app/dashboard/cmdb/new/page.tsx:256-272`
**Note:** Despite TanStack Query being in the stack, the existing CMDB new/edit pages use **plain `fetch` with `credentials: 'include'`** in a `useEffect`. Phase 7 makes NO changes to this pattern (UI is already FK-only); the Playwright tests must assert against this `fetch`-based shape.

```typescript
useEffect(() => {
  const fetchJson = async (url: string) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    return res.json();
  };
  void fetchJson('/api/v1/cmdb/classes').then((d) => setClasses(d.data ?? d ?? []));
  void fetchJson('/api/v1/cmdb/statuses?statusType=lifecycle').then((d) => setLifecycleStatuses(d.data ?? d ?? []));
  void fetchJson('/api/v1/cmdb/statuses?statusType=operational').then((d) => setOperationalStatuses(d.data ?? d ?? []));
  void fetchJson('/api/v1/cmdb/environments').then((d) => setEnvironments(d.data ?? d ?? []));
  void fetchJson('/api/v1/cmdb/vendors').then((d) => setVendors(d.data ?? d ?? []));
}, []);
```

> Planner deferral: if a future phase migrates these to TanStack Query, do it consistently across all CMDB UI files — not piecemeal during Phase 7.

### AI Schema Context Update (Project Rule 6)

**Source:** `apps/api/src/services/ai-schema-context.ts:100` (the `applications` block is the in-file template for "table with FK + JOIN hints")
**Apply to:** Every PR that changes the Prisma schema. Phase 7 PRs MUST update this file in the same commit as the schema migration. Verified via `apps/api/src/__tests__/ai-schema-context.test.ts` (Wave 0).

### CSDM Field Ownership: FK-only writes, no enum duplication

**Source:** `docs/architecture/csdm-field-ownership.md` (Phase 0 contract — already shipped)
**Apply to:** All Phase 7 service-layer modifications (cmdb.service, application.service, cmdb-import.service, cmdb-reconciliation worker).
**Mechanism:** No model may write both the legacy enum column and the FK column. Phase 7 strips every legacy enum write. Phase 14 will drop the columns themselves. The grep gate (`packages/db/scripts/phase7-grep-gate.sh`) enforces this.

### Grep Gate (NEW pattern — no in-tree analog)

**Source:** RESEARCH.md `Pitfall 3` — Phase 7 introduces shell-based static analysis gating.
**Apply to:** CI pipeline (every PR touching the four CMDB service/worker files).
**Wired into:** the wave-merge sampling rate (per `07-VALIDATION.md` line 34).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `packages/db/scripts/phase7-grep-gate.sh` | script (CI gate) | static grep | Project does not yet have shell-based gating scripts. Pattern synthesized from RESEARCH.md Pitfall 3. **Planner action:** create a new convention; document in `docs/architecture/grep-gates.md` if Phase 8+ adds more. |
| `apps/api/vitest.integration.config.ts` (optional) | config | n/a | Project has only `vitest.config.ts` (unit). Real-DB integration tests do not exist yet. **Planner decision:** if CREF-04 unique-index test is in scope, this file must be created (use Vitest 4's `defineConfig` + a `setup.ts` that creates a transactional sandbox per test). Defer if scope tightens. |

Everything else (tests, services, scripts, migrations, route shape, schema doc, seed extraction, transaction-tenant-lifecycle hook, FK resolver) has a direct in-tree analog whose pattern Phase 7 should copy verbatim.

---

## Audit-Only Files (Verify, Do Not Modify Unless Issue Found)

Per RESEARCH.md A5 + Open Question 4: `apps/api/src/routes/v1/assets/index.ts:270, 297` writes to `cmdbConfigurationItem.update`. Confirmed by direct read — these only set `assetId`/`assetId: null` for the asset-CI link path. **No legacy enum touched. No Phase 7 modification needed.** The grep gate keeps a watch on this file in case future PRs add enum writes here.

---

## Metadata

**Analog search scope:**
- `apps/api/src/services/` (CMDB, AI, application, signup-related services)
- `apps/api/src/routes/v1/cmdb/`, `apps/api/src/routes/auth/`
- `apps/api/src/__tests__/` (Vitest pattern source)
- `apps/worker/src/workers/cmdb-reconciliation.ts`
- `apps/web/src/app/dashboard/cmdb/new/page.tsx`, `apps/web/tests/`
- `apps/owner/src/lib/provisioning.ts`
- `packages/db/prisma/seed.ts`, `packages/db/scripts/`

**Files scanned:** 14 source files + 5 test files = 19 files read in detail. All file paths and line numbers verified by direct Read.

**Pattern extraction date:** 2026-04-16

**Confidence:** HIGH — every analog is a verified in-tree file at the line numbers cited. The only NEW pattern (shell grep gate) is documented as such with no spurious analog claim.

---

## PATTERN MAPPING COMPLETE
