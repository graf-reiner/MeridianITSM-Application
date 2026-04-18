# Phase 8: Retire Asset Hardware/OS Duplication - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Hardware, OS, and installed-software data lives on the CI side (`CmdbCiServer` + new `CmdbSoftwareInstalled`) and is removed from `Asset`. The agent ingestion pipeline is rerouted so CMDB becomes the single source of truth for the technical profile. Asset becomes a financial/ownership shell with read-only visibility into the linked CI's technical data.

**In scope (per ROADMAP success criteria + REQ CASR-01..06 + cross-cutting CAI-01..03):**
- Drop 10 columns from `Asset`: `hostname`, `operatingSystem`, `osVersion`, `cpuModel`, `cpuCores`, `ramGb`, `disks`, `networkInterfaces`, `softwareInventory`, `lastInventoryAt`
- Extend `CmdbCiServer` to carry canonical hardware fields (rename `cpuCores` → `cpuCount`)
- New normalized table `CmdbSoftwareInstalled` (replaces the JSON blob `Asset.softwareInventory`)
- Per-tenant data migration (`Asset` → `CmdbCiServer` + `CmdbSoftwareInstalled`); audit table `cmdb_migration_audit` for conflicts
- New service function `upsertServerExtensionByAsset(assetId, snapshot)` for the agent ingestion path
- Asset detail UI: read-only "Technical Profile" tab (joins through linked CI)
- AI context: extend `ai-schema-context.ts`, `portal-schema-context.ts`, `portal-ai-sql-executor.ts` for new tables

**Out of scope (deferred to later phases):**
- Asset ↔ CI identity dedup (CAID-01..04 → Phase 9)
- CI numbering & retention rules (CCRT → Phase 10)
- Service tier (Phase 11), Application tier (Phase 12), tagging (Phase 13), final cleanup (Phase 14)

</domain>

<decisions>
## Implementation Decisions

### Migration Conflict Policy & Legacy Column Lifecycle
- **D-01:** When an Asset has data and the CI's `CmdbCiServer` extension already has DIFFERENT data, **CI wins silently** and the Asset value is logged to `cmdb_migration_audit` with status `'overwritten_by_ci'`. Maximum throughput, no human gate during migration. Operator can review post-migration via the audit table.
- **D-02:** The 10 Asset columns are **DROPPED in the Phase 8 migration itself** (clean cut, not renamed to `_legacy`). Schema is the cleanest possible state at end of Phase 8. Rollback requires a new migration if needed; the audit table preserves overwritten values for forensic recovery.

### Asset Detail Page Technical Profile UX
- **D-03:** The read-only Technical Profile renders as a **new dedicated tab** on the Asset detail page, positioned next to the existing Overview / Activity tabs. Tab pattern matches the project's existing dashboard convention.
- **D-04:** When an Asset has **no linked CI** (orphan), the Technical Profile tab shows an **empty state with a 'Link a CI' button** that opens a CI picker. This actively surfaces the gap and lets the operator link an existing CI or trigger creation. Phase 9 will add nightly reconciliation; Phase 8 just needs a degraded-state UI that nudges hygiene.

### CmdbSoftwareInstalled Schema (CASR-03)
- **D-05:** Columns beyond `ciId` + `name` + `version`: `vendor`, `publisher`, `installDate`, `source` (enum: `'agent' | 'manual' | 'import'`), `licenseKey` (nullable), `lastSeenAt`. Full schema enables both software-presence reporting AND license-key tracking.
- **D-06:** Unique constraint on `(ciId, name, version)`. Each agent inventory cycle does an UPSERT keyed on this triple, updating `lastSeenAt`. Version change creates a new row (preserves version history per CI). Stale rows (no recent `lastSeenAt`) are cleaned by the existing CMDB reconciliation worker.

### Inventory-Agent Ingestion Contract (CASR-06)
- **D-07:** **No agent code changes.** The existing .NET agent endpoint `POST /api/v1/agents/inventory` continues to accept Asset-shaped payloads. The new server-side function `upsertServerExtensionByAsset(assetId, snapshot)` performs the translation: looks up `Asset` → finds `assetId` → resolves linked `ciId` → writes hardware fields to `CmdbCiServer` + writes per-software rows to `CmdbSoftwareInstalled`. The Asset row is NEVER touched by the inventory write path. Zero agent fleet redeploy required.
- **D-08:** When an inventory snapshot arrives for an Asset with **no linked CI** (orphan Asset), `upsertServerExtensionByAsset` **auto-creates a CI on-the-fly** using `resolveClassId(tenantId, inferredClassKey)` (e.g., `'server'` or inferred from snapshot signals like presence of GUI/desktop), auto-links `Asset.ciId`, then proceeds with the extension write. Agents 'just work' — operators don't need to pre-provision CIs. This is consistent with the existing CMDB reconciliation worker's create-on-first-heartbeat behavior.

