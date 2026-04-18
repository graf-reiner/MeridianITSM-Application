# Phase 8: Retire Asset Hardware/OS Duplication — Research

**Researched:** 2026-04-17
**Domain:** Schema migration (10-column drop), CMDB extension write path, normalized software inventory table, agent ingestion reroute, Asset detail UI tab, AI context updates
**Confidence:** HIGH (this phase touches code already in the repo; codebase state verified by direct file read; Phase 7 patterns are established and reusable)

---

## Summary

Phase 8 is the **biggest single CSDM clutter win** of v2.0 and the **first destructive Asset-side migration**. Ten columns leave `Asset` permanently in this phase (`hostname`, `operatingSystem`, `osVersion`, `cpuModel`, `cpuCores`, `ramGb`, `disks`, `networkInterfaces`, `softwareInventory`, `lastInventoryAt`); they move onto `CmdbCiServer` (extended with `cpuModel` plus rename `cpuCores → cpuCount` if not already done) and a brand-new normalized table `CmdbSoftwareInstalled`. The `Asset` row becomes purely a financial / ownership / lifecycle record with read-only joined visibility into the linked CI's technical profile.

The work is **mechanical but high-blast-radius** — 25 files in `apps/api` reference the to-be-dropped Asset fields, plus an inventory ingestion endpoint at `apps/api/src/routes/v1/agents/index.ts:338-434` that writes the snapshot blob today, plus the `cmdb-reconciliation` worker that already reroutes most of this data to the CI but still uses the legacy `cpuCores` field name. **The user has locked 8 decisions** that pin every difficult choice: D-01 CI-wins-silently with audit log, D-02 clean drop in this phase (no rename to `_legacy`), D-03 dedicated tab, D-04 orphan-CI empty state with "Link a CI" button, D-05 software table columns, D-06 unique on `(ciId, name, version)` + `lastSeenAt`-driven cleanup, D-07 NO agent change (server-side translation function), D-08 auto-create CI for orphan Asset receiving snapshot.

**Phase 7 just shipped** (2026-04-17 dev), establishing the per-tenant resolver pattern, the `phase7-{verify,backfill,grep-gate}` script naming convention, the pre-flight `DO $$ ... $$` migration block pattern, the worker's inline OPTION B duplication of resolvers, and the audit-table convention. **Phase 8 reuses every one of these patterns**, adds the new `cmdb_migration_audit` table (also reusable by Phases 9-14), and introduces the new `upsertServerExtensionByAsset(tx, tenantId, assetId, snapshot)` server-side translation function that lets the .NET agent stay completely unchanged (D-07).

**Primary recommendation:** Adopt the **same Wave 0 → Wave 5 sequence Phase 7 used**: Wave 0 verification harness (scripts + test scaffolds + the `cmdb_migration_audit` table + the `CmdbSoftwareInstalled` table), Wave 1 reusable seed/audit helpers + new Prisma extension fields + `upsertServerExtensionByAsset` service, Wave 2 per-tenant Asset → CI extension backfill + CI-wins-conflict logging, Wave 3 strip Asset write paths + reroute inventory endpoint to call the new service + grep gate enforcement, Wave 4 AI context updates (CAI-01/02/03), Wave 5 destructive `ALTER TABLE assets DROP COLUMN ×10` + Asset Technical Profile tab UI + final verification gate. Use the **per-tenant raw-SQL backfill pattern** from `phase7-backfill.ts` (the regenerated Prisma client refuses null-filter reads on non-null columns; raw SQL bypasses that chicken-and-egg). **Do NOT** drop the Asset columns until the application/worker code stops writing them — the `phase7-backfill.ts` precedent shows the chicken-and-egg failure mode.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Migration conflict policy):** When an Asset has data and the CI's `CmdbCiServer` extension already has DIFFERENT data, **CI wins silently** and the Asset value is logged to `cmdb_migration_audit` with status `'overwritten_by_ci'`. Maximum throughput, no human gate during migration. Operator reviews post-migration via the audit table.
- **D-02 (Legacy column lifecycle):** The 10 Asset columns are **DROPPED in the Phase 8 migration itself** (clean cut, NOT renamed to `_legacy`). Schema is the cleanest possible state at end of Phase 8. Rollback requires a new migration if needed; the audit table preserves overwritten values for forensic recovery.
- **D-03 (Asset detail UX):** The read-only Technical Profile renders as a **new dedicated tab** on the Asset detail page, positioned next to the existing Overview / Activity tabs. Tab pattern matches the project's existing dashboard convention (see `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557` for the project-standard `TAB_DEFS` array shape).
- **D-04 (Orphan Asset UI):** When an Asset has **no linked CI** (orphan), the Technical Profile tab shows an **empty state with a 'Link a CI' button** that opens a CI picker. Phase 9 will add nightly reconciliation; Phase 8 just needs the degraded-state UI that nudges hygiene.
- **D-05 (CmdbSoftwareInstalled columns):** Beyond `ciId` + `name` + `version`: `vendor`, `publisher`, `installDate`, `source` (enum: `'agent' | 'manual' | 'import'`), `licenseKey` (nullable), `lastSeenAt`. Full schema enables both software-presence reporting AND license-key tracking.
- **D-06 (CmdbSoftwareInstalled uniqueness):** Unique constraint on `(ciId, name, version)`. Each agent inventory cycle does an UPSERT keyed on this triple, updating `lastSeenAt`. Version change creates a new row (preserves version history per CI). Stale rows (no recent `lastSeenAt`) are cleaned by the existing CMDB reconciliation worker.
- **D-07 (Inventory ingestion):** **No agent code changes.** The existing .NET agent endpoint `POST /api/v1/agents/inventory` continues to accept Asset-shaped payloads. The new server-side function `upsertServerExtensionByAsset(tx, tenantId, assetId, snapshot)` performs the translation: looks up `Asset` → finds `assetId` → resolves linked `ciId` → writes hardware fields to `CmdbCiServer` + writes per-software rows to `CmdbSoftwareInstalled`. The Asset row is NEVER touched by the inventory write path. Zero agent fleet redeploy required.
- **D-08 (Orphan-Asset auto-create CI):** When an inventory snapshot arrives for an Asset with **no linked CI**, `upsertServerExtensionByAsset` **auto-creates a CI on-the-fly** using `resolveClassId(tenantId, inferredClassKey)`, auto-links `CmdbConfigurationItem.assetId = assetId`, then proceeds with the extension write. Agents 'just work' — operators don't need to pre-provision CIs.

### Claude's Discretion

- **License reporting query SQL shape**: criterion 5 says "list software-by-CI via `CmdbSoftwareInstalled` joins" — the exact query / report endpoint structure is a planner-level decision. Recommendation in this RESEARCH: extend the existing `apps/api/src/services/report.service.ts` with a `getSoftwareInventoryReport({ tenantId, softwareName?, vendor? })` function and expose via the existing `/api/v1/reports/` route (or a new `/api/v1/cmdb/cis/:id/software` for "what's installed on this CI").
- **Migration ordering** within the Phase 8 migration file (DDL → backfill → DROP COLUMN ordering) — recommended: do Wave 5's destructive DROP COLUMN as a separate Prisma migration that runs AFTER Wave 2's backfill has completed (verified by a pre-flight DO block). Mirrors Phase 7's pre-flight gate at `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:11-36`.
- **Inferred class for orphan-Asset auto-create (D-08)** — REUSE `inferClassKeyFromSnapshot` from `apps/worker/src/workers/cmdb-reconciliation.ts:17-42`. The worker's signature is `(platform: string, hostname: string, operatingSystem: string | null) → { classKey, legacyType }`. The API service should duplicate-inline (per project's no-cross-app-import precedent) into `apps/api/src/services/cmdb.service.ts` (or a new `apps/api/src/services/cmdb-extension.service.ts`).
- **Audit table schema** (`cmdb_migration_audit`) — recommended schema below in `## Architecture Patterns`. Minimum: `id`, `tenantId`, `tableName`, `recordId`, `fieldName`, `oldValue`, `newValue`, `status`, `phase`, `createdAt`. Promote to a Prisma model (NOT raw SQL only) so future phases can write to it via the typed client.
- **Whether to add a service-layer guard on `Asset.create / update` blocking the dropped fields** — Recommended: yes, but only as a transitional safety. After Wave 5 the columns no longer exist, so Prisma will reject the writes anyway. The transitional guard catches stragglers between Wave 3 (services updated) and Wave 5 (column drop) — same pattern as Phase 7's service-layer FK guard.
- **Whether `cmdb_migration_audit` is excluded from the staff AI** — Recommended: YES, exclude. Audit data is operational/forensic, not user-queryable, and may contain sensitive overwritten values. Add to `EXCLUDED_TABLES` in `ai-schema-context.ts`.

### Deferred Ideas (OUT OF SCOPE for Phase 8)

- **Per-field conflict policy** (e.g., Asset wins for osVersion, CI wins for cpuCount) — rejected by D-01.
- **License-management UI** beyond the reporting query — future ITAM phase.
- **Bulk Asset → CI link wizard** — Phase 9 (CAID-03 nightly reconciliation).
- **Software publisher normalization** (canonical vendor names) — future cleanup.
- **Soft-delete / archive of dropped Asset columns** — D-02 chose clean drop; rollback uses `cmdb_migration_audit`.
- **Agent endpoint versioning / Deprecation header** — D-07 chose no agent change.
- **`Asset.siteId` rename to `stockSiteId`** — Phase 9 (CAID-02).
- **`CmdbConfigurationItem.serialNumber` / `assetTag` / `model` drops** — Phase 9 (CAID-01).
- **Application criticality enum normalization** — Phase 10.
- **Service tier introduction** — Phase 11.
- **Onfire `CmdbConfigurationItem.assetId → onDelete: SetNull`** — Phase 13. Phase 8 leaves the FK as-is (currently `Asset?` relation, implicit `onDelete` behavior — Phase 13 makes it explicit).

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CASR-01** | `Asset` schema drops `hostname`, `operatingSystem`, `osVersion`, `cpuModel`, `cpuCores`, `ramGb`, `disks`, `networkInterfaces`, `softwareInventory`, `lastInventoryAt` | Schema state verified at `packages/db/prisma/schema.prisma:1708-1717`. All 10 columns confirmed present today. Wave 5 migration: `ALTER TABLE assets DROP COLUMN "hostname"...DROP COLUMN "lastInventoryAt"`. |
| **CASR-02** | `CmdbCiServer` extension carries canonical hardware fields (`cpuCount`, `memoryGb`, `cpuModel`, disks/NICs as JSON); `cpuCores → cpuCount` rename | Verified at `packages/db/prisma/schema.prisma:2426-2450`. Current state: `cpuCount Int?`, `memoryGb Float?`, `storageGb Float?`. **Already correct on the rename** — no `cpuCores` field exists. Phase 8 ADDS: `cpuModel String?`, `disksJson Json?`, `networkInterfacesJson Json?`. |
| **CASR-03** | `CmdbSoftwareInstalled` normalized table replaces the Asset `softwareInventory` JSON blob; enables license reporting | New Prisma model. Schema in `## Architecture Patterns` below. Indexes for license reporting: `@@index([tenantId, name])` for "all CIs with software X", `@@index([ciId])` for "all software on CI Y", `@@unique([ciId, name, version])` per D-06. |
| **CASR-04** | Per-tenant data migration upserts CI + CmdbCiServer from existing Asset data; CI wins on conflict; mismatches logged to `cmdb_migration_audit` | New script `packages/db/scripts/phase8-backfill.ts` (mirrors `phase7-backfill.ts` shape). Uses raw SQL (`$queryRaw`) for reads of soon-to-be-dropped columns to avoid the regenerated-Prisma-client chicken-and-egg. Per-tenant loop. |
| **CASR-05** | Asset UI exposes read-only "Technical Profile" panel joining through linked CI; CMDB UI becomes the sole edit surface for technical fields | New tab in `apps/web/src/app/dashboard/assets/[id]/page.tsx`. Tab pattern verified at `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557, 784-810`. CMDB UI is already the sole edit surface (no Asset edit forms write to CI today). |
| **CASR-06** | Inventory-agent ingestion routes updates to CI (not Asset); `upsertServerExtensionByAsset` service function added | Endpoint verified at `apps/api/src/routes/v1/agents/index.ts:338-434`. Currently writes ALL fields to `InventorySnapshot` only (NOT to Asset). Asset writes happen via `apps/api/src/services/asset.service.ts:122-130, 262-270` (manual UI input). The inventory snapshot already lands in `InventorySnapshot`; the `cmdb-reconciliation` worker reads the latest snapshot and writes to CI + extension. **Phase 8's CASR-06 work is to add the synchronous in-request `upsertServerExtensionByAsset(...)` so the new contract is enforced via the API endpoint, NOT only via the every-15-min worker sweep.** |
| **CAI-01** (cross-cutting) | Update `apps/api/src/services/ai-schema-context.ts` (staff AI) | Today's file at `ai-schema-context.ts:95` lists `assets` with all 10 doomed columns inline. Phase 8 must: (a) remove `hostname`, `operatingSystem`, `osVersion`, `cpuModel`, `cpuCores`, `ramGb` from the `assets` line, (b) add JOIN-through-Asset documentation showing how to resolve hostname via `cmdb_configuration_items.assetId` → `cmdb_ci_servers`, (c) add a new `cmdb_software_installed` block, (d) update `cmdb_ci_servers` block at line 171 to include the new `cpuModel` + `disksJson` + `networkInterfacesJson` fields. |
| **CAI-02** (cross-cutting) | Update `apps/api/src/services/portal-schema-context.ts` (end-user AI) | Today (verified at `portal-schema-context.ts:33-42`) the portal context allowlist contains zero CMDB tables. Decision: keep CMDB excluded from portal AI. Phase 8's update is to extend the `// Phase 7 audit (CAI-02 lock-in...)` comment block to add a "Phase 8 audit" subsection noting `cmdb_software_installed` is intentionally excluded. |
| **CAI-03** (cross-cutting) | `apps/api/src/services/portal-ai-sql-executor.ts` row-level rules | Verified at `portal-ai-sql-executor.ts:78-87` — the `/\bcmdb_/i` hard-reject already covers `cmdb_software_installed` automatically. Phase 8 adds a Vitest test asserting `executePortalQuery('SELECT * FROM cmdb_software_installed')` returns the rejection error. ALSO add a test asserting `executePortalQuery('SELECT * FROM cmdb_migration_audit')` returns the rejection (matches the same regex). |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

