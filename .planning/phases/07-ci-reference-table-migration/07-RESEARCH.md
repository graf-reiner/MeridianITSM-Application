# Phase 7: CI Reference-Table Migration — Research

**Researched:** 2026-04-16
**Domain:** Schema migration, ORM enum→FK cutover, multi-tenant data backfill
**Confidence:** HIGH (this phase touches code already in the repo; almost everything is verified by direct file read)

---

## Summary

The reference-table migration is **~75% pre-built** but **0% gated**. The Prisma schema, the four reference tables (`CmdbCiClass`, `CmdbStatus`, `CmdbEnvironment`, `CmdbRelationshipTypeRef`), the master seeder (`packages/db/prisma/seed.ts:353`), the per-tenant migration script (`packages/db/scripts/cmdb-migration.ts`), the reference CRUD service (`apps/api/src/services/cmdb-reference.service.ts`), the reference REST routes (`apps/api/src/routes/v1/cmdb/reference.ts`), and the new/edit CMDB UI pages all already exist and already write FK ids. **What is missing is the enforcement: FK columns are still nullable, legacy enum columns are still required (`@default(...)`), every CI write still writes both, and tenants created via signup never get reference data seeded** — meaning the moment FK columns become NOT NULL, signup-created tenants will fail every CI create.

Phase 7 is therefore not "build the reference-table system" — it's "**finish, gate, and lock** the reference-table system that's been half-shipped, then prove it stuck."

**Primary recommendation:** Adopt the **two-deploy gate pattern** the master plan already mandates. Deploy A (this phase): seed reference data on every tenant lifecycle path, eliminate every legacy enum write at the application layer, run the per-tenant backfill, add a `notNull` enforcement at the **service layer first** with a verification query gate, then promote `classId` / `lifecycleStatusId` / `operationalStatusId` / `environmentId` / `relationshipTypeId` to `NOT NULL` in Prisma + rewrite the relationship unique index to use the FK. Deploy B (Phase 14): destructive drop of the legacy enum columns themselves. **Do not drop legacy enum columns in Phase 7** — that is explicitly Phase 14's job per the master plan, and conflating them removes the safety net.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 7.** The user has not yet run `/gsd-discuss-phase 7`. The constraints below are derived directly from the v2.0 master plan (`C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md`) and `CLAUDE.md` and treated as locked because they are project-level architectural authorities, not phase-level discussion outputs.

### Locked Decisions (from CSDM master plan and CLAUDE.md, treated as authoritative)

- **Multi-tenancy is mandatory.** Every reference table is `tenantId`-scoped (verified — see `schema.prisma:2055, 2078, 2099, 2118`). Every query must filter by `tenantId`. No cross-tenant lookups.
- **Reference tables already exist and are seeded canonically.** `CmdbCiClass` (15 classes), `CmdbStatus` (6 lifecycle + 5 operational), `CmdbEnvironment` (6 envs), `CmdbRelationshipTypeRef` (13 verbs) — see `packages/db/prisma/seed.ts:357-466`. Phase 7 does NOT redesign the seed list; it ensures the seed runs on every tenant.
- **AI Schema Context updates are mandatory in the same PR.** CAI-01, CAI-02, CAI-03 are non-negotiable cross-cutting invariants. Both `apps/api/src/services/ai-schema-context.ts` and `apps/api/src/services/portal-schema-context.ts` (currently a CMDB-free portal context — verify whether portal AI should gain CMDB read access in this phase) must reflect the FK schema changes in the same PR as the schema migration.
- **CSDM Field Ownership Contract governs.** `docs/architecture/csdm-field-ownership.md` is authoritative. Phase 7 is the CmdbConfigurationItem reference-table side of the contract. The contract's "reference tables over enums" rule (section "Rules every future change must follow", item 5) makes this phase its first enforcement.
- **Legacy enum columns stay through Phase 7.** The master plan splits destructive column drops to Phase 14 with a one-tenant one-week production canary. Phase 7 ships the FK enforcement; Phase 14 drops `CmdbConfigurationItem.type` / `status` / `environment` / `ownerId` and `CmdbRelationship.relationshipType`.
- **Stack is locked:** Next.js 16 App Router (apps/web), Prisma 7.5 + PostgreSQL 17, Fastify 5 (apps/api), BullMQ workers (apps/worker), Tailwind 4 + shadcn/ui, MDI SVG icons (`@mdi/react` + `@mdi/js`), Zod 4, Vitest 4, TanStack Query v5.

### Claude's Discretion

- **Whether to add a "block CI create with null FKs" service-layer guard before the schema NOT NULL migration ships.** Recommended: yes — this is the safety harness that catches missed call-sites before they reach the DB constraint.
- **Whether to add a Zod schema layer to `apps/api/src/routes/v1/cmdb/index.ts` POST/PUT bodies.** The routes today use ad-hoc `typeof body[k] === 'string'` extractors (lines 65-131, 187-269) — not Zod. Recommended: yes, introduce Zod validators that *require* `classId` after the migration ships and *forbid* legacy enum fields. This is the API surface that turns the FK contract into a public guarantee.
- **Whether to add an `EnvKey`-style canonical key constants file** (e.g. `packages/core/src/cmdb/keys.ts` exporting `CI_CLASS_KEYS = { SERVER: 'server', ... }`) so workers and services stop hard-coding the string `'server'`. The reconciliation worker currently uses string literals (`apps/worker/src/workers/cmdb-reconciliation.ts:138-139` — `'in_service'`, `'prod'`). Recommended: yes — reduces the blast radius of a future renamed seed key.
- **Whether to update the portal AI context (`portal-schema-context.ts`) to add CMDB tables.** Today the portal context excludes ALL CMDB. Decision: probably no — CMDB is staff-only data. But `CAI-02` requires "every schema-touching phase updates portal-schema-context.ts" — for Phase 7 the update is "no change, CMDB intentionally excluded from portal" recorded as a comment, not a silent omission.
- **Whether to delete the half-finished `packages/db/scripts/cmdb-migration.ts`** after the per-tenant backfill is wrapped into a proper migration runner. Recommended: keep for one release as a fallback re-run tool, then move to `packages/db/scripts/_archived/`.

### Deferred Ideas (OUT OF SCOPE for Phase 7 per CSDM master plan)