### Claude's Discretion
- **License reporting query SQL shape**: criterion 5 says "list software-by-CI via `CmdbSoftwareInstalled` joins" — the exact query / report endpoint structure is a planner-level decision.
- **Migration ordering** within the Phase 8 migration file (DDL → backfill → DROP COLUMN ordering) — planner decides per Prisma + Postgres safe-migration practices, mirroring the Phase 7 pre-flight DO block pattern.
- **Inferred class for orphan-Asset auto-create (D-08)** — the heuristic for picking which `classKey` (server vs endpoint vs network_device) when creating a CI from a snapshot; planner can reuse `inferClassKeyFromSnapshot` from `apps/worker/src/workers/cmdb-reconciliation.ts:205` (already exists, just call it).
- **Audit table schema** (`cmdb_migration_audit`) — planner picks columns; minimum: `tenantId`, `tableName`, `recordId`, `fieldName`, `oldValue`, `newValue`, `status`, `createdAt`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CSDM Architecture & Field Ownership
- `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md` — CSDM master plan (Phase 8 details, dependencies, rationale)
- `docs/architecture/csdm-field-ownership.md` — Phase 0 contract: who owns each field across Asset / CI / Application / CmdbService. Phase 8 implements the Asset-side retreat per this contract.

### Phase 7 (just shipped — patterns to reuse)
- `.planning/phases/07-ci-reference-table-migration/07-RESEARCH.md` — pitfalls + Validation Architecture pattern (Pre-flight DO blocks, per-tenant loops, audit table conventions)
- `.planning/phases/07-ci-reference-table-migration/07-VALIDATION.md` — Wave 0 test/script harness convention (`packages/db/scripts/phase{N}-{verify,backfill,grep-gate}.{ts,sh}` naming)
- `apps/api/src/services/cmdb-reference-resolver.service.ts` — tenant-scoped `${tenantId}:` cache resolvers (Phase 8 reuses `resolveClassId` for D-08 orphan-create)
- `packages/db/scripts/phase7-grep-gate.sh` — ENFORCE-mode grep gate pattern (Phase 8 needs its own grep gate to confirm no app code reads the dropped Asset columns)
- `apps/worker/src/workers/cmdb-reconciliation.ts:205` — `inferClassKeyFromSnapshot` heuristic (reuse for D-08)

### AI Cross-Cutting (CAI-01/02/03)
- `apps/api/src/services/ai-schema-context.ts` — must add `cmdb_software_installed` table block + update `cmdb_configuration_items` block (drop hostname/osVersion/etc. mentions, redirect to JOIN)
- `apps/api/src/services/portal-schema-context.ts` — extend exclusion comment to cover `cmdb_software_installed` (per CAI-02, portal AI stays CMDB-free)
- `apps/api/src/services/portal-ai-sql-executor.ts` — verify the `/\bcmdb_/i` hard-reject (Phase 7) covers `cmdb_software_installed` automatically; add unit test

### Project Rules
- `CLAUDE.md` — Multi-tenancy MANDATORY (every query filters by `tenantId`); AI Assistant Data Availability rule 6 (schema changes update `ai-schema-context.ts`); CSDM Field Ownership rule 7 (no field duplication across models)

### Reference Implementations
- `apps/api/src/services/cmdb.service.ts` — established service-layer pattern for CI writes (Phase 7 made this FK-only, Phase 8 extends with extension writes)
- `apps/api/src/routes/v1/cmdb/index.ts` — Zod `.strict()` route validation pattern (Phase 7 introduced this)
- Existing CmdbCiServer schema in `packages/db/prisma/schema.prisma` — Phase 8 extends this with the new hardware columns + rename

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Reference resolver service** (`apps/api/src/services/cmdb-reference-resolver.service.ts`) — Phase 7's tenant-scoped resolver. `resolveClassId(tenantId, classKey)` is the gateway for D-08 orphan-create.
- **`inferClassKeyFromSnapshot`** (`apps/worker/src/workers/cmdb-reconciliation.ts:205`) — already classifies snapshots into `'server' | 'endpoint' | 'network_device'`. Wrap and call from `upsertServerExtensionByAsset`.
- **`cmdb-migration.ts` + `phase7-backfill.ts`** in `packages/db/scripts/` — established per-tenant loop pattern with `PrismaPg + pg.Pool` adapter. Phase 8's backfill follows the same shape.
- **Audit-table writes** — Phase 7's pre-flight DO blocks `RAISE EXCEPTION` on data integrity violations. Phase 8 audit table writes WARN-level entries, doesn't block migration (per D-01).