These directives MUST be honored by every plan:

- **Multi-tenancy MANDATORY** — every `prisma.cmdbSoftwareInstalled.*` query and every `prisma.cmdbMigrationAudit.*` query MUST include `tenantId` in the WHERE. Both new tables carry `tenantId` even though the value is derivable from `ciId` (matches the project-wide ALL-tables-have-tenantId pattern).
- **Owner Admin isolation** — Phase 8 schema changes do NOT touch `Owner*` tables. The new `cmdb_migration_audit` table is tenant-scoped, NOT owner-scoped.
- **Plan Enforcement (`planGate`)** — `cmdb_software_installed` writes happen via the agent ingestion path, which uses AgentKey auth (NOT the planGate flow). No new planGate rules needed for Phase 8. Future license-tracking limits per plan tier could go through planGate, but that's deferred.
- **API route pattern `/api/v1/`** — any new endpoints (e.g., `/api/v1/cmdb/cis/:id/software` or `/api/v1/reports/software-installed`) follow the existing `auth() + tenantId` scoping pattern.
- **MDI SVG icons (Rule 5)** — the new "Link a CI" button uses `<Icon path={mdiLink} ...>` (or similar). NOT `mdiList` (that token does not exist per Phase 04-07 lesson).
- **AI Assistant Data Availability (Rule 6) — MANDATORY** — every Phase 8 PR includes the corresponding `ai-schema-context.ts` and `portal-schema-context.ts` and `portal-ai-sql-executor.ts` updates in the same commit. Otherwise the AI bot's understanding diverges from reality.
- **CSDM Field Ownership (Rule 7) — MANDATORY** — Phase 8 enforces the contract on the Asset side: `hostname` / `operatingSystem` / `osVersion` / `cpuCount` / `memoryGb` / `cpuModel` / `disks` / `networkInterfaces` move from Asset (where they were duplicates) to CmdbCiServer (the canonical owner per `docs/architecture/csdm-field-ownership.md`).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Asset schema column drop | DB (Prisma migration) | — | Single Wave 5 destructive migration. Mirrors Phase 7 pre-flight DO block. |
| Per-tenant Asset → CI extension backfill | DB script (one-shot) | — | Same shape as `phase7-backfill.ts`. Per-tenant loop, raw SQL for null-filter reads, idempotent. |
| `upsertServerExtensionByAsset` translation function | API / Backend (service layer) | — | Lives in `apps/api/src/services/cmdb.service.ts` (or new `cmdb-extension.service.ts`). Called from the inventory route. |
| Agent inventory endpoint reroute | API / Backend (route handler) | — | `apps/api/src/routes/v1/agents/index.ts:338` — adds a call to `upsertServerExtensionByAsset` after `InventorySnapshot.create`. Inventory snapshot still gets stored (forensic value); CI/extension writes happen synchronously via the new service. |
| Async reconciliation worker (already exists) | Worker (BullMQ) | — | `apps/worker/src/workers/cmdb-reconciliation.ts` — needs MODIFY to also write `CmdbSoftwareInstalled` rows from `snapshot.installedSoftware` JSON, and to populate the new `cmdb_ci_servers.cpuModel / disksJson / networkInterfacesJson` extension fields (currently missing — see line 320-332). |
| Asset detail Technical Profile tab | Frontend Server (Next.js page) → API | Browser | New tab in `apps/web/src/app/dashboard/assets/[id]/page.tsx`. Fetches CI extension data via existing `/api/v1/cmdb/cis/:id` endpoint. |
| CI picker (for "Link a CI" empty state) | Browser / Client | API | New component `apps/web/src/components/cmdb/CIPicker.tsx`. Calls existing `GET /api/v1/cmdb/cis?search=...`. NEW link endpoint: `PATCH /api/v1/cmdb/cis/:id` body `{ assetId }` (verify if exists; otherwise add). |
| License reporting query | API / Backend (service + route) | — | New `getSoftwareInventoryReport(...)` in `apps/api/src/services/report.service.ts`. New route under `/api/v1/reports/software-installed`. Permission: `reports.read`. |
| AI schema context updates | API / Backend (static TS file) | — | `apps/api/src/services/ai-schema-context.ts` updates land in the same PR as schema migration per Rule 6. |
| `cmdb_migration_audit` writes | DB script (during backfill) + Service layer (future phases) | — | One global tenant-scoped audit table. Phase 8 creates it; Phases 9-14 reuse. |
| Verification queries (zero remaining Asset.hostname etc. populated) | DB script | — | New `packages/db/scripts/phase8-verify.ts`. Mirrors `phase7-verify.ts:22-94`. |
| Grep gate (no app code references Asset.hostname etc.) | Bash script | — | New `packages/db/scripts/phase8-grep-gate.sh`. Mirrors `phase7-grep-gate.sh`. |

---

## Standard Stack

### Core (already in use; verified by direct read)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.7.0 | ORM, migration tool | Repo uses `^7.5.0` per `packages/db/package.json:31-34`; latest stable verified `npm view prisma version` → 7.7.0 [VERIFIED 2026-04-17]. v7 driver-adapter pattern continues. |
| @prisma/client | 7.7.0 | DB client | Same source as above [VERIFIED] |
| @prisma/adapter-pg | 7.5.0 | Postgres driver adapter | `packages/db/package.json:32` [VERIFIED] |
| pg | 8.20.0 | Underlying Postgres client | `packages/db/package.json:33` [VERIFIED] |
| Zod | 4.3.6 | Request validation | `apps/api/package.json` [VERIFIED via npm view zod] |
| Vitest | 4.1.4 | Unit/integration test runner | `packages/db/package.json:39` shows `^4.1.0` [VERIFIED]; latest stable 4.1.4 |
| Playwright | (existing) | E2E tests | Used for Asset detail page tests |
| BullMQ | 5.x | Worker queue | `cmdb-reconciliation` worker [VERIFIED] |

### Supporting (established patterns)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mdi/react` + `@mdi/js` | (installed) | UI icons (SVG) | Technical Profile tab uses `mdiServerNetwork`, `mdiHarddisk`, `mdiMemory`, `mdiCpu64Bit`, `mdiLink`, `mdiPackageVariantClosed` (for software list) [CITED: existing usage in `apps/web/src/app/dashboard/assets/[id]/page.tsx:9-17`] |
| TanStack Query v5 | (installed) | Data fetching for the new tab | Match the `useQuery` pattern at `assets/[id]/page.tsx` [VERIFIED] |
| `pg.Pool` (via Prisma adapter) | — | Direct SQL for backfill + verification | `packages/db/scripts/phase7-backfill.ts:33-37` [VERIFIED — pattern to copy] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `CmdbSoftwareInstalled` Prisma model | Keep `softwareInventory` Json on `CmdbCiServer.softwareInventoryJson` | Json blob is fast to write but kills license reporting (CRIT-5 requires queryable rows). **Reject** — CASR-03 explicitly mandates the normalized table. |
| `cmdb_migration_audit` as Prisma model | Raw SQL table created by migration | Prisma model gives Phases 9-14 a typed write API + auto-includes in `prisma generate`. **Recommend Prisma model.** |
| New `upsertServerExtensionByAsset` synchronously called from inventory route | Leave the existing `cmdb-reconciliation` worker as the only writer (every 15 min) | Async-only is dangerous: `Asset.lastInventoryAt` going away breaks the timing signal that operators rely on for "is the agent still talking to us?" The worker has up-to-15-min latency; the synchronous call gives ~real-time consistency. **Recommend BOTH** — synchronous in inventory route + async worker as a backstop for missed snapshots. (D-07 implies the synchronous path is the new contract.) |
| Per-tenant in-process backfill loop | Single SQL `INSERT INTO cmdb_ci_servers SELECT ... FROM assets WHERE ...` join | Single SQL is faster but obscures conflict logging (CI-wins requires per-row decision logic). Per-tenant loop matches `phase7-backfill.ts` precedent. **Recommend per-tenant loop.** |

**Installation:** No new packages. Phase 8 is pure schema + service logic + UI tab + test additions.

**Version verification (run before plan-phase):**
```bash
npm view prisma version          # confirmed 7.7.0 (project pinned ^7.5.0)
npm view @prisma/client version  # confirmed 7.7.0
npm view zod version             # confirmed 4.3.6
npm view vitest version          # confirmed 4.1.4
```

---

## Architecture Patterns

### System Architecture Diagram (Phase 8 data flow — agent inventory snapshot path)