- **Dropping legacy enum columns** — Phase 14 only.
- **Asset hardware/OS dedup** (`Asset.hostname`, `operatingSystem`, etc. drops) — Phase 8.
- **Asset↔CI identity dedup** (`CmdbConfigurationItem.serialNumber` / `assetTag` / `model` drops + `Asset.siteId` rename to `stockSiteId`) — Phase 9.
- **Application↔CI criticality enum normalization** (`CmdbConfigurationItem.criticality` is currently free-text string at `schema.prisma:2236`) — Phase 10.
- **Service tier introduction** (`business_service` / `application_service` / `technical_service` are already in the seeded `CmdbCiClass` rows but `CmdbService` extension fields + `ServiceApplication` + `ServiceSla` joins) — Phase 11.
- **Verb catalog class-pair enforcement** (`allowedSourceClassIds` / `allowedTargetClassIds` / `inverseKey` columns on `CmdbRelationshipTypeRef`) — Phase 12. Phase 7 only needs `relationshipTypeId` to be the FK; no class-pair validation yet.
- **`onDelete: SetNull` on `CmdbConfigurationItem.assetId`** + `ApplicationAsset.isPrimary` drop — Phase 13.
- **`CmdbConfigurationItem.ownerId` removal** — also Phase 14 destructive cleanup.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CREF-01** | `CmdbConfigurationItem.classId` is required (NOT NULL) on create; backfilled from legacy `type` enum via per-tenant mapping | Schema state verified at `schema.prisma:2204` (currently `String?`). Mapping verified at `cmdb-migration.ts:22-32` (`TYPE_TO_CLASS`). Service write needs change at `cmdb.service.ts:235-287` and `cmdb.service.ts:612-774` and `application.service.ts:181-196` and `cmdb-import.service.ts:178-213` and `cmdb-reconciliation.ts:181-226`. |
| **CREF-02** | `CmdbConfigurationItem.lifecycleStatusId` and `operationalStatusId` are required; backfilled from legacy `status` enum via per-tenant mapping | Schema verified at `schema.prisma:2205-2206`. Mapping at `cmdb-migration.ts:34-39` (`STATUS_TO_LIFECYCLE`) — note this only maps lifecycle; `operationalStatusId` mapping not present in the existing script and must be added. The legacy `CmdbCiStatus` enum has 4 values (`ACTIVE`/`INACTIVE`/`DECOMMISSIONED`/`PLANNED`) which all map to lifecycle; operationalStatus needs a default (e.g., `'unknown'`) on backfill since legacy data has no operational signal. |
| **CREF-03** | `CmdbConfigurationItem.environmentId` is required; backfilled from legacy `environment` enum | Schema verified at `schema.prisma:2207`. Mapping at `cmdb-migration.ts:41-46` (`ENV_TO_KEY`). |
| **CREF-04** | `CmdbRelationship.relationshipTypeId` is required; unique composite index rewritten to use the FK; backfill covers all existing relationships | Schema verified at `schema.prisma:2334` (FK currently nullable) and `schema.prisma:2353` (legacy enum in unique index — `@@unique([sourceId, targetId, relationshipType])`). Mapping at `cmdb-migration.ts:48-56` (`REL_TYPE_TO_KEY`). The unique index rewrite is destructive and needs a 2-step Prisma migration (create new index, then drop old — Prisma 7 generates this when you change `@@unique`). |
| **CREF-05** | `cmdb.service.ts`, `application.service.ts`, and `cmdb-import.service.ts` write FK ids only (no legacy enum writes); CMDB UI forms use reference-table fetches | Verified the UI forms (`new/page.tsx` and `[id]/edit/page.tsx`) ALREADY fetch reference data and send only FK ids — UI is done. Services still write both. Need to remove the `type:`, `status:`, `environment:`, `relationshipType:` lines from the four service writes listed for CREF-01. |
| **CAI-01** (cross-cutting) | Update `apps/api/src/services/ai-schema-context.ts` (staff AI) | Today's file at `ai-schema-context.ts:120` lists `cmdb_configuration_items` with both legacy enum tokens AND FK columns. Phase 7 needs to: (a) document that `classId` / `lifecycleStatusId` / `operationalStatusId` / `environmentId` are now NOT NULL, (b) add a JOIN hint comment showing how to resolve a CI to its class name (`SELECT ... FROM cmdb_configuration_items ci JOIN cmdb_ci_classes cls ON cls.id = ci."classId"`), (c) for `cmdb_relationships:122`, replace the enum token list with a JOIN hint to `cmdb_relationship_types`, (d) document the seeded canonical class keys so the AI knows what values to expect. |
| **CAI-02** (cross-cutting) | Update `apps/api/src/services/portal-schema-context.ts` (end-user AI) | Today (verified at `portal-schema-context.ts:18-25`) the portal context allowlist contains zero CMDB tables. Decision: keep CMDB excluded from portal AI. Phase 7's update is to add a comment at the top of the file explicitly noting "CMDB tables intentionally excluded — staff-only data" so the next reviewer doesn't think it was overlooked. |
| **CAI-03** (cross-cutting) | `apps/api/src/services/portal-ai-sql-executor.ts` row-level rules | Today (verified at `portal-ai-sql-executor.ts:18, 79-88`) the executor enforces `PORTAL_ALLOWED_TABLES` from `portal-schema-context.ts`. Since Phase 7 does not add CMDB to the portal allowlist, no row-level rules need to be added. **However**, the `PORTAL_ALLOWED_TABLES` array MUST be re-verified to ensure no CMDB table sneaks in via a future merge — add a Vitest test that asserts `PORTAL_ALLOWED_TABLES.every(t => !t.startsWith('cmdb_'))`. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reference-data seed on tenant create | API / Backend | DB (Prisma) | Tenant lifecycle is owned by `apps/api/src/routes/auth/signup.ts` (and `apps/owner/src/lib/provisioning.ts`); reference seeding must hook into both. The seed function itself lives in `packages/db/prisma/seed.ts:353` today and should be promoted to a reusable `packages/db/src/seeds/cmdb-reference.ts` exported function. |
| FK validation at write time | API / Backend (service layer) | DB (NOT NULL constraint) | Belt-and-suspenders: service throws a structured 400 if `classId` missing; DB rejects if service is bypassed. |
| Reference-data CRUD UI | Frontend Server (SSR) → API | — | `/dashboard/cmdb/settings/{classes,statuses,environments,relationship-types}/page.tsx` already exists; verified at `apps/web/src/app/dashboard/cmdb/settings/`. |
| CI create/edit form dropdowns | Browser / Client | API | Already implemented — UI fetches `/api/v1/cmdb/{classes,statuses,environments,vendors}` on mount via plain `fetch` with `credentials: 'include'`. Verified at `new/page.tsx:263-271` and `[id]/edit/page.tsx:322-325`. |
| Per-tenant backfill execution | DB script (one-shot) → API (scheduled re-runner for safety) | Worker (BullMQ) | The existing `packages/db/scripts/cmdb-migration.ts` is a one-shot; Phase 7 should also wire a BullMQ job that runs the same backfill on demand from the owner-admin app, so post-deploy operators have a re-runnable safety net. |
| AI schema context updates | API / Backend | — | Static TS files (`ai-schema-context.ts`, `portal-schema-context.ts`) — must be updated in the same PR per CAI-01/02. |
| Verification SQL (zero-null FK) | DB (raw SQL script) | API (admin endpoint) | Owner-admin needs a "Phase 7 readiness" report endpoint backed by a raw SQL count query. |

---

## Standard Stack

### Core (already in use; verified by direct read)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.5.0 | ORM, migration tool | Already in `packages/db/package.json:11-26`; v7 uses `@prisma/adapter-pg` driver adapter pattern. [VERIFIED: package.json read] |
| @prisma/client | 7.5.0 | DB client | `packages/db/package.json:21` [VERIFIED] |
| @prisma/adapter-pg | 7.5.0 | Postgres driver adapter for Prisma 7 | `packages/db/package.json:20` [VERIFIED] |
| pg | (transitive via adapter-pg) | Underlying Postgres client | Used by adapter [VERIFIED] |
| Zod | 4.3.6 | Request validation | `apps/api/package.json` shows `^4.3.6` [VERIFIED]. Phase 7 should introduce Zod schemas for the CMDB POST/PUT routes which currently use ad-hoc extractors. |
| Vitest | 4.1.0 | Unit/integration test runner | `apps/api/package.json` shows `^4.1.0` [VERIFIED]. Existing pattern at `apps/api/src/__tests__/cmdb-service.test.ts:7-77` mocks `@meridian/db` via `vi.hoisted` + `vi.mock`. |
| Playwright | (existing) | E2E tests | Existing CMDB-related Playwright at `apps/web/tests/apm-cmdb-bridge.spec.ts` [VERIFIED] |
| BullMQ | 5.x | Worker queue | Already in use for `cmdb-reconciliation` worker [VERIFIED via existing worker file] |

### Supporting (already established patterns)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg.Pool` | (via Prisma adapter) | Direct SQL for verification queries | Use raw `prisma.$queryRaw` for the zero-null-FK verification — same pattern as `cmdb.service.ts:227-231` (advisory lock + queryRaw). |
| MDI SVG (`@mdi/react` + `@mdi/js`) | already installed | Form icons | Used heavily in `new/page.tsx:1-22` — the class-picker step already maps `classKey → mdi icon` (`getClassIcon` at `new/page.tsx:66-93`). Reuse pattern. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-tenant in-process backfill loop (master plan default) | Single transaction `UPDATE cmdb_configuration_items SET classId = ... FROM cmdb_ci_classes WHERE ...` join | Single SQL is faster (one round-trip per tenant) but harder to log conflicts and re-run idempotently. Per-tenant loop with the existing mapping tables is ~30 lines and easier to reason about. **Recommend per-tenant loop** — matches the existing `cmdb-migration.ts` pattern. |
| Adding a service-layer `requireClassId` guard | Skip and rely solely on DB NOT NULL | Service-layer guard returns a 400 with an actionable message ("classId is required — call GET /api/v1/cmdb/classes to fetch the seeded class list"); DB NOT NULL returns a Prisma error that bubbles as a generic 500. **Both** — service-layer for UX, DB constraint for safety. |
| Backfill script run manually | Backfill as a Prisma migration `prisma/migrations/.../seed.sql` | A migration `seed.sql` runs on every `prisma migrate deploy` automatically — but cannot be re-run safely. Manual script + DB constraint enforced via separate migration is the safer two-step pattern that matches the master plan's two-deploy gate. |

**Installation:** No new packages. Phase 7 is pure schema + service logic + test additions.

**Version verification:**
```bash
# Confirm Prisma 7.5.0 is current stable (run before plan-phase)
npm view prisma version
npm view @prisma/client version
npm view @prisma/adapter-pg version
```

---

## Architecture Patterns

### System Architecture Diagram (data flow for a CI create after Phase 7)