### Established Patterns
- **Multi-tenancy invariant** — every `prisma.cmdb*` query in services + workers filters by `tenantId`. Phase 8 service `upsertServerExtensionByAsset` must look up Asset by `(id, tenantId)`.
- **Worker uses inline OPTION B duplication** — `apps/worker/src/workers/cmdb-reconciliation.ts` does NOT import from `@meridian/api`. If Phase 8 needs a new resolver in the worker, duplicate inline with the project-standard `// Duplicated from apps/api/...` header comment.
- **Migration naming** — `prisma/migrations/{timestamp}_phase{N}_{description}/migration.sql`. Phase 8 follows: `*_phase8_retire_asset_technical_columns/`.
- **Grep gates** — `packages/db/scripts/phase{N}-grep-gate.sh` enforces zero references to retired patterns. Phase 8 grep gate watches for any code reading the 10 dropped Asset columns.
- **Test scaffolds → real tests** — Phase 7 pattern: Wave 0 creates `it.todo()` scaffolds, later waves promote to real passing tests. Phase 8 should follow.

### Integration Points
- **Asset detail page** — `apps/web/src/app/dashboard/assets/[id]/page.tsx` (or similar route under dashboard/assets). Existing tab structure to add 'Technical Profile' to.
- **CI picker** — needed for the 'Link a CI' button (D-04). Check if a TanStack Query CI picker exists in `apps/web/src/components/cmdb/`; if not, build one as part of this phase.
- **Inventory ingestion endpoint** — likely `apps/api/src/routes/v1/agents/inventory.ts` or similar. Verify exact path during research.
- **License reporting** — likely a new route under `apps/api/src/routes/v1/reports/` or extends an existing reports module.

</code_context>

<specifics>
## Specific Ideas

- **Audit table name:** `cmdb_migration_audit` (per ROADMAP success criterion 2). Phase 8 creates it; future phases (9-14) reuse it for their own conflict logging. One global table, tenant-scoped via `tenantId` column.
- **License reporting query example** (from criterion 5):
  ```sql
  SELECT
    c.name AS ci_name,
    s.name AS software,
    s.version,
    s.vendor,
    s."licenseKey"
  FROM cmdb_software_installed s
  JOIN cmdb_configuration_items c ON s."ciId" = c.id
  WHERE c."tenantId" = $1
    AND s.name = 'Microsoft Office'
  ORDER BY c.name;
  ```
- **Server-side translation function signature** (D-07):
  ```typescript
  async function upsertServerExtensionByAsset(
    tx: PrismaTransactionClient,
    tenantId: string,
    assetId: string,
    snapshot: AgentInventorySnapshot,
  ): Promise<{ ciId: string; created: boolean }>;
  ```
- **Empty-state copy for orphan Technical Profile tab** (D-04): "This Asset isn't linked to a Configuration Item. Hardware, OS, and software details live on CIs in CMDB. **Link a CI** to see the technical profile here, or **Create a new CI** if none exists."

</specifics>

<deferred>
## Deferred Ideas

- **Per-field conflict policy** (e.g., Asset wins for osVersion, CI wins for cpuCount) — rejected in favor of D-01 (CI wins all). Could revisit if operators report frustration with the audit log volume.
- **License-management UI** — beyond reporting query, no dedicated license dashboard in Phase 8. Future ITAM phase or v2.x backlog.
- **Bulk Asset → CI link wizard** — Phase 9 (CAID-03 reconciliation) handles this. Phase 8 just adds the per-Asset 'Link a CI' button (D-04).
- **Software publisher normalization** (canonical vendor names like 'Microsoft' vs 'Microsoft Corporation') — left as-is for Phase 8; could add a normalization pass in a future cleanup phase.
- **Soft-delete / archive of dropped Asset columns** — D-02 chose clean drop. If rollback ever needed, restore via the `cmdb_migration_audit` table.
- **Agent endpoint versioning / Deprecation header** — D-07 chose no agent change. If a future agent rewrite happens (e.g., for Linux/Mac parity), can introduce `/api/v2/agents/cmdb-inventory` then.

</deferred>

---

*Phase: 08-retire-asset-hardware-os-duplication*
*Context gathered: 2026-04-17*