```
┌─────────────────────┐
│ .NET Inventory      │  POST /api/v1/agents/inventory
│ Agent (Windows /    │ ──────────────────────────────▶┐
│ Linux / macOS)      │  AgentKey auth                 │
│ NO CHANGE per D-07  │  Body: snapshot blob           │
└─────────────────────┘                                │
                                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ apps/api/src/routes/v1/agents/index.ts:338-434                         │
│  POST /api/v1/agents/inventory                                          │
│                                                                         │
│  1. resolveAgent(...)                          [unchanged]              │
│  2. parse body, normalize OS/CPU/etc.          [unchanged]              │
│  3. prisma.inventorySnapshot.create(...)       [unchanged — keeps      │
│                                                   forensic snapshot]    │
│  4. NEW Phase 8: lookup linked Asset for agent (via agent.tenantId      │
│       + agent.hostname or agent.id)                                     │
│  5. NEW Phase 8: await upsertServerExtensionByAsset(prisma,             │
│       tenantId, assetId | null, snapshot, { source: 'agent' })          │
│  6. cmdbReconciliationQueue.add(...)           [unchanged — backstop]   │
│  7. reply 201 { snapshotId, ciId, created }                             │
└────────────────────────────────────────────┬───────────────────────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│ apps/api/src/services/cmdb.service.ts (or new cmdb-extension.service)  │
│  upsertServerExtensionByAsset(tx, tenantId, assetId, snapshot, opts)   │
│                                                                         │
│  if assetId is null OR no Asset.cmdbConfigItems → {                    │
│    // D-08: orphan path — auto-create CI                               │
│    classKey = inferClassKeyFromSnapshot(...)                           │
│    classId = await resolveClassId(tenantId, classKey)                  │
│    lifecycleStatusId = resolveLifecycleStatusId(tenantId,'in_service') │
│    operationalStatusId = resolveOperationalStatusId(tenantId,'online') │
│    environmentId = resolveEnvironmentId(tenantId, 'prod')              │
│    advisory_lock + ciNumber                                            │
│    ci = tx.cmdbConfigurationItem.create({ classId, ..., assetId })     │
│    if (assetId) tx.asset.update would NOT write to Asset               │
│      (Asset.ciId does NOT exist; the link is on CI side)               │
│  } else {                                                               │
│    ci = first cmdbConfigItem on the Asset                              │
│  }                                                                      │
│                                                                         │
│  // Hardware: write CmdbCiServer extension                             │
│  await tx.cmdbCiServer.upsert({                                        │
│    where: { ciId: ci.id },                                              │
│    create: {                                                            │
│      ciId, tenantId, serverType, operatingSystem, osVersion,           │
│      cpuCount, cpuModel,  ◀── Phase 8 NEW field                        │
│      memoryGb, storageGb, domainName, virtualizationPlatform,          │
│      disksJson,           ◀── Phase 8 NEW field                        │
│      networkInterfacesJson, ◀── Phase 8 NEW field                      │
│    },                                                                   │
│    update: { ...same shape, only fields that changed... },             │
│  })                                                                     │
│                                                                         │
│  // Software: D-05/D-06 upsert per software item                       │
│  for each item in snapshot.installedSoftware {                         │
│    await tx.cmdbSoftwareInstalled.upsert({                             │
│      where: { ciId_name_version: { ciId, name, version } },            │
│      create: { tenantId, ciId, name, version, vendor, publisher,       │
│                installDate, source: 'agent', lastSeenAt: now() },      │
│      update: { lastSeenAt: now(), vendor, publisher },                 │
│    })                                                                   │
│  }                                                                      │
│                                                                         │
│  return { ciId: ci.id, created: !!createdNew }                         │
└────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════
ASSET DETAIL PAGE — Technical Profile Tab (D-03 + D-04)
═══════════════════════════════════════════════════════════════════════════

apps/web/src/app/dashboard/assets/[id]/page.tsx
  TAB_DEFS: 'overview' | 'activity' | 'technical-profile' [NEW]

  if (activeTab === 'technical-profile') {
    if (!asset.cmdbConfigItems.length) {
      // D-04: orphan empty state
      <EmptyState>
        "This Asset isn't linked to a Configuration Item.
         Hardware, OS, and software details live on CIs in CMDB."
        <Button onClick={openCIPicker}>Link a CI</Button>
      </EmptyState>
    } else {
      const linkedCi = asset.cmdbConfigItems[0]
      const { data: ext } = useQuery(['cmdb-ci-server', linkedCi.id], () =>
        fetch(`/api/v1/cmdb/cis/${linkedCi.id}`)
      )
      // Read-only display of:
      //   ext.hostname, ext.fqdn, ext.ipAddress
      //   ext.serverExt.operatingSystem, .osVersion, .cpuCount, .cpuModel,
      //     .memoryGb, .storageGb, .domainName
      //   ext.serverExt.disksJson (table render)
      //   ext.serverExt.networkInterfacesJson (table render)
      //   software list from new GET /api/v1/cmdb/cis/:id/software
    }
  }

═══════════════════════════════════════════════════════════════════════════
PER-TENANT BACKFILL (Wave 2)
═══════════════════════════════════════════════════════════════════════════

packages/db/scripts/phase8-backfill.ts
  for each tenant {
    // Find Assets that have any of the 10 hardware fields populated
    // (raw SQL — Prisma client may already reject reading dropped columns
    //  if Wave 5 has run; backfill MUST run pre-Wave-5)
    const candidates = $queryRaw<...>` SELECT id, hostname, operatingSystem,
                                       osVersion, cpuModel, cpuCores, ramGb,
                                       disks, networkInterfaces,
                                       softwareInventory, lastInventoryAt
                                       FROM assets
                                      WHERE "tenantId" = $1
                                        AND (hostname IS NOT NULL
                                             OR operatingSystem IS NOT NULL
                                             OR ...)`;

    for each candidate {
      // Find or create the linked CI
      const linkedCis = $queryRaw `SELECT id FROM cmdb_configuration_items
                                    WHERE "assetId" = $1`;
      let ciId;
      if (linkedCis.length === 0) {
        // No linked CI — auto-create matching D-08 logic
        // (use 'server' as default class for hardware-bearing assets;
        //  inferClassKeyFromSnapshot needs hostname/OS/platform context)
        ciId = await createCiForOrphanAsset(tenantId, asset);
      } else {
        ciId = linkedCis[0].id;
      }

      // Compare and merge — D-01: CI wins, log conflicts
      const existingExt = await prisma.cmdbCiServer.findUnique({
        where: { ciId } });
      const fields = ['operatingSystem', 'osVersion', 'cpuCount', 'cpuModel',
                      'memoryGb', 'disksJson', 'networkInterfacesJson'];
      for each field {
        const ciValue = existingExt?.[field];
        const assetValue = asset.<corresponding-asset-field>;
        if (ciValue != null && assetValue != null && ciValue !== assetValue) {
          // CI wins silently; log to cmdb_migration_audit
          await tx.cmdbMigrationAudit.create({
            tenantId, tableName: 'assets', recordId: asset.id,
            fieldName: field, oldValue: String(assetValue),
            newValue: String(ciValue), status: 'overwritten_by_ci',
            phase: 'phase8',
          });
        } else if (assetValue != null && ciValue == null) {
          // Asset has data, CI doesn't — write to CI
        }
      }

      // Software: explode JSON blob into per-software rows
      for each software in asset.softwareInventory ?? [] {
        await tx.cmdbSoftwareInstalled.upsert({
          where: { ciId_name_version: { ciId, name, version } },
          create: { tenantId, ciId, name, version, vendor, publisher,
                    installDate, source: 'import', lastSeenAt: now() },
          update: {}, // CI wins per D-01
        });
      }
    }
  }
```

### Recommended Project Structure (additions)

```
packages/db/
├── prisma/
│   ├── schema.prisma                              ← MODIFY:
│   │                                                  - DROP 10 cols from Asset (Wave 5)
│   │                                                  - ADD CmdbCiServer.cpuModel,
│   │                                                    .disksJson, .networkInterfacesJson
│   │                                                  - ADD CmdbSoftwareInstalled model
│   │                                                  - ADD CmdbMigrationAudit model
│   └── migrations/
│       ├── XXXX_phase8_extension_and_audit_tables/  ← Wave 1 ADDITIVE migration
│       │   └── migration.sql                          (new tables, new ext columns)
│       └── XXXX_phase8_drop_asset_tech_columns/   ← Wave 5 DESTRUCTIVE migration
│           └── migration.sql                          (pre-flight DO + DROP COLUMN x10)
└── scripts/
    ├── phase8-verify.ts                           ← NEW (pattern: phase7-verify.ts)
    ├── phase8-backfill.ts                         ← NEW (pattern: phase7-backfill.ts)
    └── phase8-grep-gate.sh                        ← NEW (pattern: phase7-grep-gate.sh)

apps/api/src/
├── services/
│   ├── cmdb.service.ts                            ← MODIFY: ADD upsertServerExtensionByAsset
│   │                                                  (or new cmdb-extension.service.ts)
│   ├── asset.service.ts                           ← MODIFY (Wave 3):
│   │                                                  - Remove all 10 hostname/etc. fields
│   │                                                    from CreateAssetData / UpdateAssetData
│   │                                                  - Remove the corresponding lines in
│   │                                                    createAsset (122-130) + updateAsset
│   │                                                    (262-270)
│   │                                                  - Remove `hostname` from listAssets
│   │                                                    search filter (line 198) — switch to
│   │                                                    JOIN cmdb_configuration_items via
│   │                                                    assetId for hostname search
│   ├── report.service.ts                          ← MODIFY: ADD getSoftwareInventoryReport
│   ├── ai-schema-context.ts                       ← MODIFY (Wave 4):
│   │                                                  - Strip 10 cols from `assets` block (line 95)
│   │                                                  - Add JOIN-through-Asset documentation
│   │                                                  - Add `cmdb_software_installed` block
│   │                                                  - Update `cmdb_ci_servers` block (line 171)
│   │                                                    with new cpuModel/disksJson/NICs
│   │                                                  - Add `cmdb_migration_audit` to
│   │                                                    EXCLUDED_TABLES
│   ├── portal-schema-context.ts                   ← MODIFY: extend Phase 7 audit comment
│   │                                                  block with Phase 8 subsection
│   └── portal-ai-sql-executor.ts                  ← UNCHANGED (regex covers new tables)
├── routes/v1/
│   ├── agents/index.ts                            ← MODIFY: lines 338-434 — call
│   │                                                  upsertServerExtensionByAsset after
│   │                                                  inventorySnapshot.create
│   ├── assets/index.ts                            ← MODIFY (Wave 3):
│   │                                                  - lines 48-56 + 80-88 (POST body)
│   │                                                  - lines 188-196 (PUT body)
│   │                                                  - Remove all 10 fields from extractor
│   ├── cmdb/index.ts                              ← MAYBE MODIFY: add PATCH /cmdb/cis/:id
│   │                                                  for { assetId } (Link-a-CI flow)
│   │                                                  if not present
│   ├── cmdb/cis/[id]/software.ts                  ← NEW: GET /api/v1/cmdb/cis/:id/software
│   │                                                  list software for one CI
│   └── reports/software-installed.ts              ← NEW: GET /api/v1/reports/software-
│                                                       installed?softwareName=&vendor=
└── __tests__/
    ├── cmdb-extension.test.ts                     ← NEW: upsertServerExtensionByAsset
    │                                                  tests (orphan path, normal path,
    │                                                  conflict logging)
    ├── asset-service.test.ts                      ← MODIFY: remove all dropped-field
    │                                                  tests; add tests asserting writes
    │                                                  ignore those fields
    ├── ai-schema-context.test.ts                  ← MODIFY: assert 10 cols absent from
    │                                                  `assets`; assert
    │                                                  `cmdb_software_installed` present
    └── portal-context.test.ts                     ← MODIFY: extend rejects to cover
                                                       cmdb_software_installed + audit

apps/worker/src/workers/
└── cmdb-reconciliation.ts                         ← MODIFY:
                                                       - Lines 318-332 + 437-462: write
                                                         the new cpuModel + disksJson +
                                                         networkInterfacesJson fields
                                                       - NEW: software upsert loop after
                                                         server extension upsert

apps/web/src/
├── app/dashboard/assets/[id]/
│   └── page.tsx                                   ← MODIFY (Wave 5):
│                                                       - Remove hostname/OS/CPU/RAM
│                                                         display rows (lines 397, 605)
│                                                       - Add TAB_DEFS array + tab nav
│                                                       - Add 'technical-profile' tab
│                                                       - D-04 empty state for orphan
└── components/cmdb/
    └── CIPicker.tsx                               ← NEW: search-by-name CI picker for
                                                       Link-a-CI flow

apps/web/tests/
├── asset-technical-profile.spec.ts                ← NEW: Playwright — Asset detail tab
│                                                       renders CI hardware on linked
│                                                       Asset; shows empty state on orphan
├── asset-link-ci.spec.ts                          ← NEW: Playwright — orphan Asset →
│                                                       Link a CI button → picker → linked
└── inventory-agent-reroute.spec.ts                ← NEW: Playwright — POST mock inventory
                                                       payload, verify Asset hostname is
                                                       NULL post-deploy + CmdbCiServer
                                                       has the value
```

### Pattern 1: Per-Tenant Backfill with Raw SQL Reads (CRITICAL)

The Phase 7 backfill discovered that the regenerated Prisma client **refuses null-filter reads on now-non-null columns**. Phase 8 has the same chicken-and-egg problem: after the schema migration drops `assets.hostname`, you can't `prisma.asset.findMany({ select: { hostname: true } })`. The migration ordering must be:

1. **Wave 1 ADDITIVE migration** — adds the new tables (`CmdbSoftwareInstalled`, `CmdbMigrationAudit`) and the new `CmdbCiServer` columns. Does NOT drop anything.
2. **Wave 2 backfill** — runs against the schema where Asset still has the 10 columns. Uses raw `$queryRaw` to read them defensively.
3. **Wave 3** strips application code paths that write the 10 columns.
4. **Wave 4** AI context updates (no DB change).
5. **Wave 5 DESTRUCTIVE migration** — `ALTER TABLE assets DROP COLUMN ...` for all 10. Has its own pre-flight gate: `RAISE EXCEPTION` if any Asset still has hardware data not represented in a `CmdbCiServer` extension.

```typescript
// Pattern from phase7-backfill.ts:243-263 [VERIFIED]
const candidates = await prisma.$queryRaw<
  Array<{
    id: string;
    hostname: string | null;
    operatingSystem: string | null;
    // ...
  }>
>`
  SELECT id, hostname, "operatingSystem", "osVersion",
         "cpuModel", "cpuCores", "ramGb",
         disks, "networkInterfaces", "softwareInventory",
         "lastInventoryAt"
    FROM "assets"
   WHERE "tenantId" = ${tenantId}::uuid
     AND (hostname IS NOT NULL
          OR "operatingSystem" IS NOT NULL
          OR "osVersion" IS NOT NULL
          OR "cpuModel" IS NOT NULL
          OR "cpuCores" IS NOT NULL
          OR "ramGb" IS NOT NULL
          OR disks IS NOT NULL
          OR "networkInterfaces" IS NOT NULL
          OR "softwareInventory" IS NOT NULL
          OR "lastInventoryAt" IS NOT NULL)