```
┌─────────────┐                       ┌────────────────────────────────────┐
│ CMDB UI     │  GET /api/v1/cmdb/    │  apps/api/src/routes/v1/cmdb/      │
│ /dashboard/ │ ─classes ────────────▶│  reference.ts                      │
│ cmdb/new    │  GET ...statuses      │  - listCiClasses(tenantId)         │
│             │  GET ...environments  │  - listStatuses(tenantId, type)    │
│ (page.tsx)  │  GET ...rel-types     │  - listEnvironments(tenantId)      │
└──────┬──────┘                       │  - listRelationshipTypes(tenantId) │
       │                              │       (all tenant-scoped)          │
       │                              └──────────────┬─────────────────────┘
       │                                             │
       │ user picks class+status+env                 │ Prisma SELECT
       │                                             ▼
       │                                  ┌──────────────────────┐
       │                                  │ Postgres reference   │
       │                                  │  cmdb_ci_classes     │
       │                                  │  cmdb_statuses       │
       │                                  │  cmdb_environments   │
       │                                  │  cmdb_relationship_  │
       │                                  │  types               │
       │                                  └──────────────────────┘
       │
       │ POST /api/v1/cmdb/cis
       │ { classId, lifecycleStatusId, operationalStatusId, environmentId, ... }
       │ (NO legacy enum fields)
       │
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/cmdb/index.ts:62-132   POST /api/v1/cmdb/cis   │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Zod validation (NEW in Phase 7):                               │   │
│  │  - classId: z.string().uuid()                  ◀── REQUIRED    │   │
│  │  - lifecycleStatusId: z.string().uuid()        ◀── REQUIRED    │   │
│  │  - operationalStatusId: z.string().uuid()      ◀── REQUIRED    │   │
│  │  - environmentId: z.string().uuid()            ◀── REQUIRED    │   │
│  │  - type/status/environment: REJECT if present  ◀── BLOCK       │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ apps/api/src/services/cmdb.service.ts:223-287   createCI()             │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Service-layer assertion (NEW in Phase 7):                      │   │
│  │  if (!data.classId) throw new ValidationError(...)             │   │
│  │  Verify classId belongs to tenantId (defense-in-depth)         │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  prisma.$transaction(async (tx) => {                                   │
│    // 1. advisory lock + ciNumber                                       │
│    // 2. tx.cmdbConfigurationItem.create({ ...                          │
│    //      classId, lifecycleStatusId, operationalStatusId,             │
│    //      environmentId  ◀── ONLY FK ids, NO legacy enums              │
│    //    })                                                             │
│    // 3. tx.cmdbChangeRecord.create({ changeType: 'CREATED', ... })     │
│  })                                                                     │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Postgres CmdbConfigurationItem (after Phase 7 schema migration)        │
│  - classId               String  @db.Uuid  NOT NULL  ◀── PROMOTED      │
│  - lifecycleStatusId     String  @db.Uuid  NOT NULL  ◀── PROMOTED      │
│  - operationalStatusId   String  @db.Uuid  NOT NULL  ◀── PROMOTED      │
│  - environmentId         String  @db.Uuid  NOT NULL  ◀── PROMOTED      │
│  - type        CmdbCiType        STILL PRESENT  (Phase 14 drops it)    │
│  - status      CmdbCiStatus      STILL PRESENT  (Phase 14 drops it)    │
│  - environment CmdbCiEnvironment STILL PRESENT  (Phase 14 drops it)    │
└────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════
TENANT LIFECYCLE (Phase 7's biggest gap fix)
═══════════════════════════════════════════════════════════════════════════

apps/api/src/routes/auth/signup.ts:128 (tenant.create) ───┐
apps/owner/src/lib/provisioning.ts (manual provisioning) ─┼─▶ NEW: call
                                                          │   seedCmdbReferenceData(tenantId)
                                                          │   inside the same tx
                                                          │   (currently NEVER called)

═══════════════════════════════════════════════════════════════════════════
RECONCILIATION WORKER (1 of 3 places that still write legacy enums)
═══════════════════════════════════════════════════════════════════════════

apps/worker/src/workers/cmdb-reconciliation.ts
  Line 187-189: type/status/environment legacy writes  ◀── REMOVE
  Line 433: data: { status: 'INACTIVE' as never }      ◀── REPLACE with
                                                            { operationalStatusId:
                                                              await resolveOperational
                                                              StatusId(tenantId,'offline') }
```

### Recommended Project Structure (additions)

```
packages/db/
├── prisma/
│   ├── seed.ts                           ← already has seedCmdbReferenceData (line 353)
│   └── migrations/
│       └── XXXX_phase7_ci_ref_notnull/   ← NEW: promote 5 FKs to NOT NULL,
│           └── migration.sql                 rewrite cmdb_relationships unique index
└── src/
    └── seeds/
        └── cmdb-reference.ts             ← NEW: extract seedCmdbReferenceData out of
                                              prisma/seed.ts so signup.ts and provisioning.ts
                                              can import + call it on tenant create
└── scripts/
    └── phase7-backfill.ts                ← NEW: replace cmdb-migration.ts with a
                                              focused, idempotent, per-tenant FK backfill
                                              that ALSO sets operationalStatusId
                                              (existing script doesn't)
└── scripts/
    └── phase7-verify.ts                  ← NEW: the verification query that proves
                                              zero null FKs across all tenants

apps/api/src/
├── services/
│   ├── cmdb.service.ts                   ← MODIFY: remove legacy enum writes (lines
│   │                                          242-244, 651-653, 806, 837); add
│   │                                          classId / lifecycle / op / env required
│   │                                          assertions; remove the `as never` casts
│   ├── application.service.ts            ← MODIFY: lines 187-189 — remove legacy
│   │                                          enum writes from createPrimaryCiInternal
│   ├── cmdb-import.service.ts            ← MODIFY: lines 184-186 — remove; require
│   │                                          classKey resolution to non-null id
│   └── ai-schema-context.ts              ← MODIFY: line 120-122 — replace enum
│                                              tokens with FK + JOIN documentation
└── routes/v1/cmdb/
    ├── index.ts                          ← MODIFY: lines 81-83, 146-148, 212-214,
    │                                          308-316 — switch to Zod schema that
    │                                          requires classId etc.; reject legacy
    └── reference.ts                      ← UNCHANGED (already correct)

apps/worker/src/workers/
└── cmdb-reconciliation.ts                ← MODIFY: lines 187-189 (CI create) +
                                              line 433 (stale-CI status update) —
                                              replace legacy enum writes with FK
                                              resolution via the existing classIdCache
                                              pattern at lines 48-89

apps/web/src/app/dashboard/cmdb/
├── new/page.tsx                          ← UNCHANGED (already FK-only)
└── [id]/edit/page.tsx                    ← UNCHANGED (already FK-only)
```

### Pattern 1: Tenant-Scoped Reference Lookup with Cache

The reconciliation worker already implements the canonical pattern for "resolve a class key to a classId for a given tenant, with a cache to avoid round-trips":

```typescript
// Source: apps/worker/src/workers/cmdb-reconciliation.ts:48-58 [VERIFIED]
const classIdCache = new Map<string, string>();

async function resolveClassId(tenantId: string, classKey: string): Promise<string | null> {
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

This pattern should be **extracted into a shared helper** (`apps/api/src/services/cmdb-reference-resolver.service.ts` or `packages/core/src/cmdb/resolver.ts`) and reused by:
- `cmdb.service.ts createCI` (when the caller passes a `classKey` instead of `classId` — backwards-compat)
- `cmdb.service.ts createRelationship` (resolve a `relationshipKey` to a `relationshipTypeId`)
- `application.service.ts createPrimaryCiInternal` (already does it inline at line 156-168 — refactor to use the helper)
- `cmdb-import.service.ts` (already builds lookup maps — keep its bulk pattern, but use the same helper for fallback)

### Pattern 2: Idempotent Per-Tenant Seed Hook

```typescript
// Source: packages/db/prisma/seed.ts:353-485 [VERIFIED]
// Already idempotent — uses tx.cmdbCiClass.upsert({ where: tenantId_classKey, update: {}, create: {...} })
// Phase 7 plan: extract this function into packages/db/src/seeds/cmdb-reference.ts
// and call it from signup.ts inside the tenant-creation transaction:

async function seedCmdbReferenceData(
  tx: Prisma.TransactionClient,  // accept tx so signup can pass its own transaction
  tenantId: string,
): Promise<void> {
  // ... same upsert loop as packages/db/prisma/seed.ts:357-466
}

// Then in apps/api/src/routes/auth/signup.ts:126 inside the existing $transaction:
await seedCmdbReferenceData(tx, tenant.id);
```

### Pattern 3: FK NOT NULL Migration with Per-Tenant Pre-Flight

The Prisma migration that flips the FK columns to NOT NULL must NOT run blindly. The recommended pattern:

```sql
-- Source: synthesized from CSDM master plan "Cross-cutting: destructive-step gate pattern"
-- packages/db/prisma/migrations/XXXX_phase7_ci_ref_notnull/migration.sql

-- 1. Pre-flight verification (this query must return ZERO across all tenants
--    before the migration is allowed to apply — enforced by phase7-verify.ts)
DO $$
DECLARE
  null_class_count int;
  null_lifecycle_count int;
  null_op_count int;
  null_env_count int;
  null_rel_count int;
BEGIN
  SELECT COUNT(*) INTO null_class_count
    FROM cmdb_configuration_items WHERE "classId" IS NULL;
  SELECT COUNT(*) INTO null_lifecycle_count
    FROM cmdb_configuration_items WHERE "lifecycleStatusId" IS NULL;
  SELECT COUNT(*) INTO null_op_count
    FROM cmdb_configuration_items WHERE "operationalStatusId" IS NULL;
  SELECT COUNT(*) INTO null_env_count
    FROM cmdb_configuration_items WHERE "environmentId" IS NULL;
  SELECT COUNT(*) INTO null_rel_count
    FROM cmdb_relationships WHERE "relationshipTypeId" IS NULL;

  IF null_class_count > 0 OR null_lifecycle_count > 0 OR null_op_count > 0
     OR null_env_count > 0 OR null_rel_count > 0 THEN
    RAISE EXCEPTION 'Phase 7 backfill incomplete: classId=%, lifecycleStatusId=%, '
                    'operationalStatusId=%, environmentId=%, relationshipTypeId=% '
                    'rows still null. Run packages/db/scripts/phase7-backfill.ts '
                    'before applying this migration.',
                    null_class_count, null_lifecycle_count, null_op_count,
                    null_env_count, null_rel_count;
  END IF;
END $$;

