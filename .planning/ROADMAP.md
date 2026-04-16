# Roadmap: MeridianITSM

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-04-16, tag `v1.0`) — see [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md)
- 🚧 **v2.0 CSDM Alignment** (active) — Phases 7–14. Migrate Asset / CMDB / Application to full CSDM compliance with zero field duplication, introduce the Service tier above Application, enforce the relationship verb catalog, and expose every schema change to staff + portal AI bots under RBAC. Scope grounded in the Field Ownership Contract at `docs/architecture/csdm-field-ownership.md` (Phase 0 shipped 2026-04-16) and the master plan at `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md`.

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Foundation (7/7 plans) — completed 2026-03-20
- [x] Phase 2: Billing and Owner Admin (6/6 plans) — completed 2026-03-20
- [x] Phase 3: Core ITSM (12/12 plans) — completed 2026-03-21
- [x] Phase 4: CMDB, Change Management, and Asset Portfolio (8/8 plans) — completed 2026-03-22
- [x] Phase 5: Agent, Mobile, and Integrations (9/9 plans) — completed 2026-03-23
- [x] Phase 6: v1.0 Paperwork Cleanup (1/1 plan) — completed 2026-04-16

Full details: [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v2.0 CSDM Alignment (active)

- [ ] **Phase 7: CI Reference-Table Migration** — Make `classId` / `lifecycleStatusId` / `operationalStatusId` / `environmentId` / `relationshipTypeId` NOT NULL FKs with per-tenant backfill; services and UI switch to FK writes only
- [ ] **Phase 8: Retire Asset Hardware/OS Duplication** — Move hardware + OS + software inventory off `Asset` onto `CmdbCiServer` + new `CmdbSoftwareInstalled`; CMDB becomes the sole edit surface; agent ingestion rerouted to CI
- [ ] **Phase 9: Retire Asset↔CI Identity Duplication** — Drop `CmdbConfigurationItem.serialNumber` / `assetTag` / `model` (read via Asset join); split `siteId` into `Asset.stockSiteId` vs `CI.siteId`; nullable `assetId` with nightly orphan report
- [ ] **Phase 10: Application↔CI Criticality Normalization** — Promote `CmdbConfigurationItem.criticality` to `CriticalityLevel` enum; sync Application criticality → `primaryCi.criticality` in the same request
- [ ] **Phase 11: CSDM Service Tier** — Introduce Business / Application / Technical Service CI classes with `CmdbService` extension, `ServiceApplication` + `ServiceSla` joins, `/dashboard/services`, and Service-only SLA attachment
- [ ] **Phase 12: Relationship Verb Catalog Enforcement** — Seed canonical verbs (`depends-on`, `runs-on`, `hosted-on`, `uses`, `consumes`, `member-of`), enforce class-pair constraints at service layer, auto-create inverse on dual-direction verbs
- [ ] **Phase 13: Integrity & Orphan Cleanup** — Switch `CI.assetId` to `onDelete: SetNull` with audit trail, drop `ApplicationAsset.isPrimary`, run nightly orphan/primaryCi mismatch reconciliation
- [ ] **Phase 14: Legacy CI Enum Column Drop** — Destructive final sweep removing `type` / `status` / `environment` / `ownerId` / `relationshipType` enum columns, gated by one-tenant one-week production canary

## Phase Details

### Phase 7: CI Reference-Table Migration
**Goal**: Every CI and CI relationship reads and writes classification via reference-table foreign keys, with zero null FKs after backfill, unblocking all downstream CSDM phases.
**Depends on**: Nothing (first v2.0 phase; builds on Phase 0 Field Ownership Contract shipped 2026-04-16)
**Requirements**: CREF-01, CREF-02, CREF-03, CREF-04, CREF-05, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. Per-tenant backfill completes for every existing CI and relationship with zero null `classId` / `lifecycleStatusId` / `operationalStatusId` / `environmentId` / `relationshipTypeId` rows surfaced by a verification query
  2. `cmdb.service.ts`, `application.service.ts`, and `cmdb-import.service.ts` write only FK ids — grep for legacy enum writes in the services layer returns nothing
  3. CMDB create/edit UI forms render class / status / environment / relationship dropdowns from reference-table fetches (no hard-coded enum lists)
  4. `CmdbRelationship` unique composite index uses `relationshipTypeId` and duplicate creation is rejected at the DB level
  5. `ai-schema-context.ts` + `portal-schema-context.ts` expose the reference tables with joins documented so the AI can answer "what class is this CI?" questions
**Plans**: TBD

### Phase 8: Retire Asset Hardware/OS Duplication
**Goal**: Hardware, OS, and installed-software data lives on the CI (via `CmdbCiServer` + `CmdbSoftwareInstalled`) and nowhere on `Asset`, with the agent ingestion pipeline rerouted so CMDB is the single source of truth for technical profile.
**Depends on**: Phase 7 (needs FK class ids to route agent data to the right CI extension)
**Requirements**: CASR-01, CASR-02, CASR-03, CASR-04, CASR-05, CASR-06, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. `Asset` schema no longer carries `hostname` / `operatingSystem` / `osVersion` / `cpuModel` / `cpuCores` / `ramGb` / `disks` / `networkInterfaces` / `softwareInventory` / `lastInventoryAt` — Prisma migration + grep confirm columns are gone
  2. Per-tenant migration upserts `CmdbCiServer` + `CmdbSoftwareInstalled` rows from legacy `Asset` data; mismatches are logged to `cmdb_migration_audit` and a reconciliation report shows zero unresolved conflicts before release
  3. Asset detail page renders a read-only "Technical Profile" panel that joins through the linked CI — edits are blocked on the Asset side and only CMDB forms accept writes
  4. Inventory-agent ingestion writes updates through `upsertServerExtensionByAsset` to the CI (not `Asset`); a test agent heartbeat produces CMDB changes and leaves `Asset` rows untouched
  5. License reporting query can list software-by-CI via `CmdbSoftwareInstalled` joins; `ai-schema-context.ts` + `portal-schema-context.ts` + `portal-ai-sql-executor.ts` row-level rules reflect the new tables (end-user AI filters via `ciId → asset.assignedToId`)
**Plans**: TBD

### Phase 9: Retire Asset↔CI Identity Duplication
**Goal**: Asset owns identity (serial / manufacturer / model / asset tag / stockroom site) and the CI reads those values via join; hardware-class CIs may exist without an Asset, with orphan reconciliation surfacing them for cleanup.
**Depends on**: Phase 8 (Asset↔CI linking must be solid before dropping identity columns from CI)
**Requirements**: CAID-01, CAID-02, CAID-03, CAID-04, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. `CmdbConfigurationItem.serialNumber`, `assetTag`, and `model` columns are dropped from the schema and CI reads surface those values via `Asset` join in API responses
  2. `Asset.siteId` is renamed to `stockSiteId` (stockroom) and `CmdbConfigurationItem.siteId` (deployed site) remains — two distinct location semantics are visible in both API schemas and admin UI labels
  3. A hardware-class CI (server / endpoint / network_device) can be saved with `assetId = null` without a Prisma validation error; the nightly reconciliation report flags it as an orphan
  4. CMDB new/edit UI shows an Asset picker + inline-create control; after selecting an Asset the serial/manufacturer/model fields appear as read-only reflections
  5. `ai-schema-context.ts` reflects the new join direction (CI identity reads flow through Asset) so AI queries for serial number still resolve correctly
**Plans**: TBD

### Phase 10: Application↔CI Criticality Normalization
**Goal**: CI criticality is enum-typed (not free text) and stays in lockstep with the owning Application's criticality without manual synchronization.
**Depends on**: Phase 7 (reference-table pattern established before swapping enum types)
**Requirements**: CCRT-01, CCRT-02, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. `CmdbConfigurationItem.criticality` is a `CriticalityLevel` enum column; backfill via `cmdb-governance.service.ts` fuzzy-match normalizer converts every legacy free-text value with zero null rows
  2. Editing an Application's criticality in the admin UI updates `primaryCi.criticality` in the same request (visible in CI detail without a page refresh)
  3. `syncApplicationCriticalityToPrimaryCi()` is covered by a service test that exercises CRITICAL / HIGH / MEDIUM / LOW / NON_CRITICAL transitions
  4. `ai-schema-context.ts` documents the enum values so the AI can answer "how many critical CIs do we have?" with accurate counts
**Plans**: TBD

### Phase 11: CSDM Service Tier
**Goal**: Business, Application, and Technical Service CIs exist as first-class citizens above the Application layer; SLAs attach only to Services; Service impact is visible in ticket detail and in service-aware SLA lookup.
**Depends on**: Phase 7 (classId FKs), Phase 8 (CI hardware dedup), Phase 9 (CI identity dedup), Phase 10 (criticality enum) — Service tier sits on top of a clean CI base
**Requirements**: CSVC-01, CSVC-02, CSVC-03, CSVC-04, CSVC-05, CSVC-06, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. Admin can navigate to `/dashboard/services`, create a Business Service CI with `serviceCategory` / `customerScope` / `availabilityTarget` / `rtoMinutes` / `rpoMinutes`, and see it listed with the other two tiers (Application Service, Technical Service)
  2. Admin can link one or more Applications to a Service via `ServiceApplication` (with `role`) and attach an SLA via `ServiceSla`; attempting to attach an SLA directly to an Application is rejected at the service layer
  3. `getSlaForCi(ciId)` walks up the service graph and returns the SLA of the nearest Service ancestor; a ticket on an Application CI resolves to its parent Service's SLA
  4. Ticket detail shows an "Impacted Service" field populated from the Application's linked Service; Application detail shows a "Linked Services" panel
  5. `portal-ai-sql-executor.ts` row-level rules filter Services by `customerScope` so end-user AI only sees services scoped to the user's organization
**Plans**: TBD

### Phase 12: Relationship Verb Catalog Enforcement
**Goal**: Every CI relationship uses a canonical CSDM verb with enforced source+target class constraints; inverse relationships are maintained automatically; legacy enum columns retire.
**Depends on**: Phase 7 (FK class ids required for class-pair constraints), Phase 11 (service classes must exist for the full verb matrix including `member-of` / `uses` at the Service tier)
**Requirements**: CREL-01, CREL-02, CREL-03, CREL-04, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. Canonical verbs `depends-on`, `runs-on`, `hosted-on`, `uses`, `consumes`, `member-of` are seeded per tenant with `allowedSourceClassIds` + `allowedTargetClassIds` + `inverseKey` populated
  2. Creating a relationship with a disallowed class pair (e.g. `runs-on` from `business_service` to `server`) is rejected at `cmdb.service.ts` with a structured error — integration test proves the block
  3. Creating a dual-direction verb (e.g. `depends-on`) auto-creates the inverse relationship in the same transaction; deleting one deletes the inverse
  4. CMDB relationship modal's verb dropdown filters live by the selected source + target CI classes (no disallowed options shown in the UI)
  5. `CmdbRelationship.relationshipType` legacy enum column is dropped after Phase 7's FK write path has been live for at least one release and zero rows reference it
**Plans**: TBD

### Phase 13: Integrity & Orphan Cleanup
**Goal**: Asset deletion never breaks CI integrity, primary-CI duplication is eliminated, and orphan CIs + primaryCi mismatches are surfaced automatically every night.
**Depends on**: Nothing (parallelizable with other phases once 7–10 established the schema base; can ship independently)
**Requirements**: CINT-01, CINT-02, CINT-03, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. `CmdbConfigurationItem.assetId` uses `onDelete: SetNull`; deleting an Asset leaves the CI in place with `assetId = null` and writes a `CmdbChangeRecord` audit entry capturing the unlink
  2. `ApplicationAsset.isPrimary` column is dropped; `Application.primaryCiId` is the sole primary-CI bridge and a migration ensures every Application that had `isPrimary=true` on `ApplicationAsset` still has the corresponding `primaryCiId` set
  3. A nightly reconciliation job runs and produces a governance report (surfaced in `cmdb-governance.service.ts`) listing orphan CIs + primaryCi mismatches; the report is visible in an admin dashboard
  4. `ai-schema-context.ts` reflects the dropped column and the new governance report table so the AI can answer "how many orphan CIs do we have?" questions
**Plans**: TBD

### Phase 14: Legacy CI Enum Column Drop
**Goal**: Legacy enum columns on `CmdbConfigurationItem` and `CmdbRelationship` are permanently removed in a destructive sweep — gated by a one-tenant one-week production canary to prove zero downstream breakage.
**Depends on**: Phase 7 (FK writes live), Phase 8 (Asset dedup live), Phase 9 (identity dedup live), Phase 12 (verb catalog live) — all four must have shipped at least one release each in production before the destructive drop runs
**Requirements**: CLEG-01, CLEG-02, CAI-01 (cross-cutting), CAI-02 (cross-cutting), CAI-03 (cross-cutting)
**Success Criteria** (what must be TRUE):
  1. Pre-flight verification query returns zero rows across all tenants where any of `CmdbConfigurationItem.type` / `status` / `environment` / `ownerId` / `CmdbRelationship.relationshipType` is populated while the corresponding FK is null
  2. Production canary on one tenant runs the migration, observes one full week of normal operation (tickets created, agent heartbeats ingested, nightly reconciliation clean), and reports zero error-log entries tied to the dropped columns
  3. Broad deploy drops the columns across all tenants; Prisma migration + schema introspection confirm the columns no longer exist
  4. `ai-schema-context.ts` + `portal-schema-context.ts` have the dropped columns removed in the same PR — no stale references remain
  5. A rollback plan is documented (restore columns from pre-migration backup) and referenced in the phase retrospective even though it was not exercised
**Plans**: TBD

## Progress

| Phase | Milestone | Plans | Status | Completed |
| --- | --- | --- | --- | --- |
| 1. Foundation | v1.0 | 7/7 | Complete | 2026-03-20 |
| 2. Billing and Owner Admin | v1.0 | 6/6 | Complete | 2026-03-20 |
| 3. Core ITSM | v1.0 | 12/12 | Complete | 2026-03-21 |
| 4. CMDB, Change Management, and Asset Portfolio | v1.0 | 8/8 | Complete | 2026-03-22 |
| 5. Agent, Mobile, and Integrations | v1.0 | 9/9 | Complete | 2026-03-23 |
| 6. v1.0 Paperwork Cleanup | v1.0 | 1/1 | Complete | 2026-04-16 |
| 7. CI Reference-Table Migration | v2.0 | 0/? | Not started | — |
| 8. Retire Asset Hardware/OS Duplication | v2.0 | 0/? | Not started | — |
| 9. Retire Asset↔CI Identity Duplication | v2.0 | 0/? | Not started | — |
| 10. Application↔CI Criticality Normalization | v2.0 | 0/? | Not started | — |
| 11. CSDM Service Tier | v2.0 | 0/? | Not started | — |
| 12. Relationship Verb Catalog Enforcement | v2.0 | 0/? | Not started | — |
| 13. Integrity & Orphan Cleanup | v2.0 | 0/? | Not started | — |
| 14. Legacy CI Enum Column Drop | v2.0 | 0/? | Not started | — |