`;
```

### Pattern 2: Pre-Flight DO Block in Destructive Migration

The Wave 5 migration that drops the 10 Asset columns must include a Phase 7-style pre-flight gate:

```sql
-- packages/db/prisma/migrations/XXXX_phase8_drop_asset_tech_columns/migration.sql

-- ============================================================================
-- Phase 8 pre-flight: abort if any Asset has hardware data not yet migrated
-- ============================================================================
DO $$
DECLARE
  unmigrated_count INT;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
    FROM "assets" a
    LEFT JOIN "cmdb_configuration_items" ci ON ci."assetId" = a.id
    LEFT JOIN "cmdb_ci_servers" srv ON srv."ciId" = ci.id
   WHERE (a.hostname IS NOT NULL
          OR a."operatingSystem" IS NOT NULL
          OR a."cpuCores" IS NOT NULL
          OR a."ramGb" IS NOT NULL)
     AND srv.ciId IS NULL;
  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Phase 8 backfill incomplete: % Assets still have hardware data without a corresponding CmdbCiServer extension. Run packages/db/scripts/phase8-backfill.ts before applying this migration.',
                    unmigrated_count;
  END IF;
END $$;

-- ============================================================================
-- Generated by Prisma below this line
-- ============================================================================
ALTER TABLE "assets" DROP COLUMN "hostname",
                     DROP COLUMN "operatingSystem",
                     DROP COLUMN "osVersion",
                     DROP COLUMN "cpuModel",
                     DROP COLUMN "cpuCores",
                     DROP COLUMN "ramGb",
                     DROP COLUMN "disks",
                     DROP COLUMN "networkInterfaces",
                     DROP COLUMN "softwareInventory",
                     DROP COLUMN "lastInventoryAt";
```

### Pattern 3: New Prisma Models — `CmdbSoftwareInstalled` + `CmdbMigrationAudit`

```prisma
// packages/db/prisma/schema.prisma — Wave 1 additive migration

model CmdbSoftwareInstalled {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @db.Uuid
  ciId        String    @db.Uuid
  name        String
  version     String
  vendor      String?
  publisher   String?
  installDate DateTime?
  source      String    // 'agent' | 'manual' | 'import' (per D-05, kept as string for tenant flexibility; alternative is enum)
  licenseKey  String?
  lastSeenAt  DateTime  @default(now())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tenant Tenant                @relation(fields: [tenantId], references: [id])
  ci     CmdbConfigurationItem @relation(fields: [ciId], references: [id], onDelete: Cascade)

  @@unique([ciId, name, version])           // D-06: upsert key
  @@index([tenantId])
  @@index([tenantId, name])                 // license reporting: "all CIs with software X"
  @@index([ciId])                           // "all software on CI Y"
  @@index([tenantId, lastSeenAt])           // stale cleanup (per D-06)
  @@map("cmdb_software_installed")
}

model CmdbMigrationAudit {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  tableName  String   // e.g., 'assets', 'cmdb_configuration_items'
  recordId   String   // typically uuid; kept as String for flexibility
  fieldName  String
  oldValue   String?
  newValue   String?
  status     String   // 'overwritten_by_ci' | 'overwritten_by_asset' | 'noop' | etc.
  phase      String   // e.g., 'phase8', 'phase9'
  createdAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([tenantId, phase])
  @@index([tenantId, tableName, recordId])
  @@map("cmdb_migration_audit")
}

// Update existing CmdbCiServer model (additive):
model CmdbCiServer {
  // ... existing fields unchanged ...
  cpuModel              String?    // NEW Phase 8 (CASR-02)
  disksJson             Json?      // NEW Phase 8 (verbatim move from Asset.disks)
  networkInterfacesJson Json?      // NEW Phase 8 (verbatim move from Asset.networkInterfaces)
  // ...
}
```

Also add reverse relations:
- `CmdbConfigurationItem` gains `softwareInstalled CmdbSoftwareInstalled[]`
- `Tenant` gains `cmdbSoftwareInstalled CmdbSoftwareInstalled[]` and `cmdbMigrationAudit CmdbMigrationAudit[]`

### Pattern 4: `upsertServerExtensionByAsset` Service Function (D-07 + D-08)

```typescript
// apps/api/src/services/cmdb.service.ts (or new apps/api/src/services/cmdb-extension.service.ts)
// Phase 8: Source-of-truth translation function for the inventory ingestion path.

import type { Prisma } from '@meridian/db';
import {
  resolveClassId,
  resolveLifecycleStatusId,
  resolveOperationalStatusId,
  resolveEnvironmentId,
} from './cmdb-reference-resolver.service.js';

export interface AgentInventorySnapshot {
  hostname: string | null;
  fqdn: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  cpuCount: number | null;
  cpuModel: string | null;
  ramGb: number | null;
  storageGb: number | null;
  disks: unknown;
  networkInterfaces: unknown;
  domainName: string | null;
  hypervisorType: string | null;
  isVirtual: boolean | null;
  installedSoftware: Array<{
    name: string;
    version: string;
    vendor?: string | null;
    publisher?: string | null;
    installDate?: string | null;
  }> | null;
  // ... add other snapshot fields as needed
}

export interface UpsertServerExtensionResult {
  ciId: string;
  created: boolean; // true if a new CI was auto-created (D-08)
}

/**
 * Phase 8 (CASR-06, D-07, D-08): translate an agent-shaped inventory snapshot
 * into CMDB writes. Asset is NEVER touched by this path.
 *
 * Flow:
 *   1. Look up Asset by (id, tenantId).
 *   2. Find linked CI via CmdbConfigurationItem.assetId. If none, auto-create
 *      one (D-08) using inferClassKeyFromSnapshot + resolveClassId.
 *   3. Upsert CmdbCiServer extension with hardware fields.
 *   4. For each item in snapshot.installedSoftware, upsert CmdbSoftwareInstalled
 *      keyed on (ciId, name, version) per D-06; updates lastSeenAt.
 *
 * Multi-tenancy: every prisma call inside this function MUST include tenantId.
 */
export async function upsertServerExtensionByAsset(
  tx: Prisma.TransactionClient,
  tenantId: string,
  assetId: string | null,
  snapshot: AgentInventorySnapshot,
  opts?: { source?: 'agent' | 'manual' | 'import' },
): Promise<UpsertServerExtensionResult> {
  // ... implementation per the System Architecture Diagram above
}

// Inferred-class helper duplicated from apps/worker/src/workers/cmdb-reconciliation.ts:17
// per the project's no-cross-app-import precedent (mapStripeStatus pattern).
function inferClassKeyFromSnapshot(
  platform: string | null,
  hostname: string | null,
  operatingSystem: string | null,
): { classKey: string; legacyType: string } {
  // ... copy verbatim from worker (lines 17-42)
}
```

### Pattern 5: License Reporting Query (CRIT-5)

```typescript
// apps/api/src/services/report.service.ts — extend with:

export interface SoftwareInventoryReportFilters {
  softwareName?: string;
  vendor?: string;
  publisher?: string;
  ciClassKey?: string;  // optional: filter by CI class
  page?: number;
  pageSize?: number;
}

/**
 * Phase 8 (CRIT-5): software-by-CI listing for license reporting.
 * Tenant-scoped via tenantId on cmdb_software_installed.
 */
export async function getSoftwareInventoryReport(
  tenantId: string,
  filters: SoftwareInventoryReportFilters = {},
) {
  // SELECT s.*, ci.name AS ciName, ci.ciNumber, cls.classKey, cls.className
  // FROM cmdb_software_installed s
  // JOIN cmdb_configuration_items ci ON s.ciId = ci.id
  // JOIN cmdb_ci_classes cls ON ci.classId = cls.id
  // WHERE s.tenantId = $1
  //   AND ($2::text IS NULL OR s.name ILIKE '%' || $2 || '%')
  //   AND ($3::text IS NULL OR s.vendor = $3)
  //   AND ($4::text IS NULL OR cls.classKey = $4)
  // ORDER BY ci.name, s.name
  // ...
}
```

Route exposed at `GET /api/v1/reports/software-installed?softwareName=...&vendor=...` with `requirePermission('reports.read')`.

ALSO add a CI-scoped endpoint: `GET /api/v1/cmdb/cis/:id/software` for "what's installed on this CI" — used by the new Asset Technical Profile tab to render the per-CI software list.

### Pattern 6: Asset Detail Tab Pattern (CSDM-aligned UI)

The CMDB CI detail page at `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557` is the canonical project tab pattern:

```tsx
// apps/web/src/app/dashboard/assets/[id]/page.tsx
type Tab = 'overview' | 'activity' | 'technical-profile';

const TAB_DEFS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: mdiInformationOutline },
  { key: 'activity', label: 'Activity', icon: mdiHistory },
  { key: 'technical-profile', label: 'Technical Profile', icon: mdiServerNetwork },
];

const [activeTab, setActiveTab] = useState<Tab>('overview');

// Render the tab nav matching cmdb/[id]/page.tsx:784-810 styling exactly.
```

### Pattern 7: D-04 Empty State for Orphan Asset

```tsx
{activeTab === 'technical-profile' && (
  asset.cmdbConfigItems.length === 0 ? (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <Icon path={mdiLinkOff} size={2} color="var(--text-muted)" />
      <h3>No linked Configuration Item</h3>
      <p>
        This Asset isn't linked to a Configuration Item. Hardware, OS, and software
        details live on CIs in CMDB.{' '}
        <strong>Link a CI</strong> to see the technical profile here, or{' '}
        <strong>Create a new CI</strong> if none exists.
      </p>
      <button onClick={() => setLinkPickerOpen(true)}>
        <Icon path={mdiLink} size={0.8} /> Link a CI
      </button>
    </div>
  ) : (
    <TechnicalProfilePanel asset={asset} ci={asset.cmdbConfigItems[0]} />
  )
)}
```

### Anti-Patterns to Avoid

- **Calling `upsertServerExtensionByAsset` outside of a Prisma transaction** — orphan CI auto-create + extension upsert + software upserts must be atomic. If any step fails, the entire snapshot rolls back.
- **Reading `asset.hostname` etc. after Wave 5** — TypeScript will catch this if Prisma is regenerated, but the Wave 0 grep gate must enforce zero references in `apps/web/src` and `apps/api/src` BEFORE Wave 5 ships. Mirror the Phase 7 ENFORCE convention.
- **Putting `cmdb_software_installed` in the portal AI allowlist** — CASR-03 + CAI-02 keep portal AI CMDB-free; this includes the new software table. The `/\bcmdb_/i` regex in `portal-ai-sql-executor.ts:86` already enforces this; add a Vitest case as defense-in-depth.
- **Making the agent inventory POST synchronously fail if the user-side AI write succeeds but the worker BullMQ enqueue fails** — keep the existing `try/catch` non-critical pattern at `agents/index.ts:423-431`.
- **Using `prisma.cmdbSoftwareInstalled.upsert` without `tenantId` in the where** — the unique key is `(ciId, name, version)`, but downstream queries MUST filter by tenantId. This is a CLAUDE.md Rule 1 invariant.
- **Removing `Asset.lastInventoryAt` without surfacing the equivalent on the CI side** — operators rely on this for "is the agent still talking to us?" — surface via `CmdbCiServer.updatedAt` (auto-updated by Prisma) and `Agent.lastHeartbeatAt` (already exists).
- **Dropping `CmdbConfigurationItem.assetId` onDelete:SetNull change in this phase** — that's Phase 13. Phase 8 leaves the FK as-is.
- **Renaming `cmdbCiServer.cpuCount` back to `cpuCores` for "consistency"** — the model is already on the canonical CSDM spelling (`cpuCount`); D-02 confirms the rename was already done per Phase 7 schema state. Keep as-is.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-tenant Asset → CI extension backfill loop | Custom Node script with raw `pg` queries | `prisma.$queryRaw` + `pg.Pool` adapter pattern from `phase7-backfill.ts` | Already-established; reuses the project's adapter; per-tenant logging baked in. |
| Class inference from snapshot | Custom heuristic re-implementation | `inferClassKeyFromSnapshot` from `apps/worker/src/workers/cmdb-reconciliation.ts:17-42` | Already covers Linux / macOS / Windows + server/workstation heuristics; duplicate-inline into the API service per project convention. |
| FK resolver caching | Custom Map-based cache | `cmdb-reference-resolver.service.ts:resolveClassId/...` already exports the 5 resolvers | Phase 7's reference-resolver service is already in use by `cmdb.service`, `application.service`, `cmdb-import.service`. |
| Pre-flight migration gate | Custom verification script that runs separately | `DO $$ ... RAISE EXCEPTION ... $$` block embedded in the migration SQL | Phase 7 precedent at `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:11-60`; failure mode is a clear actionable error message. |
| Audit-table writes | Custom `INSERT INTO cmdb_migration_audit` raw SQL | Promote to Prisma model `CmdbMigrationAudit`, write via `tx.cmdbMigrationAudit.create(...)` | Typed, multi-tenant-safe, reusable by Phases 9-14. |
| BullMQ queue for software-extension async | New queue + new worker | Reuse the existing `cmdb-reconciliation` worker (which already touches CmdbCiServer) | The worker already gets called from the inventory route. Phase 8 just extends what the worker writes. The synchronous `upsertServerExtensionByAsset` path is the new contract; the worker stays as the every-15-min backstop. |
| Inventory snapshot DTO/type | Custom JSON parser in upsertServerExtensionByAsset | Mirror the existing `body` parsing at `agents/index.ts:342-417` and lift it into a typed `AgentInventorySnapshot` interface | Keeps the agent payload contract single-sourced. |
| Software publisher normalization | Build a fuzzy-match normalizer | Defer per CONTEXT.md "Deferred Ideas" | Out of scope; raw `publisher` string is good enough for license reporting. |