-- 2. Promote the columns to NOT NULL (Prisma generates these from schema diff)
ALTER TABLE cmdb_configuration_items ALTER COLUMN "classId" SET NOT NULL;
ALTER TABLE cmdb_configuration_items ALTER COLUMN "lifecycleStatusId" SET NOT NULL;
ALTER TABLE cmdb_configuration_items ALTER COLUMN "operationalStatusId" SET NOT NULL;
ALTER TABLE cmdb_configuration_items ALTER COLUMN "environmentId" SET NOT NULL;
ALTER TABLE cmdb_relationships ALTER COLUMN "relationshipTypeId" SET NOT NULL;

-- 3. Rewrite the cmdb_relationships unique index to use FK
DROP INDEX IF EXISTS "cmdb_relationships_sourceId_targetId_relationshipType_key";
CREATE UNIQUE INDEX "cmdb_relationships_sourceId_targetId_relationshipTypeId_key"
  ON cmdb_relationships ("sourceId", "targetId", "relationshipTypeId");
```

The corresponding `schema.prisma` change for the relationship unique index:
```prisma
// schema.prisma — REPLACE the existing line 2353:
//   @@unique([sourceId, targetId, relationshipType])
// WITH:
@@unique([sourceId, targetId, relationshipTypeId])
```

### Anti-Patterns to Avoid

- **Dropping legacy enum columns in this phase.** That is Phase 14's destructive sweep, gated by a one-tenant one-week canary. If Phase 7 drops them, the rollback story collapses and the master plan's gate pattern is broken.
- **Making the schema migration the first line of defense.** A bare Prisma migration with `ALTER COLUMN ... SET NOT NULL` will fail loudly if any tenant's data is incomplete — but it tells you nothing about which tenant or how many rows. Wrap the migration in the per-tenant verification block above so the failure message is actionable.
- **Seeding reference data with `prisma.$transaction([upsert, upsert, upsert])`** — that's an array transaction, which serializes the upserts and surfaces the wrong error context. Use the existing pattern at `seed.ts:376` (sequential `await prisma.cmdbCiClass.upsert(...)` inside an interactive `prisma.$transaction(async (tx) => {...})`).
- **Adding `classKey` resolution INSIDE the service create function.** The CMDB UI already sends `classId` directly. Keep `createCI(classId)` as the canonical surface; expose a separate `createCIFromKeys(classKey, ...)` only if the CSV import or agent ingestion truly needs key-based input. (CSV import already builds its own lookup maps at `cmdb-import.service.ts:117-160`.)
- **Pretending the portal AI getting CMDB read access is a Phase 7 deliverable.** It is not — `portal-schema-context.ts:33-52` deliberately omits CMDB. Adding it is a security-scope expansion that needs its own discuss-phase.
- **Removing the `applicationActivity` `PRIMARY_CI_CREATED` audit row when refactoring `application.service.ts:213-222`.** That's the audit trail for the APM↔CMDB bridge; removing it silently breaks observability.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-tenant CI count + null-FK verification | Custom Node script with raw `pg` queries | `prisma.$queryRaw<{ tenantId: string; nullClassCount: bigint }[]>\`SELECT ...\`` inside `phase7-verify.ts` | Already-established pattern; reuses the project's Prisma adapter; surfaces tenantId per row for actionable errors. |
| Per-tenant backfill loop | Custom enum→FK lookup logic in each service | Extend `packages/db/scripts/cmdb-migration.ts` (already written, already idempotent) | The script already has `TYPE_TO_CLASS`, `STATUS_TO_LIFECYCLE`, `ENV_TO_KEY`, `REL_TYPE_TO_KEY` mapping tables and a per-tenant loop. Phase 7 only needs to: (a) add `STATUS_TO_OPERATIONAL` (legacy enum doesn't carry this signal — default to `'unknown'`), (b) wire it into the deploy pipeline. |
| Tenant lifecycle hook | Adding seedCmdbReferenceData calls in 3 places (signup, owner provisioning, manual seed) inline | Extract to `packages/db/src/seeds/cmdb-reference.ts` with a single `seedCmdbReferenceData(tx, tenantId)` exported function and import from all three call sites | DRY principle. CSDM master plan rule 6: "sync logic lives in exactly one place per direction." The seed function is a sync. |
| Reference-key constants in code | Hard-coding `'server'` / `'in_service'` / `'prod'` as bare strings across the worker, service, and migration script | A single `packages/core/src/cmdb/keys.ts` exporting `CI_CLASS_KEYS`, `LIFECYCLE_KEYS`, `OPERATIONAL_KEYS`, `ENV_KEYS`, `REL_TYPE_KEYS` with TS literal types | Today the strings are scattered — `cmdb-migration.ts:22-56`, `cmdb-reconciliation.ts:138-139`, `application.service.ts:166`. A typo in any of them creates a silent backfill miss. |
| API request validation | Ad-hoc `typeof body[k] === 'string'` extractors in route handlers | Zod schemas — already a project-standard library at `^4.3.6` and used by `cmdb-import.service.ts:6-51` | The current route at `apps/api/src/routes/v1/cmdb/index.ts:65-131` is 67 lines of `str()` / `num()` / `bool()` / `obj()` helpers — that's Zod with the type names rewritten. |

**Key insight:** Phase 7's risk is not implementing reference tables (they exist) but **leaving the door open** — every place that still writes legacy enums, every code path that bypasses the seed, every silent fallback to `'OTHER'`/`'ACTIVE'`/`'PRODUCTION'` (see `cmdb.service.ts:242-244`) is a route by which a CI ends up with a null FK in production. The plan must treat each of those as a named task with a verification step.

---

## Runtime State Inventory

> Phase 7 modifies columns on existing tables. This is functionally a "schema reshape" phase that touches live data — the inventory matters.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) Existing CIs in production with null `classId` / `lifecycleStatusId` / `operationalStatusId` / `environmentId` (count is per-tenant, unknown until verification query runs). (2) Existing relationships with null `relationshipTypeId`. (3) The legacy enum values on those rows are the source of the backfill mapping (`cmdb-migration.ts:22-56`). | Per-tenant data backfill via `phase7-backfill.ts` (extends `packages/db/scripts/cmdb-migration.ts`); the existing script handles classId/lifecycleStatusId/environmentId/relationshipTypeId but **does NOT handle operationalStatusId** — Phase 7 must add that mapping (default to `'unknown'` operational status since legacy `CmdbCiStatus` carries no operational signal). |
| **Live service config** | None. Reference tables live in the application database, not in any external service config. | None. |
| **OS-registered state** | None — Phase 7 changes no OS-level registrations. | None. |
| **Secrets/env vars** | None — no secret keys reference enum values. | None. |
| **Build artifacts / installed packages** | (1) `node_modules/.pnpm/@prisma+client@7.5.0_.../schema.prisma` — the Prisma client generated artifact. After the schema change, `pnpm prisma generate` must regenerate the client or TypeScript will not see the new NOT NULL types. (2) Any cached Prisma engine binaries — no action required. | After schema change: `pnpm --filter @meridian/db prisma generate`, then rebuild any TypeScript that imports from `@prisma/client` (apps/api, apps/worker). |

**Tenants without seeded reference data — CRITICAL:** Verified by direct read of `apps/api/src/routes/auth/signup.ts:126-216` and grep across `apps/owner/src/lib/provisioning.ts`. Neither tenant-creation path calls `seedCmdbReferenceData`. **Any tenant created via the public signup flow since v1.0 launch has empty `cmdb_ci_classes`, `cmdb_statuses`, `cmdb_environments`, `cmdb_relationship_types` tables.** Until those are backfilled, those tenants cannot create CIs after the FK NOT NULL migration ships. The Phase 7 plan MUST include a one-shot "seed missing reference data on every existing tenant" step that runs BEFORE the FK backfill (which depends on reference data existing).

---

## Common Pitfalls

### Pitfall 1: Tenant created without reference data → CI creation breaks at runtime
**What goes wrong:** A user signs up → tenant created → user tries to create their first CI → POST returns 500 because `classId` is required and there are no `cmdb_ci_classes` rows in their tenant.
**Why it happens:** `signup.ts` doesn't call `seedCmdbReferenceData`. (Verified — see Step 6 above.)
**How to avoid:** Wire `seedCmdbReferenceData(tx, tenantId)` into both `apps/api/src/routes/auth/signup.ts` (inside the existing transaction at line 126) AND `apps/owner/src/lib/provisioning.ts`. Add a Vitest test that creates a tenant via the signup endpoint and asserts `cmdb_ci_classes.findMany({ where: { tenantId } })` returns 15 rows.
**Warning signs:** Any 500 response from `POST /api/v1/cmdb/cis` containing the phrase "Foreign key constraint" or "null value in column classId".

### Pitfall 2: Operational status has no legacy mapping
**What goes wrong:** The backfill script (`cmdb-migration.ts:148-183`) maps legacy `CmdbCiStatus` to `lifecycleStatusId` only. After CREF-02 is enforced (operationalStatusId NOT NULL), the schema migration will fail because the script never populated `operationalStatusId` for any existing CI.
**Why it happens:** Legacy `CmdbCiStatus` enum (`schema.prisma:173-178`) has 4 values that are all *lifecycle* concerns (ACTIVE / INACTIVE / DECOMMISSIONED / PLANNED). There is no legacy field that carries operational state.
**How to avoid:** Extend `cmdb-migration.ts` with `STATUS_TO_OPERATIONAL: Record<string, string>` that maps every legacy status to `'unknown'` (the seeded operational status at `seed.ts:414`). Document this as an **assumption** — operators may want to bulk-set existing CIs to `'online'` if they're agent-managed and currently reporting heartbeats. Surface this in the backfill report so the operator can run a manual cleanup query post-migration.
**Warning signs:** `phase7-verify.ts` reports zero null FKs except for `operationalStatusId` is populated only with `'unknown'` for every legacy CI — flag for operator review.

### Pitfall 3: The `as never` casts mask Prisma type errors
**What goes wrong:** The current code uses `(data.type ?? 'OTHER') as never` (`cmdb.service.ts:242-244`) and `'ACTIVE' as never` (`cmdb-reconciliation.ts:188`) to bypass Prisma's strict enum type checking. After Phase 7 removes the legacy enum writes, the `as never` casts become unreachable and TypeScript will eventually flag them — but only if the lines are deleted, not if they're left "just in case." If a future code change re-adds a legacy enum write, the `as never` cast will silently let it compile.
**Why it happens:** Defense-in-depth disabled by an opt-out cast.
**How to avoid:** Phase 7 plan must include a grep gate: `grep -rn "as never" apps/api/src apps/worker/src` should return zero matches involving `type` / `status` / `environment` / `relationshipType` after the phase ships. Add a `.eslintrc` rule `@typescript-eslint/no-explicit-any` already exists in the project — add a custom rule to forbid `as never` in CMDB service/route files.
**Warning signs:** A new "as never" cast appears in a PR diff touching `cmdb.service.ts` or `cmdb-reconciliation.ts`.

### Pitfall 4: The unique index rewrite breaks Prisma migration ordering
**What goes wrong:** Prisma 7 generates `DROP INDEX` then `CREATE UNIQUE INDEX` for the `@@unique` change at `schema.prisma:2353`. If a relationship row exists where `relationshipTypeId IS NULL` at the moment the new unique index is created, the index creation will succeed (NULLs are not unique-constrained in Postgres) but Phase 12's class-pair enforcement will later see a pair of rows that look duplicated. More immediately: if a duplicate exists in the *legacy* `relationshipType` enum that the FK backfill collapses to the same `relationshipTypeId`, the index creation will fail.
**Why it happens:** The legacy enum mapping (`REL_TYPE_TO_KEY` at `cmdb-migration.ts:48-56`) maps both `HOSTS` and `VIRTUALIZES` to `'hosted_on'`. If a tenant has `(sourceId=A, targetId=B, relationshipType=HOSTS)` AND `(sourceId=A, targetId=B, relationshipType=VIRTUALIZES)`, the backfill produces two rows with `(A, B, hosted_on_id)` — and the new unique index rejects the second.
**How to avoid:** Add a pre-backfill duplicate detection step that runs the mapping in a dry-run mode and reports any `(sourceId, targetId, mappedRelationshipKey)` tuples that appear more than once per tenant. Operator decides which duplicate to keep BEFORE the backfill writes any rows.
**Warning signs:** `phase7-backfill.ts` reports "X duplicate relationship pairs detected; backfill aborted" — operator must resolve before re-run.

### Pitfall 5: Application criticality field renames inflated in Phase 7 scope
**What goes wrong:** The `CmdbConfigurationItem.criticality` field is currently `String?` at `schema.prisma:2236`. The CSDM master plan moves it to a `CriticalityLevel` enum in **Phase 10**, not Phase 7. If the planner conflates "make CI fields strongly-typed" with "Phase 7 is about reference tables," they may try to convert criticality to enum in Phase 7.
**Why it happens:** Misreading "reference tables" as "all typed reference data."
**How to avoid:** Phase 7 touches only the four FK fields named in the success criteria: `classId`, `lifecycleStatusId`, `operationalStatusId`, `environmentId`, `relationshipTypeId`. Criticality is not one of them. The plan must explicitly call out that `criticality` stays string in this phase.
**Warning signs:** A task description mentions "criticality" — that's a Phase 10 concern.

### Pitfall 6: Soft-delete still writes legacy `status: 'DECOMMISSIONED'`
**What goes wrong:** `cmdb.service.ts:802-808` `deleteCI()` does a soft-delete by setting `isDeleted=true` AND `status: 'DECOMMISSIONED' as never`. After Phase 7, the legacy status column is still there but writing to it is a code smell and will block Phase 14's drop.
**Why it happens:** Soft-delete was bolted on before the FK migration existed.
**How to avoid:** Phase 7 plan must change `deleteCI` to set `lifecycleStatusId` to the tenant's `'retired'` status row (resolve via `cmdb-reference-resolver`) instead of writing the legacy enum. The `isDeleted=true` flag stays as the canonical soft-delete signal.
**Warning signs:** `grep -n "status: 'DECOMMISSIONED'" apps/api/src` returns matches.

---

## Code Examples

### Example 1: The seed function as it exists today (verified)

```typescript
// Source: packages/db/prisma/seed.ts:353-485 [VERIFIED 2026-04-16]
async function seedCmdbReferenceData(tenantId: string) {
  // CI Classes (15 classes seeded with classKey, className, icon, description)
  const ciClasses = [
    { classKey: 'business_service', className: 'Business Service', icon: 'mdiBriefcase', ... },
    { classKey: 'technical_service', className: 'Technical Service', icon: 'mdiCog', ... },
    { classKey: 'application', className: 'Application', icon: 'mdiApplication', ... },
    { classKey: 'application_instance', className: 'Application Instance', ... },
    { classKey: 'saas_application', className: 'SaaS Application', ... },
    { classKey: 'server', className: 'Server', icon: 'mdiServer', ... },
    { classKey: 'virtual_machine', className: 'Virtual Machine', ... },
    { classKey: 'database', className: 'Database', ... },
    { classKey: 'network_device', className: 'Network Device', ... },
    { classKey: 'load_balancer', className: 'Load Balancer', ... },
    { classKey: 'storage', className: 'Storage', ... },
    { classKey: 'cloud_resource', className: 'Cloud Resource', ... },
    { classKey: 'dns_endpoint', className: 'DNS Endpoint', ... },
    { classKey: 'certificate', className: 'Certificate', ... },
    { classKey: 'generic', className: 'Generic', ... },
  ];
  for (const cls of ciClasses) {
    await prisma.cmdbCiClass.upsert({
      where: { tenantId_classKey: { tenantId, classKey: cls.classKey } },
      update: {},
      create: { ...cls, tenantId },
    });
  }
  // ... statuses (6 lifecycle + 5 operational), environments (6), relationshipTypes (13) follow same pattern
}
```

### Example 2: The current legacy-enum write pattern that must be removed (verified)

```typescript
// Source: apps/api/src/services/cmdb.service.ts:235-249 [VERIFIED]
const ci = await tx.cmdbConfigurationItem.create({
  data: {
    tenantId,
    ciNumber,
    name: data.name,
    displayName: data.displayName,
    // Legacy enum fields                          ◀── Phase 7 REMOVES these 3 lines
    type: (data.type ?? 'OTHER') as never,        ◀── REMOVE
    status: (data.status ?? 'ACTIVE') as never,   ◀── REMOVE
    environment: (data.environment ?? 'PRODUCTION') as never,  ◀── REMOVE
    // New reference table FKs                    ◀── Phase 7 KEEPS these
    classId: data.classId,
    lifecycleStatusId: data.lifecycleStatusId,
    operationalStatusId: data.operationalStatusId,
    environmentId: data.environmentId,
    // ... rest of CI fields
  },
});
```

After Phase 7, the `data.type` / `data.status` / `data.environment` fields are removed from `CreateCIData` interface (`cmdb.service.ts:5-18`), the API route at `apps/api/src/routes/v1/cmdb/index.ts:81-83` stops accepting them, and Zod validation rejects requests that include them.

### Example 3: The reconciliation worker's FK resolution pattern (verified, reuse)

```typescript
// Source: apps/worker/src/workers/cmdb-reconciliation.ts:48-89 [VERIFIED]
const classIdCache = new Map<string, string>();

async function resolveClassId(tenantId: string, classKey: string): Promise<string | null> {
  const cacheKey = `${tenantId}:${classKey}`;
  if (classIdCache.has(cacheKey)) return classIdCache.get(cacheKey)!;
  const cls = await prisma.cmdbCiClass.findFirst({
    where: { tenantId, classKey },
    select: { id: true },
  });
  if (cls) classIdCache.set(cacheKey, cls.id);
  return cls?.id ?? null;
}

async function resolveLifecycleStatusId(tenantId: string, statusKey: string): Promise<string | null> {
  const status = await prisma.cmdbStatus.findFirst({
    where: { tenantId, statusType: 'lifecycle', statusKey },
    select: { id: true },
  });
  return status?.id ?? null;
}
// (analogous resolveEnvironmentId, plus a needed-but-not-present resolveOperationalStatusId)
```

Phase 7 should extract these resolvers to a shared `cmdb-reference-resolver.service.ts` and add `resolveOperationalStatusId` + `resolveRelationshipTypeId`.

### Example 4: Vitest mock pattern for the Prisma transaction (verified, reuse)

```typescript
// Source: apps/api/src/__tests__/cmdb-service.test.ts:7-120 [VERIFIED]
const { mockPrismaObj, mockTx } = vi.hoisted(() => ({
  mockPrismaObj: {} as Record<string, unknown>,
  mockTx: {} as Record<string, unknown>,
}));

const txCICreate = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();
// ... etc

Object.assign(mockTx, {
  cmdbConfigurationItem: { create: txCICreate, ... },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

beforeEach(() => {
  vi.clearAllMocks();
  prismaTransaction.mockImplementation(
    (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
  );
});
```