**Key insight:** This phase is about **moving canonical ownership of fields** — every reusable helper for resolving FKs, running per-tenant loops, gating migrations, and auditing conflicts already exists from Phase 7. Phase 8's planner work is mostly about **wiring** existing helpers into the new code paths, NOT inventing new infrastructure.

---

## Runtime State Inventory

Phase 8 is a **schema-drop + service-rewire phase** — runtime state matters. Each category checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) `Asset.hostname` / `operatingSystem` / `osVersion` / `cpuModel` / `cpuCores` / `ramGb` / `disks` / `networkInterfaces` / `softwareInventory` / `lastInventoryAt` — populated for every Asset created via UI or seeded via `apps/api/src/routes/v1/agents/index.ts:80-88` (initial create from agent). (2) `InventorySnapshot` rows persist forever today — they retain hostname/OS/etc. as historical records. NOT migrated; intentional retention. (3) Tenant-scoped `CmdbCiServer` rows already exist for every agent-managed CI; Phase 8 ADDS the new `cpuModel / disksJson / networkInterfacesJson` columns. (4) **New tables**: `cmdb_software_installed` and `cmdb_migration_audit` start empty. | (a) Wave 2 backfill: Asset hardware → `CmdbCiServer` per the conflict policy (D-01); Asset.softwareInventory blob → `cmdb_software_installed` rows. (b) Wave 5: DROP COLUMN x10 from `assets`. (c) `InventorySnapshot.installedSoftware` blob STAYS — that's historical forensic data, not live state. |
| **Live service config** | Cloudflare Tunnel routes for `/api/v1/agents/inventory` are unchanged (D-07: no agent change). PM2 process names unchanged. Datadog dashboards may have queries against `assets.hostname` (verify with operator before deploy). | None for Cloudflare/PM2. **Action for operator**: search any external dashboards (Datadog, Grafana, internal BI) for `assets.hostname` references and re-route to `cmdb_configuration_items.hostname` JOIN through `assetId`. |
| **OS-registered state** | None — no Windows scheduled tasks or systemd units reference these column names. | None. |
| **Secrets and env vars** | None — no env vars carry the field names. | None. |
| **Build artifacts / installed packages** | After `prisma generate` (Wave 1 + Wave 5), the regenerated `@prisma/client` no longer types `Asset.hostname` etc. **TypeScript breakage** is the canary that the grep gate must pass before Wave 5 lands. The `node_modules/@prisma/client` for `apps/web`, `apps/api`, `apps/worker`, and any other consumer must be regenerated post-deploy. **`apps/inventory-agent`** (.NET) does NOT consume Prisma — unaffected. | (a) Wave 0 plan: `pnpm --filter @meridian/db prisma generate` after each schema change. (b) Wave 5: re-run `pnpm install` if needed to refresh symlinks. |

**Other runtime state to be aware of:**
- The agent UI at `apps/inventory-agent/src/InvAgent.Api/` may render `assets.hostname` somewhere (verify); if so, switch to JOIN through CMDB.
- Any custom views/CTEs in operator runbooks SHOULD be flagged in `STATE.md` Tracked Follow-ups for Phase 8 retrospective.

---

## Common Pitfalls

### Pitfall 1: Backfill chicken-and-egg with regenerated Prisma client
**What goes wrong:** Phase 7 hit this; Phase 8 will hit it harder. Once `prisma generate` runs against a schema where `Asset.hostname` is dropped, the TypeScript types refuse to read or filter the column. If the backfill script runs AFTER schema generation but BEFORE schema migration, it can't read the soon-to-be-dropped data via the typed client.
**Why it happens:** Prisma 7 generates strictly-typed client; client generation must happen against the OLD schema while backfill reads, then the NEW schema after backfill writes.
**How to avoid:** Use `$queryRaw` for ALL reads of doomed columns (mirrors `phase7-backfill.ts:243-263`). The regenerated typed client refuses, raw SQL bypasses validation.
**Warning signs:** TypeScript compile errors in `phase8-backfill.ts` referencing `Property 'hostname' does not exist on type 'Asset'`.

### Pitfall 2: Concurrent inventory POST during backfill creates duplicate CI for same Asset
**What goes wrong:** Wave 2 backfill is running. An agent submits an inventory POST. The new `upsertServerExtensionByAsset` (already deployed in Wave 1) tries to create a CI for an orphan Asset; meanwhile the backfill ALSO creates a CI for the same Asset. Result: two CIs linked to one Asset (or unique-constraint violation on `ciNumber`).
**Why it happens:** No coordination between the running backfill script and the live API.
**How to avoid:** The backfill MUST acquire the same `pg_advisory_xact_lock(hashtext(${tenantId} || '_ci_seq'))` that the live `createCI` and `cmdb-reconciliation` worker use (verified in `apps/api/src/services/cmdb.service.ts:227-231` and `apps/worker/src/workers/cmdb-reconciliation.ts:255`). For Phase 8, also add a per-tenant idempotency guard: `INSERT ... ON CONFLICT DO NOTHING` for the Asset → CI link (only one CI per Asset for hardware classes; Phase 9 makes nullable assetId explicit).
**Warning signs:** Backfill log reports "duplicate ciNumber" or two CIs share `assetId`.

### Pitfall 3: Software upsert composite key collision when version changes
**What goes wrong:** D-06 says "Version change creates a new row (preserves version history per CI)." But if an agent reports `Microsoft Office 16.0.1` then later `Microsoft Office 16.0.2`, the old row stays (correct per D-06) — but if the agent reports `Microsoft Office (no version)`, the empty-string version becomes a unique row and the next report with `16.0.2` creates ANOTHER row. So a CI can accumulate rows like `('Microsoft Office', '')`, `('Microsoft Office', '16.0.1')`, `('Microsoft Office', '16.0.2')` without a clear winner.
**Why it happens:** Empty version strings don't dedupe with non-empty versions.
**How to avoid:** Define a normalization rule in `upsertServerExtensionByAsset`: if snapshot software has no version, write `'unknown'` (NOT empty string, NOT null — the unique key requires a value). Document this in the audit-table convention. Stale-cleanup (lastSeenAt-driven) is the safety net for accumulated rows.
**Warning signs:** `cmdb_software_installed` for one CI has multiple rows for the same `name` with versions like `''`, `'unknown'`, and a real version.

### Pitfall 4: Conflict logging volume explodes for tenants with many Assets
**What goes wrong:** D-01 logs every conflict to `cmdb_migration_audit`. A tenant with 5,000 Assets, each with 6 differing fields and 100 software items, generates ~30,000 audit rows in one backfill run. Multiplied by all tenants, the audit table becomes a hot spot.
**Why it happens:** Per-row, per-field logging is expressive but verbose.
**How to avoid:** Use Prisma's `createMany({ data: [...], skipDuplicates: true })` for batched audit inserts (one batch per Asset). Add a backfill summary log: "Tenant X: backfilled 5000 Assets, logged 30000 audit rows." Operator can later truncate the audit table after retention period (suggest 90 days). Add `@@index([tenantId, createdAt])` for retention queries.
**Warning signs:** Backfill takes >10 minutes per tenant, or `cmdb_migration_audit` grows >100MB on dev DB.

### Pitfall 5: Worker still writes `Asset.hostname` somewhere after Wave 5
**What goes wrong:** A grep of `apps/worker/src/` for `asset.update` or `prisma.asset` finds a write path that the Wave 3 audit missed. Once Wave 5 drops the columns, the worker errors out with "column does not exist."
**Why it happens:** Worker has its own copy of types and code; its grep audit must be independent of the API audit.
**How to avoid:** `phase8-grep-gate.sh` must scan `apps/worker/src/` AND `apps/api/src/` AND `apps/web/src/`. Wave 3 task list must include "verify zero hits in worker."
**Warning signs:** Post-Wave-5 worker log shows `prisma error: column "hostname" does not exist`.

### Pitfall 6: Asset detail page broken after column drop because TS interface still expects `hostname`
**What goes wrong:** `apps/web/src/app/dashboard/assets/[id]/page.tsx:35-58` defines `interface AssetDetail { hostname: string | null; ... }`. After Wave 5, the API no longer returns those fields; React renders `undefined` and TanStack Query may warn. Worse, the `field('Hostname', 'hostname')` call at line 397 gives a blank cell.
**Why it happens:** The interface duplicates the API shape; there's no schema-share between `apps/web` and `apps/api`.
**How to avoid:** Wave 5 task must also update the `AssetDetail` interface in `apps/web/src/app/dashboard/assets/[id]/page.tsx` to remove the 6 dropped fields, AND remove the corresponding render rows (lines 397, 605, etc.). The Technical Profile tab (D-03) renders the values from the linked CI instead.
**Warning signs:** Asset detail page shows "—" for Hostname/OS/CPU/RAM in the Overview after deploy; OR TypeScript errors in `assets/[id]/page.tsx`.

### Pitfall 7: Orphan-Asset auto-create in `upsertServerExtensionByAsset` violates `cmdbConfigurationItem.classId NOT NULL` if reference data missing
**What goes wrong:** D-08 auto-creates a CI on snapshot arrival. Resolver lookup `resolveClassId(tenantId, 'server')` returns NULL because the tenant was created BEFORE Phase 7's signup hook landed and never had reference data seeded.
**Why it happens:** Phase 7 added the seed hook, but Phase 7's `seed-existing-tenants-cmdb-ref.ts` script must have been run for every existing tenant. If a tenant slipped through, Phase 8 fails on first agent heartbeat for that tenant.
**How to avoid:** `upsertServerExtensionByAsset` must throw a structured error if `resolveClassId` returns NULL — the same `Phase 7: missing reference data for tenant ${tenantId}` pattern at `cmdb-reconciliation.ts:216-225`. ALSO: Phase 8 Wave 0 includes a sanity check that re-runs `seed-existing-tenants-cmdb-ref.ts` to catch any tenant added between Phase 7 ship and Phase 8 start.
**Warning signs:** Agent inventory POSTs return 500 with "missing reference data for tenant" for one or more tenants.

### Pitfall 8: `Asset.softwareInventory` JSON shape varies across Asset records
**What goes wrong:** The `softwareInventory` field is `Json?` — no schema. Some Assets have `[{ name, version }, ...]`; others have `{ apps: [...] }`; others have stringified blobs. Backfill explodes when iterating.
**Why it happens:** The field has been written by both manual UI input AND by a (now-removed?) earlier ingestion path. No validator was ever applied.
**How to avoid:** The backfill script must defensively handle each JSON shape: `Array.isArray(blob) ? blob : (blob?.apps ?? [])`. For unrecognized shapes, log to `cmdb_migration_audit` with `status: 'unparseable_software_blob'` and continue. Don't fail the per-Asset migration.
**Warning signs:** Backfill stack trace mentions `TypeError: Cannot read properties of undefined (reading 'name')` while iterating software.

### Pitfall 9: AI bot answers go stale if `ai-schema-context.ts` not updated in same PR as schema migration
**What goes wrong:** Wave 4 (AI context update) lands one PR after Wave 5 (column drop). Between PRs, the AI bot's prompt still says `assets.hostname` exists; user asks "what's the hostname of asset AST-00123" and the bot generates `SELECT hostname FROM assets WHERE assetTag='AST-00123'` which fails.
**Why it happens:** Splitting Rule 6's "same PR" mandate.
**How to avoid:** Wave 4 (AI context updates) lands BEFORE Wave 5 (destructive migration). The destructive migration is the LAST plan in Phase 8. Order: Wave 0 → Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5.
**Warning signs:** Operators report "the AI says hostname doesn't exist on assets" — a sign Wave 4 was skipped or Wave 5 ran first.