Phase 7 tests follow this exact pattern — the existing `cmdb-service.test.ts` already covers `createCI`; the plan extends it with new tests asserting that:
1. `createCI` throws when `classId` is missing
2. `createCI` does NOT include `type` / `status` / `environment` keys in the `txCICreate` call (negative assertion)
3. `seedCmdbReferenceData` is called inside the signup transaction

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `CmdbConfigurationItem` typed by Prisma enums (`CmdbCiType` / `CmdbCiStatus` / `CmdbCiEnvironment` / `CmdbRelationshipType`) | Reference table FK + tenant-scoped seeded vocabulary | Mid-2025 (in-flight per master plan; 75% shipped) | Tenant administrators can add custom classes (e.g., "kubernetes_cluster") without a schema migration. |
| Hard-coded enum dropdowns in CMDB UI | Reference-table fetches at form mount (`new/page.tsx:263-271`) | Pre-Phase 7 (already shipped) | UI already reflects whatever the tenant has seeded. No UI work needed in Phase 7 for the create/edit forms. |
| Soft-delete via `isDeleted` flag + legacy `status='DECOMMISSIONED'` (`cmdb.service.ts:802-808`) | Soft-delete via `isDeleted` + `lifecycleStatusId='retired'` FK | Phase 7 (this phase) | Removes the last legitimate write to the legacy `status` column from the production code path. |
| Soft-delete-by-stale via legacy `status='INACTIVE'` (`cmdb-reconciliation.ts:431-433`) | Stale-mark via `operationalStatusId='offline'` (or `'unknown'`) | Phase 7 (this phase) | Operationally clearer: lifecycle="in_service" + operational="offline" tells the truth about an agent that has stopped reporting (the CI is still live in the lifecycle sense). |

**Deprecated/outdated:**
- The four legacy enums `CmdbCiType` / `CmdbCiStatus` / `CmdbCiEnvironment` / `CmdbRelationshipType` (`schema.prisma:173-207`) — kept for read-only fallback through Phase 7, dropped in Phase 14.
- The `cmdb-migration.ts` script (`packages/db/scripts/cmdb-migration.ts`) — Phase 7 should rewrite as `phase7-backfill.ts` with the missing operationalStatusId mapping and the duplicate-detection pre-flight; archive the old script.
- The `as never` cast pattern (`cmdb.service.ts:242-244`, `cmdb-reconciliation.ts:188`, etc.) — eliminated in Phase 7.

---

## Project Constraints (from CLAUDE.md)

These are the directives extracted from `./CLAUDE.md` that Phase 7 plans MUST honor. Treat these with the same authority as locked decisions.

| Directive | Section | Phase 7 Implication |
|-----------|---------|---------------------|
| **Multi-tenancy is THE #1 rule.** Every query filters by `tenantId`. | Critical Design Rule 1 | Every reference-data lookup, every backfill loop, every verification query is scoped to `tenantId`. The reference tables themselves carry `tenantId` columns (verified — `schema.prisma:2055, 2078, 2099, 2118`). |
| **Owner Admin is fully isolated.** No code in `apps/web` may authenticate to `apps/owner`. | Rule 2 | The "re-run backfill on demand" admin endpoint Phase 7 may add must live in `apps/owner/src/app/api/...`, NOT in `apps/web/src/app/api/...`. |
| **Plan enforcement via planGate middleware.** | Rule 3 | Out of scope — CI create already passes through planGate; Phase 7 doesn't touch limits. |
| **API route pattern: `/api/v1/`, `auth()` session, `tenantId` scoped.** | Rule 4 | The new Zod-validated CMDB routes follow this pattern (already do — verified at `apps/api/src/routes/v1/cmdb/index.ts:62-132`). |
| **Icon usage: `@mdi/react` + `@mdi/js` (NOT webfont).** | Rule 5 | The CMDB UI already uses MDI SVG correctly (`new/page.tsx:6-22`). Phase 7 doesn't add UI but if the plan adds an admin "backfill status" page, it follows this rule. |
| **AI Assistant Data Availability — MANDATORY for Schema Changes.** | Rule 6 | **CRITICAL for Phase 7.** Every PR that changes the FK columns MUST update `apps/api/src/services/ai-schema-context.ts:120-122` in the same PR. The portal context (`portal-schema-context.ts`) keeps CMDB excluded but the file should be touched with a comment confirming the intentional exclusion. |
| **CSDM Field Ownership — MANDATORY for Asset / CMDB / Application / Service Changes.** | Rule 7 | **CRITICAL for Phase 7.** This phase IS the implementation of the CmdbConfigurationItem reference-table side of the contract. The contract is at `docs/architecture/csdm-field-ownership.md` (already shipped in Phase 0). Master plan is at `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md`. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Schema migration, backfill, verification | ✓ | 17 (per locked stack) | — |
| Prisma CLI | Migration generation + apply | ✓ | 7.5.0 | — |
| `pnpm` | Workspace builds | ✓ | 9.x | — |
| Vitest | Unit tests | ✓ | 4.1.0 | — |
| Playwright | E2E tests | ✓ (existing CMDB tests at `apps/web/tests/apm-cmdb-bridge.spec.ts`) | (existing) | — |
| `tsx` | Run backfill script | ✓ (used by `db:seed` script) | (existing) | — |

**Missing dependencies with no fallback:** None. All tooling is in place.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

> Required because `workflow.nyquist_validation: true` in `.planning/config.json` (verified).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 (apps/api unit), Playwright (apps/web E2E) |
| Config file | `apps/api/vitest.config.ts` (existing — used by `cmdb-service.test.ts`), `apps/web/playwright.config.ts` (existing) |
| Quick run command | `pnpm --filter @meridian/api vitest run src/__tests__/cmdb-service.test.ts src/__tests__/cmdb-import.test.ts src/__tests__/cmdb-reconciliation.test.ts` |
| Full suite command | `pnpm --filter @meridian/api vitest run && pnpm --filter web playwright test --grep cmdb` |
| Phase 7 backfill command | `pnpm tsx packages/db/scripts/phase7-backfill.ts` (new — replaces existing `cmdb-migration.ts`) |
| Phase 7 verification command | `pnpm tsx packages/db/scripts/phase7-verify.ts` (new — exits non-zero if any tenant has null FKs) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **CREF-01** | `cmdbConfigurationItem.classId` is NOT NULL after migration | DB integration | `pnpm tsx packages/db/scripts/phase7-verify.ts` (asserts zero null FKs for classId) | ❌ Wave 0 — script does not exist |
| CREF-01 | Service `createCI` throws when classId missing | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "createCI rejects missing classId"` | ❌ Wave 0 — test does not exist |
| CREF-01 | API route returns 400 when `classId` missing in request body | Unit (Vitest, route mock) | `pnpm --filter @meridian/api vitest run -t "POST /api/v1/cmdb/cis 400 missing classId"` | ❌ Wave 0 |
| CREF-01 | Service does NOT write `type:` key when calling `tx.cmdbConfigurationItem.create` | Unit (Vitest, negative assertion on mock call args) | `pnpm --filter @meridian/api vitest run -t "createCI does not write legacy type field"` | ❌ Wave 0 |
| **CREF-02** | `lifecycleStatusId` and `operationalStatusId` are NOT NULL after migration | DB integration | `phase7-verify.ts` checks both | ❌ Wave 0 |
| CREF-02 | Backfill maps legacy `CmdbCiStatus.ACTIVE` → `lifecycleStatusId` of `'in_service'` row | Unit (Vitest on backfill script) | `pnpm --filter @meridian/db vitest run -t "STATUS_TO_LIFECYCLE maps ACTIVE to in_service"` | ❌ Wave 0 — backfill script is in `packages/db/scripts/` which currently has no test config; needs vitest config addition |
| CREF-02 | Backfill defaults `operationalStatusId` to `'unknown'` row when no legacy signal | Unit (Vitest) | `pnpm --filter @meridian/db vitest run -t "operationalStatusId defaults to unknown"` | ❌ Wave 0 |
| **CREF-03** | `environmentId` NOT NULL after migration | DB integration | `phase7-verify.ts` | ❌ Wave 0 |
| **CREF-04** | `cmdbRelationship.relationshipTypeId` NOT NULL after migration | DB integration | `phase7-verify.ts` | ❌ Wave 0 |
| CREF-04 | Unique composite index uses `relationshipTypeId` (not legacy enum) | DB introspection | `psql -c "\d cmdb_relationships"` then assert via grep that the unique index name matches `*_relationshipTypeId_key` | ❌ Wave 0 — needs scripted assertion in `phase7-verify.ts` |
| CREF-04 | Inserting a duplicate `(sourceId, targetId, relationshipTypeId)` is rejected at the DB | Integration (real Postgres) | `pnpm --filter @meridian/api vitest run -t "duplicate relationship rejected by unique index"` | ❌ Wave 0 — requires a vitest setup that talks to a real DB; currently no such test pattern. **Recommend** adding a `vitest.integration.config.ts` that uses `testcontainers/postgresql` or a local Postgres. |
| **CREF-05** | No legacy enum writes remain in `cmdb.service.ts`, `application.service.ts`, `cmdb-import.service.ts`, `cmdb-reconciliation.ts` | Static analysis (grep) | `! grep -rn "type:.*['\"][A-Z_]\\+['\"]\\|status:.*['\"][A-Z_]\\+['\"].*\\(as never\\|cmdbConfigurationItem\\)" apps/api/src/services/cmdb.service.ts apps/api/src/services/application.service.ts apps/api/src/services/cmdb-import.service.ts apps/worker/src/workers/cmdb-reconciliation.ts` | ❌ Wave 0 — needs to be wired into CI as a script, e.g. `packages/db/scripts/phase7-grep-gate.sh` |
| CREF-05 | UI forms render dropdowns from reference fetches (no hard-coded enum lists) | E2E (Playwright) | `pnpm --filter web playwright test tests/cmdb-ref-table-dropdowns.spec.ts` | ❌ Wave 0 — test does not exist; existing `apm-cmdb-bridge.spec.ts` tests the bridge but not the dropdown source |
| **CAI-01** | `ai-schema-context.ts` reflects FK + JOIN documentation for `cmdb_configuration_items` | Static (file content) | `grep -q "JOIN cmdb_ci_classes" apps/api/src/services/ai-schema-context.ts` | ❌ Wave 0 — also need a positive Vitest test that exports a constant from the file and asserts on its content |
| **CAI-02** | `portal-schema-context.ts` updated with intentional-exclusion comment OR no CMDB tables added | Static (file content) | Vitest assertion: `expect(PORTAL_ALLOWED_TABLES.every(t => !t.startsWith('cmdb_'))).toBe(true)` | ❌ Wave 0 — quick test, lives in `apps/api/src/__tests__/portal-context.test.ts` |
| **CAI-03** | Portal AI SQL executor rejects queries against any `cmdb_*` table | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "executePortalQuery rejects cmdb_configuration_items"` | ❌ Wave 0 |
| **Multi-tenancy** | Reference-table list endpoint of tenant A returns 0 rows that belong to tenant B | E2E (Playwright with two test tenants) | `pnpm --filter web playwright test tests/cmdb-ref-tenant-isolation.spec.ts` | ❌ Wave 0 — existing test helpers at `apps/web/tests/helpers.ts` support `loginAsAdmin` but not "switch to second tenant"; needs a helper extension |
| **Tenant lifecycle** | New tenant created via `/api/v1/auth/signup` has 15 cmdb_ci_classes seeded | Integration (Vitest) | `pnpm --filter @meridian/api vitest run -t "signup seeds cmdb reference data"` | ❌ Wave 0 |
| **Tenant lifecycle** | New tenant created via owner provisioning has 15 cmdb_ci_classes seeded | Integration (Vitest) | `pnpm --filter owner vitest run -t "provisioning seeds cmdb reference data"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @meridian/api vitest run src/__tests__/cmdb-service.test.ts` (the focused unit test for the just-modified service file)
- **Per wave merge:** `pnpm --filter @meridian/api vitest run && pnpm tsx packages/db/scripts/phase7-verify.ts && bash packages/db/scripts/phase7-grep-gate.sh`
- **Phase gate (before `/gsd-verify-work`):** Full vitest suite green + `phase7-verify.ts` returns "all tenants compliant" + `phase7-grep-gate.sh` exits 0 + Playwright `--grep cmdb` green + manual smoke: create a CI in the dev tenant via the UI, observe FK ids in DB, observe AI chat correctly answers "how many servers do we have?" using the JOIN.

### Wave 0 Gaps

The following test/script files MUST exist before implementation tasks are scheduled. The plan should put these in **Wave 0** so the entire phase has a verification harness from day one:

- [ ] `packages/db/scripts/phase7-verify.ts` — verification script (zero null FKs query, per-tenant breakdown, exits non-zero on failure)
- [ ] `packages/db/scripts/phase7-backfill.ts` — extends `cmdb-migration.ts` with `STATUS_TO_OPERATIONAL` mapping + duplicate-relationship pre-flight detection
- [ ] `packages/db/scripts/phase7-grep-gate.sh` — bash script that greps for legacy enum writes in the four service/worker files; exits non-zero if any found
- [ ] `packages/db/src/seeds/cmdb-reference.ts` — extracted reusable seeder; takes `tx` parameter so signup can call it inside its transaction
- [ ] `apps/api/src/__tests__/cmdb-service.test.ts` — extend existing file with: (a) "createCI rejects missing classId", (b) "createCI does not write legacy type/status/environment", (c) "deleteCI uses lifecycleStatusId='retired' instead of legacy status='DECOMMISSIONED'"
- [ ] `apps/api/src/__tests__/cmdb-import.test.ts` — extend with: "import requires classKey to resolve to non-null classId"
- [ ] `apps/api/src/__tests__/cmdb-reconciliation.test.ts` — extend with: (a) reconciliation worker resolves classId via `resolveClassId`, (b) stale-CI marker writes `operationalStatusId='offline'` not legacy `status='INACTIVE'`
- [ ] `apps/api/src/__tests__/signup-cmdb-seed.test.ts` — NEW: signup endpoint integration test asserts reference data populated for new tenant
- [ ] `apps/api/src/__tests__/portal-context.test.ts` — NEW: asserts `PORTAL_ALLOWED_TABLES` excludes all `cmdb_*` tables
- [ ] `apps/api/src/__tests__/ai-schema-context.test.ts` — NEW: asserts SCHEMA_CONTEXT contains `JOIN cmdb_ci_classes` documentation and does not contain the legacy enum token list for `cmdb_configuration_items`
- [ ] `apps/web/tests/cmdb-ref-table-dropdowns.spec.ts` — NEW: Playwright test verifying CMDB new-CI form populates class/status/environment dropdowns from API fetches
- [ ] `apps/web/tests/cmdb-ref-tenant-isolation.spec.ts` — NEW: requires a second test tenant; `apps/web/tests/helpers.ts` may need a `loginAsTenantBAdmin()` helper

### Naming convention for verification artifacts

- Backfill scripts: `packages/db/scripts/phase{N}-{purpose}.ts` (e.g., `phase7-backfill.ts`, `phase7-verify.ts`)
- Grep gates: `packages/db/scripts/phase{N}-grep-gate.sh`
- Test files for the phase: prefix new files with the requirement ID where helpful (e.g., `cref-04-relationship-unique-index.test.ts` is OK; the existing pattern of `{module-name}.test.ts` is also acceptable)
- Migration name: `prisma/migrations/{timestamp}_phase7_ci_ref_notnull/migration.sql` — must include the timestamp Prisma generates plus the `phase7_*` suffix so it's grep-able

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Legacy `CmdbCiStatus` carries no operational signal (only lifecycle), so `operationalStatusId` backfill defaults to `'unknown'` | Pitfall 2 + Validation Architecture CREF-02 mapping | If the user has been *using* legacy statuses to mean operational state ("INACTIVE = down"), defaulting all to `'unknown'` loses that signal. Mitigation: surface in backfill report; let operator bulk-update post-migration. **[ASSUMED]** |
| A2 | The portal AI should remain CMDB-free in Phase 7 | CAI-02 | If the user wants end-users to see "what services am I entitled to?" answered by the portal AI, that's a Phase 11 (Service tier) deliverable, not Phase 7. But if they want CMDB read access in the portal *now*, this assumption blocks it. Recommend confirming in `/gsd-discuss-phase 7`. **[ASSUMED]** |
| A3 | The Owner Admin app's tenant provisioning code path (`apps/owner/src/lib/provisioning.ts`) creates tenants in a way that needs the same `seedCmdbReferenceData(tx, tenantId)` hook as `signup.ts` | Runtime State Inventory + Pitfall 1 | If owner-admin uses a different mechanism (e.g., calls the same signup endpoint internally), the hook only needs to land in one place. Verify in `/gsd-plan-phase 7`. **[ASSUMED based on file existing but not read in detail this session]** |
| A4 | The `cmdb-migration.ts` script, run before the Phase 7 NOT NULL migration, will successfully backfill all existing production data without unresolvable conflicts (e.g., relationship duplicates collapsing). | Pitfall 4 | If duplicates exist, the backfill will fail and operator intervention is needed before the NOT NULL migration can apply. The plan must include the dry-run / pre-flight step. **[ASSUMED — needs dry-run on dev DB before plan-phase commits to a release window]** |
| A5 | No code outside `apps/api/src/services/cmdb.service.ts`, `application.service.ts`, `cmdb-import.service.ts`, and `apps/worker/src/workers/cmdb-reconciliation.ts` writes to `cmdb_configuration_items` or `cmdb_relationships`. | CREF-05 grep gate scope | The grep coverage above is limited to these four files. If a future contributor adds a write elsewhere, the grep gate misses it. Mitigation: broaden the grep gate to `apps/api/src apps/worker/src` while excluding test files. **Verified by `Grep prisma\.cmdbConfigurationItem\.(create\|update\|upsert)` returning only the listed files plus `apps/api/src/routes/v1/assets/index.ts:270, 297` — those two writes are in the asset-CI link path and need to be reviewed individually as part of the plan.** **[VERIFIED, but `assets/index.ts:270, 297` is an additional location the planner must include in the audit]** |
| A6 | Prisma 7's auto-generated migration for `@@unique([sourceId, targetId, relationshipType])` → `@@unique([sourceId, targetId, relationshipTypeId])` will produce a clean DROP+CREATE pair that can be wrapped in the pre-flight `DO $$ ... $$` block manually. | Pattern 3 SQL example | If Prisma 7 generates something different (e.g., uses `CREATE INDEX CONCURRENTLY` which can't be in a transaction), the wrapped block fails. Verify by running `pnpm prisma migrate dev --create-only --name phase7_ci_ref_notnull` and inspecting the generated SQL before committing. **[ASSUMED]** |
| A7 | The 15 seeded CI classes (`seed.ts:357-373`) are sufficient for v2.0 production needs. | Reference seed list (locked decision section) | If the user wants to add `kubernetes_cluster` or `kafka_topic` etc. before Phase 7 ships, that's a tenant-level addition (already supported via `POST /api/v1/cmdb/classes`) — does not need a code change. But if "the seeded list" needs editing, the plan must include the seed.ts diff. **[ASSUMED — current seeded list looks complete for the 9 phases of v2.0]** |