### Pitfall 10: `inventory-snapshot.installedSoftware` JSON shape is `Json?` not the same as `Asset.softwareInventory`
**What goes wrong:** `InventorySnapshot.installedSoftware` (`schema.prisma:1996`) is the agent's actual payload format; `Asset.softwareInventory` (`schema.prisma:1716`) was the legacy duplicate. The two might have different shapes.
**Why it happens:** Two write paths, two formats, no contract.
**How to avoid:** Backfill (Wave 2) reads `assets.softwareInventory` JSON; the live `upsertServerExtensionByAsset` reads `snapshot.installedSoftware` JSON. Both feed into the same `cmdbSoftwareInstalled.upsert` call. Define a single `parseSoftwareList(unknown): Array<{ name, version, vendor?, publisher?, installDate? }>` helper that handles both shapes plus the unparseable case (Pitfall 8).
**Warning signs:** Some software rows have `vendor` populated (from agent) while others have `vendor: null` (from Asset blob); the report query needs to handle both.

---

## Code Examples

Verified patterns from official Phase 7 sources + project conventions:

### Example 1: Per-tenant raw-SQL backfill loop
```typescript
// Source: packages/db/scripts/phase7-backfill.ts:194-336 [VERIFIED]
// Adapt for Phase 8 — same shape, different SELECT/UPDATE columns.

async function migrateTenant(tenantId: string, tenantName: string): Promise<TenantResult> {
  console.log(`\n=== Tenant: ${tenantName} (${tenantId}) ===`);

  // Step 1: Ensure reference data exists (Phase 7's seed pattern)
  const classCount = await prisma.cmdbCiClass.count({ where: { tenantId } });
  if (classCount === 0) {
    if (!DRY_RUN) {
      await prisma.$transaction(async (tx) => {
        await seedCmdbReferenceData(tx, tenantId);
      });
    }
  }

  // Step 2: Read Asset hardware fields via raw SQL (chicken-and-egg avoidance)
  const candidates = await prisma.$queryRaw<Array<{
    id: string; hostname: string | null; operatingSystem: string | null;
    osVersion: string | null; cpuModel: string | null; cpuCores: number | null;
    ramGb: number | null; disks: unknown; networkInterfaces: unknown;
    softwareInventory: unknown; lastInventoryAt: Date | null;
  }>>`
    SELECT id, hostname, "operatingSystem", "osVersion", "cpuModel",
           "cpuCores", "ramGb", disks, "networkInterfaces",
           "softwareInventory", "lastInventoryAt"
      FROM "assets"
     WHERE "tenantId" = ${tenantId}
       AND (hostname IS NOT NULL OR "operatingSystem" IS NOT NULL ...)
  `;

  // Step 3: Per-Asset migration (find/create CI, write extension, log conflicts)
  for (const asset of candidates) {
    await prisma.$transaction(async (tx) => {
      // ... per architecture diagram above
    });
  }

  return { ciUpserted: ..., softwareUpserted: ..., conflicts: ... };
}
```

### Example 2: Pre-flight DO block migration (Wave 5 destructive)
```sql
-- Source: packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:11-36 [VERIFIED]
-- Adapt for Phase 8 destructive column drop.

DO $$
DECLARE
  unmigrated_count INT;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
    FROM "assets" a
    LEFT JOIN "cmdb_configuration_items" ci ON ci."assetId" = a.id
    LEFT JOIN "cmdb_ci_servers" srv ON srv."ciId" = ci.id
   WHERE (a.hostname IS NOT NULL
          OR a."operatingSystem" IS NOT NULL
          OR a."cpuCores" IS NOT NULL
          OR a."ramGb" IS NOT NULL
          OR a."softwareInventory" IS NOT NULL)
     AND srv."ciId" IS NULL;
  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Phase 8 backfill incomplete: % Assets still have hardware data without a corresponding CmdbCiServer extension. Run packages/db/scripts/phase8-backfill.ts before applying this migration.',
                    unmigrated_count;
  END IF;
END $$;

ALTER TABLE "assets" DROP COLUMN "hostname",
                     DROP COLUMN "operatingSystem",
                     DROP COLUMN "osVersion",
                     DROP COLUMN "cpuModel",
                     DROP COLUMN "cpuCores",
                     DROP COLUMN "ramGb",
                     DROP COLUMN "disks",
                     DROP COLUMN "networkInterfaces",
                     DROP COLUMN "softwareInventory",
                     DROP COLUMN "lastInventoryAt";

-- Drop the now-stale index (assets had no `assets_tenantId_hostname_idx`, but
-- verify via \d assets — if any index references hostname, drop it explicitly).
```

### Example 3: ENFORCE-mode grep gate
```bash
#!/usr/bin/env bash
# Source: packages/db/scripts/phase7-grep-gate.sh [VERIFIED]
# Adapt for Phase 8 — pin specific Asset field names to prevent rename-around.

set -euo pipefail

ENFORCE="${PHASE8_GATE_ENFORCE:-1}"
FAIL=0

check() {
  local pattern="$1"
  local file="$2"
  if [ -f "$file" ] && grep -nE "$pattern" "$file" 2>/dev/null; then
    echo "x Dropped Asset field referenced in $file (pattern: $pattern)"
    FAIL=1
  fi
}

# Service layer
check "data\.(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/services/asset.service.ts
check "asset\.(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/services/asset.service.ts

# Routes
check "(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/routes/v1/assets/index.ts

# Worker (worker writes to CmdbCiServer, not Asset; flag any Asset writes)
check "prisma\.asset\.(create|update|upsert)[\s\S]*hostname" \
      apps/worker/src/workers/cmdb-reconciliation.ts

# Web app — Asset detail TypeScript interface should not list dropped fields
check "  (hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces):" \
      apps/web/src/app/dashboard/assets/\[id\]/page.tsx

if [ "$FAIL" -ne 0 ]; then
  if [ "$ENFORCE" = "1" ]; then
    echo "x Phase 8 grep gate FAILED — dropped Asset fields still referenced"
    exit 1
  fi
  echo "! Phase 8 grep gate WARN — dropped Asset fields still referenced (expected in Waves 0-4)"
  exit 0
fi
echo "ok Phase 8 grep gate PASSED"
```

### Example 4: Verification SQL (post-Wave-5)
```typescript
// New: packages/db/scripts/phase8-verify.ts (pattern from phase7-verify.ts)
// Per-tenant report of:
//  - Assets that should have a CmdbCiServer extension but don't (orphaned)
//  - cmdb_software_installed row counts per CI (sanity)
//  - cmdb_migration_audit row counts per tenant per status

const result = await prisma.$queryRaw<Array<{
  tenant_id: string;
  asset_count: bigint;
  ci_count: bigint;
  ext_count: bigint;
  software_row_count: bigint;
  audit_overwrites: bigint;
}>>`
  SELECT
    t.id as tenant_id,
    (SELECT COUNT(*) FROM assets a WHERE a."tenantId" = t.id) AS asset_count,
    (SELECT COUNT(*) FROM cmdb_configuration_items WHERE "tenantId" = t.id AND "assetId" IS NOT NULL) AS ci_count,
    (SELECT COUNT(*) FROM cmdb_ci_servers WHERE "tenantId" = t.id) AS ext_count,
    (SELECT COUNT(*) FROM cmdb_software_installed WHERE "tenantId" = t.id) AS software_row_count,
    (SELECT COUNT(*) FROM cmdb_migration_audit WHERE "tenantId" = t.id AND status = 'overwritten_by_ci' AND phase = 'phase8') AS audit_overwrites
   FROM tenants t