---

## Open Questions (RESOLVED)

1. **Should Phase 7 add `STATUS_TO_OPERATIONAL` defaulting to `'online'` for any CI with `agentId` set (because an agent reporting heartbeats is operationally online), and only default `'unknown'` for CIs with no agent?**
   - What we know: legacy `CmdbCiStatus` has no operational signal; reconciliation worker today implies operational state via the `lastSeenAt` timestamp.
   - What's unclear: whether the user wants the backfill to make a guess based on `lastSeenAt < 24h ago` → `'online'`, or to be conservative and stamp all legacy CIs `'unknown'` for human review.
   - Recommendation: be conservative — stamp `'unknown'` and let the next reconciliation worker run set them to `'online'` based on actual heartbeats. Less surprise, more accurate.
   - **RESOLVED: A1 — operationalStatusId defaults to `'unknown'` for all CIs; reconciliation worker sets `'online'` on next heartbeat. Encoded in `phase7-backfill.ts` STATUS_TO_OPERATIONAL mapping.**

2. **Does the user want the Phase 7 "re-runnable backfill" to be invokable from the owner-admin UI?**
   - What we know: the master plan calls for "manual re-runnability" but doesn't say where the trigger lives.
   - What's unclear: whether to build an admin-only button for it.
   - Recommendation: plan the script with no UI. Add a `pnpm` task. If a UI button is wanted, add it as a Phase 7 nice-to-have task that can be cut if scope tightens.
   - **RESOLVED: pnpm script only for v2.0; owner-admin UI trigger deferred (no Phase 7 deliverable). Operators run `pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts` and `pnpm tsx packages/db/scripts/phase7-backfill.ts` from the shell.**

3. **Should `Application.type` (`schema.prisma:1745`, `ApplicationType` enum) also migrate to a reference table in Phase 7?**
   - What we know: it's still an enum on `Application`, not on `CmdbConfigurationItem`. The CSDM master plan does not call it out for Phase 7 specifically (focus is on CI and CmdbRelationship).
   - What's unclear: whether the user considers Application-level enums in scope.
   - Recommendation: NO — keep Phase 7 strictly to the CI + Relationship FK promotion. Application enum normalization is a separate APM cleanup that should get its own discuss-phase.
   - **RESOLVED: out of scope for Phase 7; `Application.type` enum normalization is deferred to a future APM cleanup phase. Phase 7 touches only `CmdbConfigurationItem` and `CmdbRelationship`.**

4. **What happens to `assets/index.ts:270, 297` writes to `cmdbConfigurationItem.update`?**
   - What we know: these writes exist (verified by grep) and are part of the asset-CI link path.
   - What's unclear: whether they touch the legacy enum columns or only the `assetId` linking field.
   - Recommendation: plan-phase reads those lines and adds them to the audit list. If they only update `assetId`, no change needed; if they touch `type`/`status`/`environment`, they're part of CREF-05.
   - **RESOLVED: A5 — `assets/index.ts:270,297` are `assetId`-only writes (no enum touched). No source modification required for Phase 7. The `phase7-grep-gate.sh` audits this file so any future PR adding an enum write is caught.**

5. **Does the user want a "Phase 7 readiness dashboard" in the owner-admin app?**
   - What we know: the existing `cmdb-governance.service.ts` already surfaces governance data per tenant.
   - What's unclear: whether a per-tenant null-FK count + last-seed-run timestamp dashboard is wanted.
   - Recommendation: defer to Phase 13 (Integrity & Orphan Cleanup) which already plans a governance dashboard. Phase 7 keeps the verification as a script.
   - **RESOLVED: deferred to a later v2.0 phase (no Phase 7 deliverable). Phase 7 keeps verification as `pnpm tsx packages/db/scripts/phase7-verify.ts`; Phase 13 (Integrity & Orphan Cleanup) will own the dashboard.**

---

## Sources

### Primary (HIGH confidence — direct file reads in this session)
- `packages/db/prisma/schema.prisma` — read lines 1-300, 1695-1785, 2050-2430 [VERIFIED]
- `packages/db/prisma/seed.ts` — read lines 310-485 (full seedCmdbReferenceData function) [VERIFIED]
- `packages/db/scripts/cmdb-migration.ts` — read in full (307 lines) [VERIFIED]
- `apps/api/src/services/cmdb.service.ts` — read lines 1-90, 90-300, 600-880 [VERIFIED]
- `apps/api/src/services/cmdb-reference.service.ts` — read in full (333 lines) [VERIFIED]
- `apps/api/src/services/cmdb-import.service.ts` — read in full (232 lines) [VERIFIED]
- `apps/api/src/services/application.service.ts` — read lines 160-220 (createPrimaryCiInternal) [VERIFIED]
- `apps/api/src/services/ai-schema-context.ts` — read in full (176 lines) [VERIFIED]
- `apps/api/src/services/portal-schema-context.ts` — read in full (59 lines) [VERIFIED]
- `apps/api/src/services/portal-ai-sql-executor.ts` — read in full (210 lines) [VERIFIED]
- `apps/api/src/routes/v1/cmdb/index.ts` — read lines 65-340 [VERIFIED]
- `apps/api/src/routes/v1/cmdb/reference.ts` — read in full (210 lines) [VERIFIED]
- `apps/api/src/__tests__/cmdb-service.test.ts` — read lines 1-170 (mock pattern) [VERIFIED]
- `apps/api/src/routes/auth/signup.ts` — read lines 120-216 (tenant create transaction) [VERIFIED — confirmed seedCmdbReferenceData NOT called]
- `apps/worker/src/workers/cmdb-reconciliation.ts` — read lines 48-90 (resolver helpers), 170-240 (CI create), 395-445 (stale marker) [VERIFIED]
- `apps/web/src/app/dashboard/cmdb/new/page.tsx` — read lines 1-310 (form data flow + reference fetches) [VERIFIED — UI is already FK-only]
- `apps/web/src/app/dashboard/cmdb/[id]/edit/page.tsx` — verified via grep that classId/lifecycleStatusId/environmentId already in use [VERIFIED]
- `apps/web/src/app/dashboard/cmdb/[id]/page.tsx` — verified via grep that relationship UI uses `relationshipTypeRef` (FK) for display, with fallback to legacy `relationshipType` for unmigrated rows [VERIFIED]
- `apps/web/tests/apm-cmdb-bridge.spec.ts` — read first 40 lines (existing E2E pattern) [VERIFIED]
- `docs/architecture/csdm-field-ownership.md` — read in full (Phase 0 contract) [VERIFIED]
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — read in full [VERIFIED]
- `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md` — read in full (CSDM master plan) [VERIFIED]
- `CLAUDE.md` — provided in conversation context [VERIFIED]

### Secondary (MEDIUM confidence)
- `apps/api/package.json` (zod 4.3.6, vitest 4.1.0) — confirmed via grep [VERIFIED]
- `packages/db/package.json` (Prisma 7.5.0, @prisma/client 7.5.0, @prisma/adapter-pg 7.5.0) — confirmed via grep [VERIFIED]
- `apps/owner/src/lib/provisioning.ts` exists but was NOT read in detail — confirmed via grep that it does NOT call `seedCmdbReferenceData` [VERIFIED for the negative claim; the positive details of what it DOES do are not researched in this session]

### Tertiary (LOW confidence — areas explicitly NOT investigated)
- The `cmdb-governance.service.ts` content (referenced but not read) — assumed to be similar in shape to other services
- Whether the `apps/web/src/app/portal/cmdb/...` route exists — Glob did not surface it; assumed CMDB has no portal-side UI

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified by reading the actual `package.json`
- Architecture: HIGH — every file path, line number, and field name verified by direct read; no fabricated function signatures
- Pitfalls: HIGH for #1, #2, #3, #6 (all directly evidenced in the code); MEDIUM for #4 (relationship duplicate scenario is theoretical, depends on whether HOSTS+VIRTUALIZES collisions exist in real data); MEDIUM for #5 (depends on planner not over-scoping)
- Validation Architecture: HIGH — test file paths and command names are verified; mock pattern is verified by reading existing `cmdb-service.test.ts`
- Backfill correctness: MEDIUM — the existing script handles 4 of 5 FKs; `operationalStatusId` is documented as a Phase 7 addition (assumption A1)

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — schema and service code are stable; reference data seeding pattern is established; no fast-moving dependencies in scope)

---

## RESEARCH COMPLETE