`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Asset.hostname / OS / CPU / RAM / disks / NICs / softwareInventory / lastInventoryAt as duplicate storage | CmdbCiServer + CmdbSoftwareInstalled as single source of truth, joined on Asset detail | Phase 8 (this) | 10 columns dropped; AI bot prompts updated |
| Asset.softwareInventory as opaque JSON blob | Normalized `cmdb_software_installed` rows, queryable for license reporting | Phase 8 (this) | New CRIT-5 use case enabled |
| Inventory ingestion writes to InventorySnapshot only; CI updates happen async via 15-min worker | Inventory ingestion synchronously calls `upsertServerExtensionByAsset` (sync write to CmdbCiServer + CmdbSoftwareInstalled); worker stays as backstop | Phase 8 (this) | Removes 0-15 min lag for new agent data |
| Asset detail page shows hostname/OS inline | Asset detail page has dedicated 'Technical Profile' tab joining linked CI | Phase 8 (this) | UI tab pattern matches CMDB CI detail page |
| Implicit `Asset → CI` link via `Asset.cmdbConfigItems` reverse relation | Same — `CmdbConfigurationItem.assetId` is the FK; `Asset.cmdbConfigItems` is the reverse relation. Phase 9 makes the FK behavior explicit (`onDelete: SetNull`). | Phase 9 (next) | No change in Phase 8 |
| No audit table for cross-model conflict logging | `cmdb_migration_audit` table introduced; reusable by Phases 9-14 | Phase 8 (this) | Forensic recovery for D-01 conflicts |

**Deprecated/outdated (after Phase 8):**
- `Asset.hostname` / `operatingSystem` / `osVersion` / `cpuModel` / `cpuCores` / `ramGb` / `disks` / `networkInterfaces` / `softwareInventory` / `lastInventoryAt` — DROPPED.
- `Asset.lastInventoryAt` operator-visible signal → operator now uses `CmdbCiServer.updatedAt` and `Agent.lastHeartbeatAt`.
- Asset detail page `hostname` field render at `assets/[id]/page.tsx:397, 605` — REMOVED in Wave 5.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `inferClassKeyFromSnapshot` heuristic at `apps/worker/src/workers/cmdb-reconciliation.ts:17-42` correctly classifies all expected Asset payloads to `'server'` (the default for hardware-bearing assets) | Pattern 4 | If a genuine network device or appliance gets classified as 'server', the auto-create CI is in the wrong CMDB class — operators would need to manually re-class. Low frequency, low impact. `[ASSUMED]` |
| A2 | The `softwareInventory` JSON blob on existing Assets is mostly an array `[{ name, version }]` (not an object wrapper) | Pitfall 8 | If shapes vary, backfill needs the defensive `parseSoftwareList` helper to handle multiple shapes. Already mitigated by Pitfall 8 + Pitfall 10. `[ASSUMED]` |
| A3 | All existing tenants have CMDB reference data seeded (per Phase 7's `seed-existing-tenants-cmdb-ref.ts` having been run successfully) | Pitfall 7 | If a tenant is missing reference data, agent heartbeats will fail with "missing reference data" 500s. Mitigated by Wave 0 sanity check that re-runs the seed script. `[ASSUMED]` |
| A4 | The agent ingestion endpoint (`apps/api/src/routes/v1/agents/index.ts:338-434`) does NOT currently write to `Asset` (verified via grep — no `prisma.asset.update` in that file), so Phase 8's "agent stops touching Asset" claim is already true today | CASR-06 + Pattern 1 | If any code path DOES write to Asset hardware fields from an agent context, Wave 3 grep gate catches it. `[VERIFIED: grep `prisma.asset` in `apps/api/src/routes/v1/agents/index.ts` returns no results]` |
| A5 | The Wave 1 additive migration's `ALTER TABLE cmdb_ci_servers ADD COLUMN cpuModel TEXT` is non-blocking on production tables (ALTER TABLE ADD COLUMN with NULL default is O(1) in Postgres 17) | Migration ordering | Postgres 11+ ALTER TABLE ADD COLUMN with no DEFAULT is metadata-only and instant. `[CITED: PostgreSQL 17 docs — ALTER TABLE ADD COLUMN]` |
| A6 | `cmdb_migration_audit` table doesn't need partitioning at v2.0 scale (estimated 30K rows per backfill across all tenants combined) | Pitfall 4 | If audit grows to millions of rows, add monthly partitioning later. Phase 8 just needs `@@index([tenantId, createdAt])` for retention. `[ASSUMED — based on dev tenant count + average Asset count]` |
| A7 | The Asset detail page at `apps/web/src/app/dashboard/assets/[id]/page.tsx` does NOT have an existing tab structure today (verified — no `activeTab` state in the file) | D-03 + Pattern 6 | Phase 8 adds the FIRST tab structure to that page. The pattern from `cmdb/[id]/page.tsx:548-557` is the project canonical. `[VERIFIED via grep]` |
| A8 | `Asset.cmdbConfigItems` returns at most 1 CI for hardware-class Assets in practice (the project doesn't have multi-CI-per-Asset for servers/endpoints today) | D-04 + Pattern 7 | If multi-CI Assets exist, the Technical Profile tab needs a CI selector, not just `cmdbConfigItems[0]`. Could escalate to a planner question. `[ASSUMED — based on agent enrollment giving 1 CI per agent per tenant]` |
| A9 | The `Asset.lastInventoryAt` field is unused by any UI today (no operator dashboard surfaces it) — operators rely on `Agent.lastHeartbeatAt` instead | Pitfall — anti-pattern 7 | If a dashboard or alert uses lastInventoryAt, the drop breaks it. Verify with operator. `[ASSUMED — searched assets/[id]/page.tsx for lastInventoryAt, no matches]` |
| A10 | The Wave 0 task for re-running `seed-existing-tenants-cmdb-ref.ts` is idempotent (Phase 7 verified upserts, not inserts) | Pitfall 7 | Already verified — the seed function uses `prisma.cmdbCiClass.upsert(...)`. Safe to re-run. `[VERIFIED via packages/db/prisma/seed.ts:357-466 read]` |
| A11 | `npm view prisma version` returned 7.7.0 on 2026-04-17 — the project pin `^7.5.0` accepts this. Will not auto-bump unless explicitly run. | Stack | None. `[VERIFIED 2026-04-17]` |

**Action for the discuss-phase or planner:** A1, A2, A3, A6, A8, A9 are the assumptions worth confirming with the user before plan-phase commits to a final task list.

---

## Open Questions (RESOLVED inline)

1. **Should `cmdb_migration_audit` be excluded from staff AI?** RESOLVED — yes, exclude. Add to `EXCLUDED_TABLES` in `ai-schema-context.ts`. Reason: forensic data, may contain sensitive overwritten values, not meant for ad-hoc staff queries.

2. **Should the synchronous `upsertServerExtensionByAsset` REPLACE the async `cmdb-reconciliation` worker writes, or COEXIST?** RESOLVED — coexist. Sync path is the new contract; worker is the every-15-min backstop for missed snapshots and stale-cleanup (lastSeenAt). Worker also handles CI updates triggered by manual operator import (CSV).

3. **Should `Asset.lastInventoryAt` be replaced by something operator-visible?** RESOLVED — yes, surface `CmdbCiServer.updatedAt` + `Agent.lastHeartbeatAt` in the new Technical Profile tab. No new column needed.

4. **License-reporting query — new endpoint or extend existing reports?** RESOLVED — new endpoint `GET /api/v1/reports/software-installed` (extends `report.service.ts`). ALSO add CI-scoped `GET /api/v1/cmdb/cis/:id/software` for the Technical Profile tab.

5. **Does the CI picker for D-04 already exist?** RESOLVED — partially. `apps/web/src/components/` has `VendorPicker.tsx` (similar pattern) but no `CIPicker.tsx`. New component needed; mirror the VendorPicker pattern.

6. **How is software dedup'd when the agent reports the same software twice (e.g., 32-bit + 64-bit Office)?** RESOLVED — D-06's `(ciId, name, version)` unique constraint treats them as one row IF name+version match. If 32-bit Office is `name='Microsoft Office'` and 64-bit is `name='Microsoft Office (64-bit)'`, they're separate rows. Acceptable; vendor publishers control the name.

7. **Should the orphan-Asset auto-create (D-08) write a `CmdbChangeRecord` audit entry?** RESOLVED — yes, mirror `cmdb-reconciliation.ts:335-343`. Use `changedBy: 'AGENT'` and `changeType: 'CREATED'` for the auto-create, and a separate row with `changeType: 'UPDATED'`, `fieldName: 'assetId'`, `changedBy: 'AGENT'` for the link.

8. **Is `apps/owner/src/lib/provisioning.ts` affected?** RESOLVED — no. Phase 7's signup hook already seeds CMDB reference data on tenant create; Phase 8 doesn't add new tenant-provisioning concerns.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | All schema work | ✓ | 17 (per Phase 7 stack lock) | — |
| Redis | BullMQ for `cmdb-reconciliation` worker | ✓ | 7 | — |
| pnpm | Workspace install | ✓ | 9 | — |
| Node.js | Backfill scripts | ✓ | (matches pnpm requirement) | — |
| `prisma` CLI | Migration generation | ✓ | 7.7.0 | — |
| `tsx` | Running backfill scripts | ✓ | 4.19.x (per `packages/db/package.json:38`) | — |

**Missing dependencies:** None.

---

## Validation Architecture

> Phase 8 follows Phase 7's Nyquist-validation harness shape. `nyquist_validation` is enabled by project default (no `false` in `.planning/config.json`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (apps/api unit + integration), Playwright (apps/web E2E) |
| Config file | `apps/api/vitest.config.ts` (existing), `packages/db/vitest.config.ts` (existing for backfill tests), `apps/web/playwright.config.ts` (existing) |
| Quick run command | `pnpm --filter @meridian/api vitest run src/__tests__/cmdb-extension.test.ts src/__tests__/asset-service.test.ts src/__tests__/ai-schema-context.test.ts src/__tests__/portal-context.test.ts` |
| Full suite command | `pnpm --filter @meridian/api vitest run && pnpm --filter @meridian/db vitest run && pnpm --filter web playwright test --grep "asset|cmdb|software"` |
| Phase 8 backfill command | `pnpm tsx packages/db/scripts/phase8-backfill.ts` (Wave 0) |
| Phase 8 verification command | `pnpm tsx packages/db/scripts/phase8-verify.ts` (Wave 0) |
| Phase 8 grep gate | `bash packages/db/scripts/phase8-grep-gate.sh` (Wave 0; ENFORCE mode after Wave 3) |
| Estimated runtime | Quick: ~15s. Full: ~120s. Backfill: per-tenant, ~10s/tenant on dev. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CASR-01 | Asset schema no longer carries the 10 hardware fields after migration | DB introspection | `pnpm tsx packages/db/scripts/phase8-verify.ts` (asserts via `\d assets`) | ❌ Wave 0 |
| CASR-01 | Prisma client refuses to write Asset.hostname after Wave 5 | Unit (Vitest, expect throw) | `pnpm --filter @meridian/api vitest run -t "createAsset rejects hostname field"` | ❌ Wave 0 |
| CASR-02 | CmdbCiServer has cpuModel + disksJson + networkInterfacesJson fields | DB introspection + Prisma type | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ Wave 0 |
| CASR-03 | CmdbSoftwareInstalled table exists with correct columns and unique constraint | DB introspection | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ Wave 0 |
| CASR-03 | License reporting query returns expected rows for a CI with 3 software items | Integration (real PG) | `pnpm --filter @meridian/api vitest run -t "getSoftwareInventoryReport returns CIs with software"` | ❌ Wave 0 |
| CASR-04 | Backfill upserts CmdbCiServer for every Asset with hardware data; logs conflicts to cmdb_migration_audit | Integration (Vitest with seeded test data) | `pnpm --filter @meridian/db vitest run -t "phase8-backfill upserts CmdbCiServer and logs CI-wins conflicts"` | ❌ Wave 0 |
| CASR-04 | Per-tenant migration produces zero unresolved conflicts after CI-wins resolution | DB integration | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ Wave 0 |
| CASR-05 | Asset detail page renders Technical Profile tab; shows linked CI hardware | E2E (Playwright) | `pnpm --filter web playwright test tests/asset-technical-profile.spec.ts` | ❌ Wave 0 |
| CASR-05 | Orphan Asset (no linked CI) shows "Link a CI" empty state | E2E (Playwright) | `pnpm --filter web playwright test tests/asset-link-ci.spec.ts` | ❌ Wave 0 |
| CASR-05 | Asset edit page no longer accepts hostname/OS/CPU/RAM input fields | E2E (Playwright, negative assertion) | `pnpm --filter web playwright test tests/asset-edit-no-tech-fields.spec.ts` | ❌ Wave 0 |
| CASR-06 | upsertServerExtensionByAsset writes hardware to CmdbCiServer; never touches Asset | Unit (Vitest mocked Prisma) | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset writes only to CmdbCiServer"` | ❌ Wave 0 |
| CASR-06 | upsertServerExtensionByAsset auto-creates CI for orphan Asset (D-08) | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset auto-creates CI for orphan"` | ❌ Wave 0 |
| CASR-06 | Inventory ingestion endpoint POST results in CmdbCiServer write + Asset row UNCHANGED | Integration (Vitest with real PG, AgentKey) | `pnpm --filter @meridian/api vitest run -t "POST /agents/inventory writes to CmdbCiServer not Asset"` | ❌ Wave 0 |
| CASR-06 | upsertServerExtensionByAsset writes per-software rows to CmdbSoftwareInstalled with `(ciId, name, version)` upsert + lastSeenAt | Integration (Vitest) | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset upserts CmdbSoftwareInstalled"` | ❌ Wave 0 |
| CAI-01 | ai-schema-context.ts removes 10 Asset hardware fields and adds cmdb_software_installed block | Static (Vitest content match) | `pnpm --filter @meridian/api vitest run -t "ai-schema-context: assets has no hostname/operatingSystem; cmdb_software_installed exists"` | ❌ Wave 0 (existing file from Phase 7 — extend) |
| CAI-01 | ai-schema-context.ts adds cmdb_migration_audit to EXCLUDED_TABLES | Static (Vitest content match) | `pnpm --filter @meridian/api vitest run -t "ai-schema-context excludes cmdb_migration_audit"` | ❌ Wave 0 |
| CAI-02 | portal-schema-context.ts comment block extended with Phase 8 audit subsection | Static (Vitest content match) | `pnpm --filter @meridian/api vitest run -t "portal-schema-context Phase 8 exclusion comment present"` | ❌ Wave 0 |
| CAI-03 | portal-ai-sql-executor.ts rejects SELECT on cmdb_software_installed | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "executePortalQuery rejects cmdb_software_installed"` | ❌ Wave 0 (existing test file — extend) |
| CAI-03 | portal-ai-sql-executor.ts rejects SELECT on cmdb_migration_audit | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "executePortalQuery rejects cmdb_migration_audit"` | ❌ Wave 0 |
| CSDM Field Ownership Rule 1 | No Asset write path writes any of the 10 dropped fields | Static (grep) | `bash packages/db/scripts/phase8-grep-gate.sh` | ❌ Wave 0 |
| Multi-tenancy | upsertServerExtensionByAsset filters by tenantId in every Prisma call | Static (code review) + Unit | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset rejects cross-tenant Asset"` | ❌ Wave 0 |
| Multi-tenancy | License reporting query of tenant A returns 0 rows from tenant B | Integration (Vitest two-tenant fixture) | `pnpm --filter @meridian/api vitest run -t "getSoftwareInventoryReport excludes other tenants"` | ❌ Wave 0 |
| D-01 conflict logging | Per-Asset backfill writes one row per conflicting field to cmdb_migration_audit | Unit (Vitest, mocked tx) | `pnpm --filter @meridian/db vitest run -t "phase8-backfill logs conflict per field"` | ❌ Wave 0 |
| D-08 orphan auto-create | Inventory POST for Asset with no linked CI auto-creates the CI | Integration (Vitest) | `pnpm --filter @meridian/api vitest run -t "POST /agents/inventory auto-creates CI for orphan Asset"` | ❌ Wave 0 |
| Pitfall 7 — missing reference data | upsertServerExtensionByAsset throws structured error if `resolveClassId` returns null | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset throws on missing reference data"` | ❌ Wave 0 |

### Sampling Rate
- **After every task commit:** Run quick command (Vitest on the just-modified service test file)
- **After every plan wave:** Run `pnpm --filter @meridian/api vitest run && pnpm --filter @meridian/db vitest run && pnpm tsx packages/db/scripts/phase8-verify.ts && bash packages/db/scripts/phase8-grep-gate.sh`
- **Before `/gsd-verify-work`:** Full suite green + `phase8-verify.ts` reports "all tenants compliant" + `phase8-grep-gate.sh` exits 0 + Playwright `--grep "asset|cmdb|software"` green + manual smoke (POST a fake inventory snapshot to a dev tenant, observe a new `CmdbCiServer` row + `CmdbSoftwareInstalled` rows, observe Asset row hardware fields are NULL/dropped)
- **Max feedback latency:** ~15 seconds (quick run)

### Wave 0 Gaps
- [ ] `packages/db/scripts/phase8-verify.ts` — DB introspection: dropped columns gone, new tables exist, per-tenant null-FK report
- [ ] `packages/db/scripts/phase8-backfill.ts` — per-tenant Asset → CmdbCiServer + CmdbSoftwareInstalled backfill with CI-wins conflict logging
- [ ] `packages/db/scripts/phase8-grep-gate.sh` — bash script: zero references to dropped Asset fields in API/Web/Worker
- [ ] `apps/api/src/__tests__/cmdb-extension.test.ts` — NEW: upsertServerExtensionByAsset tests
- [ ] `apps/api/src/__tests__/asset-service.test.ts` — MODIFY (existing): remove tests for dropped fields; add negative assertions
- [ ] `apps/api/src/__tests__/ai-schema-context.test.ts` — MODIFY (existing from Phase 7): extend with Phase 8 assertions
- [ ] `apps/api/src/__tests__/portal-context.test.ts` — MODIFY (existing from Phase 7): extend with cmdb_software_installed + cmdb_migration_audit rejection tests
- [ ] `apps/api/src/__tests__/inventory-ingestion.test.ts` — NEW: integration test for POST /agents/inventory rerouting writes
- [ ] `apps/web/tests/asset-technical-profile.spec.ts` — NEW: Playwright Technical Profile tab on linked Asset
- [ ] `apps/web/tests/asset-link-ci.spec.ts` — NEW: Playwright orphan empty state + Link-a-CI flow
- [ ] `apps/web/tests/asset-edit-no-tech-fields.spec.ts` — NEW: Playwright negative — Asset edit form has no hostname/OS/CPU input
- [ ] `apps/web/src/components/cmdb/CIPicker.tsx` — NEW: search-by-name CI picker for Link-a-CI flow
- [ ] `packages/db/src/seeds/cmdb-reference.ts` — VERIFY (Wave 0 sanity): re-run `seed-existing-tenants-cmdb-ref.ts` to catch tenants added between Phase 7 ship and Phase 8 start

---

## Security Domain

> `security_enforcement` is enabled by project default (no `false` in `.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NextAuth.js v5 (existing); AgentKey for inventory POST (existing). No change in Phase 8. |
| V3 Session Management | yes | JWT in cookies (existing). No change. |
| V4 Access Control | yes | Tenant-scoped queries (CLAUDE.md Rule 1). New `cmdb_software_installed` and `cmdb_migration_audit` MUST filter by tenantId. New endpoints `/api/v1/reports/software-installed` and `/api/v1/cmdb/cis/:id/software` use `requirePermission('reports.read')` and `requirePermission('cmdb.view')` respectively. |
| V5 Input Validation | yes | Zod 4.x for new endpoints. The inventory POST currently uses ad-hoc extractors (`apps/api/src/routes/v1/agents/index.ts:342`); add Zod schema for the snapshot body in Phase 8 alongside `upsertServerExtensionByAsset` integration. |
| V6 Cryptography | partial | `licenseKey` field on `cmdb_software_installed` is sensitive; should be encrypted at rest if it ever holds real product keys. Phase 8 stores plaintext for now (matches existing project pattern for non-secret fields); flag as TODO for a future security pass. |

### Known Threat Patterns for Phase 8 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak via missing `tenantId` filter on new tables | Information Disclosure | Multi-tenancy invariant (CLAUDE.md Rule 1); `phase8-verify.ts` includes a query that tries cross-tenant SELECT and asserts zero rows; Vitest test in two-tenant fixture |
| Portal AI sneaks queries against `cmdb_software_installed` (sensitive software inventory exposed to end users) | Information Disclosure | Defense-in-depth: portal-schema-context excludes; portal-ai-sql-executor `/\bcmdb_/i` regex hard-rejects; new Vitest test asserts rejection |
| Audit table grows unbounded, becomes hot spot | DoS / availability | `@@index([tenantId, createdAt])` for retention queries; operator-runnable cleanup query for rows older than 90 days; documented in operator runbook |
| `licenseKey` field accidentally returned via list endpoint | Information Disclosure | `getSoftwareInventoryReport` `select` clause excludes `licenseKey` by default; only `/api/v1/cmdb/cis/:id/software` returns it (and only with `cmdb.view` permission) |
| Snapshot replay (agent submits a snapshot for another tenant's asset by guessing the assetId) | Tampering / Spoofing | `upsertServerExtensionByAsset` looks up Asset by `(id, tenantId)` where `tenantId = agent.tenantId`; cross-tenant Asset lookup returns null and the function throws |
| Orphan-Asset auto-create runs unbounded if the agent fleet is hostile | Availability | The auto-create path is gated by AgentKey auth (existing); a hostile agent could create CIs but only within its own tenant. Long-term mitigation: rate limit per-AgentKey CI creation (out of scope for Phase 8). |
| Backfill script accidentally run twice creates duplicate CmdbCiServer rows | Tampering | Backfill uses `upsert` keyed on `ciId` (PK); idempotent. Verified by Vitest. |

---

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `packages/db/prisma/schema.prisma` lines 1695-1736 (Asset), 2191-2321 (CmdbConfigurationItem), 2426-2450 (CmdbCiServer), 1944-2018 (InventorySnapshot)
- `apps/api/src/services/asset.service.ts` (full file, 330 lines)
- `apps/api/src/services/ai-schema-context.ts` lines 85-200
- `apps/api/src/services/portal-schema-context.ts` (full file, 77 lines)
- `apps/api/src/services/portal-ai-sql-executor.ts` lines 78-87 (regex hard-reject)
- `apps/api/src/services/cmdb-reference-resolver.service.ts` (full file, 117 lines)
- `apps/api/src/routes/v1/agents/index.ts` lines 1-455 (full file)
- `apps/api/src/routes/v1/assets/index.ts` lines 1-100, 188-196
- `apps/worker/src/workers/cmdb-reconciliation.ts` lines 1-462
- `apps/web/src/app/dashboard/assets/[id]/page.tsx` lines 1-120, 397-470, 605-679
- `apps/web/src/app/dashboard/cmdb/[id]/page.tsx` lines 540-810 (tab pattern)
- `packages/db/scripts/phase7-backfill.ts` (full file, 381 lines) — pattern to copy
- `packages/db/scripts/phase7-verify.ts` (full file, 100 lines) — pattern to copy
- `packages/db/scripts/phase7-grep-gate.sh` (full file, 78 lines) — pattern to copy
- `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql` (full file, 110 lines) — pre-flight DO block pattern
- `.planning/phases/07-ci-reference-table-migration/07-RESEARCH.md` (full file)
- `.planning/phases/07-ci-reference-table-migration/07-VALIDATION.md` (full file)
- `docs/architecture/csdm-field-ownership.md` (full file, 69 lines)
- `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md` (full file, 356 lines)
- `.planning/phases/08-retire-asset-hardware-os-duplication/08-CONTEXT.md` (full file, 156 lines)
- `CLAUDE.md` (full file, project rules)

### Verified
- `npm view prisma version` → 7.7.0 [VERIFIED 2026-04-17]
- `npm view @prisma/client version` → 7.7.0 [VERIFIED 2026-04-17]
- `npm view zod version` → 4.3.6 [VERIFIED 2026-04-17]
- `npm view vitest version` → 4.1.4 [VERIFIED 2026-04-17]

### Secondary (CITED — official documentation)
- PostgreSQL 17 docs — `ALTER TABLE ADD COLUMN` is metadata-only since PG 11; `DROP COLUMN` rewrites the column descriptor (cheap on small tables, requires `VACUUM FULL` for space reclamation on large tables; for v2.0 scale this is a non-issue)
- Prisma 7 docs — `$queryRaw` bypasses regenerated-client null-filter rejection (Phase 7 lessons learned)

### Tertiary (none)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already in use; versions verified against npm registry on 2026-04-17
- Architecture: HIGH — Phase 7 patterns are established and directly applicable; tab pattern, resolver, backfill loop, pre-flight DO block all have working precedents
- Codebase investigation: HIGH — every file path, line number, and field name verified by direct read on 2026-04-17
- Pitfalls: HIGH — Phase 7 retro pitfalls + Phase 8-specific concerns identified (10 pitfalls catalogued; Pitfalls 1, 5, 6, 9 are mechanical, Pitfalls 2, 3, 4, 7, 8, 10 are domain-specific)
- Validation: HIGH — Wave 0 harness fully spec'd; sampling rate matches Phase 7
- Security: MEDIUM — Phase 8 doesn't introduce new auth/authz concerns; the `licenseKey` plaintext storage is flagged for a future security pass

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days; stack is stable, no fast-moving libraries in critical path)

---

## RESEARCH COMPLETE

**Phase:** 8 - Retire Asset Hardware/OS Duplication
**Confidence:** HIGH

### Key Findings

- **Phase 7's full toolkit is reusable for Phase 8** — `cmdb-reference-resolver.service.ts`, `phase7-backfill.ts`, `phase7-verify.ts`, `phase7-grep-gate.sh`, the pre-flight DO block migration pattern, and the `$queryRaw` chicken-and-egg workaround all apply directly. Phase 8's planner work is mostly **wiring** existing helpers into new code paths, not inventing new infrastructure.
- **`upsertServerExtensionByAsset` is the keystone function** for D-07. It lives in `apps/api/src/services/cmdb.service.ts` (or new `cmdb-extension.service.ts`), is called from `apps/api/src/routes/v1/agents/index.ts:338-434` after `inventorySnapshot.create`, performs orphan-Asset CI auto-create per D-08, writes to `CmdbCiServer` (with new `cpuModel`/`disksJson`/`networkInterfacesJson`), and upserts `CmdbSoftwareInstalled` rows per D-05/D-06. Asset is NEVER touched.
- **Two new Prisma models** added in Wave 1 additive migration: `CmdbSoftwareInstalled` (D-05 schema, D-06 unique on `(ciId, name, version)`) and `CmdbMigrationAudit` (Phase 8 creates; Phases 9-14 reuse for their own conflict logging). `CmdbCiServer` gets 3 new columns: `cpuModel`, `disksJson`, `networkInterfacesJson`.
- **The Asset model already has the 10 doomed columns** (verified `schema.prisma:1708-1717`); 25 files in `apps/api` reference at least one of them; the Wave 5 destructive migration drops them all in a single `ALTER TABLE assets DROP COLUMN ...` after a pre-flight DO block confirms backfill completion.
- **The Asset detail page has NO existing tab structure today** — Phase 8 introduces the FIRST tab pattern to that page (D-03). The canonical pattern is at `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557, 784-810`. New `CIPicker.tsx` component needed for D-04 Link-a-CI button (mirror existing `VendorPicker.tsx`).
- **All 10 dropped fields verified UNUSED by external state** — no Cloudflare Tunnel routes, OS-registered tasks, env vars, or build artifacts depend on them. Cross-app TypeScript breakage after `prisma generate` is the only canary; the grep gate catches it before deploy.

### File Created
`C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\.planning\phases\08-retire-asset-hardware-os-duplication\08-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Verified via `npm view` on 2026-04-17; all libraries already in use |
| Architecture | HIGH | Phase 7 patterns directly applicable; codebase verified by direct read |
| Pitfalls | HIGH | 10 pitfalls catalogued with verified line-number sources; Phase 7 retro pitfalls + Phase 8-specific concerns |
| Validation | HIGH | Wave 0 harness fully spec'd; sampling rate + test coverage map matches Phase 7 |
| Security | MEDIUM | No new auth/authz concerns in Phase 8; `licenseKey` plaintext flagged for future hardening |

### Open Questions
All 8 inline questions RESOLVED in `## Open Questions (RESOLVED inline)`. Assumptions A1-A11 logged in `## Assumptions Log` for planner/discuss-phase confirmation; A1, A2, A3, A6, A8, A9 are the 6 worth confirming with the user before plan-phase.

### Ready for Planning
Research complete. Recommended Wave structure (mirroring Phase 7's six-wave shape):
- **Wave 0**: Verification harness (`phase8-{verify,backfill,grep-gate}`, test scaffolds, Wave 0 sanity re-seed)
- **Wave 1**: ADDITIVE migration (new tables: `CmdbSoftwareInstalled`, `CmdbMigrationAudit`; new columns: `cpuModel`, `disksJson`, `networkInterfacesJson` on `CmdbCiServer`); reusable helpers (`upsertServerExtensionByAsset`, `parseSoftwareList`)
- **Wave 2**: Per-tenant Asset → CmdbCiServer + CmdbSoftwareInstalled backfill with D-01 CI-wins conflict logging
- **Wave 3**: Strip Asset write paths (`asset.service.ts`, `assets/index.ts`); reroute inventory endpoint to call `upsertServerExtensionByAsset`; ENFORCE-mode grep gate
- **Wave 4**: AI context updates (CAI-01/02/03) + `cmdb_migration_audit` to EXCLUDED_TABLES + license reporting endpoint
- **Wave 5**: Asset Technical Profile tab UI (D-03/D-04); CIPicker component; DESTRUCTIVE Asset column drop migration (with pre-flight DO gate); final verification gate
