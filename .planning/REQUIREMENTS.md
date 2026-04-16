# Requirements — Milestone v2.0 CSDM Alignment

**Status:** Draft (generated 2026-04-16 from CSDM master plan at `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md`)
**Coverage:** 0/30 requirements complete

All v2.0 requirements trace to the Field Ownership Contract at `docs/architecture/csdm-field-ownership.md` and the 8-phase plan in the master document. Multi-tenancy (`tenantId` scoping) and AI bot exposure with RBAC are cross-cutting invariants honored by every requirement.

## v2 Requirements

### CI Reference Data Migration (CREF)

- [ ] **CREF-01**: `CmdbConfigurationItem.classId` is required (NOT NULL) on create; backfilled from legacy `type` enum via per-tenant mapping
- [ ] **CREF-02**: `CmdbConfigurationItem.lifecycleStatusId` and `operationalStatusId` are required; backfilled from legacy `status` enum via per-tenant mapping
- [ ] **CREF-03**: `CmdbConfigurationItem.environmentId` is required; backfilled from legacy `environment` enum
- [ ] **CREF-04**: `CmdbRelationship.relationshipTypeId` is required; unique composite index rewritten to use the FK; backfill covers all existing relationships
- [ ] **CREF-05**: `cmdb.service.ts`, `application.service.ts`, and `cmdb-import.service.ts` write FK ids only (no legacy enum writes); CMDB UI forms use reference-table fetches

### Asset / CI Hardware Dedup (CASR)

- [ ] **CASR-01**: Asset schema drops `hostname`, `operatingSystem`, `osVersion`, `cpuModel`, `cpuCores`, `ramGb`, `disks`, `networkInterfaces`, `softwareInventory`, `lastInventoryAt`
- [ ] **CASR-02**: `CmdbCiServer` extension carries canonical hardware fields (`cpuCount`, `memoryGb`, `cpuModel`, disks/NICs as JSON); `cpuCores` → `cpuCount` rename applied
- [ ] **CASR-03**: `CmdbSoftwareInstalled` normalized table replaces the Asset `softwareInventory` JSON blob; enables license reporting
- [ ] **CASR-04**: Per-tenant data migration upserts CI + CmdbCiServer from existing Asset data; CI wins on conflict; mismatches logged to `cmdb_migration_audit`
- [ ] **CASR-05**: Asset UI exposes read-only "Technical Profile" panel joining through linked CI; CMDB UI becomes the sole edit surface for technical fields
- [ ] **CASR-06**: Inventory-agent ingestion routes updates to CI (not Asset); `upsertServerExtensionByAsset` service function added

### Asset ↔ CI Identity Dedup (CAID)

- [ ] **CAID-01**: `CmdbConfigurationItem.serialNumber`, `assetTag`, and `model` columns dropped; CI reads these via `Asset` join
- [ ] **CAID-02**: `Asset.siteId` renamed to `stockSiteId` (stockroom location); `CmdbConfigurationItem.siteId` remains (deployed site) — two distinct semantics
- [ ] **CAID-03**: Hardware-class CIs (server/endpoint/network_device) can be created with nullable `assetId`; nightly reconciliation report surfaces orphan CIs
- [ ] **CAID-04**: CMDB new/edit UI uses an Asset picker/inline-creator; serial/manufacturer/model come from the chosen Asset

### Application ↔ CI Criticality Sync (CCRT)

- [ ] **CCRT-01**: `CmdbConfigurationItem.criticality` changed from free-text string to `CriticalityLevel` enum (backfilled with a fuzzy-match normalization surfaced via `cmdb-governance.service.ts`)
- [ ] **CCRT-02**: On Application criticality change, `syncApplicationCriticalityToPrimaryCi()` propagates to `primaryCi.criticality` in the same request

### CSDM Service Tier (CSVC)

- [ ] **CSVC-01**: `CmdbCiClass` seeded with `business_service`, `application_service`, `technical_service` classes
- [ ] **CSVC-02**: `CmdbService` extension supports service tier with `serviceCategory`, `customerScope`, `availabilityTarget`, `rtoMinutes`, `rpoMinutes`
- [ ] **CSVC-03**: `ServiceApplication(tenantId, serviceCiId, applicationId, role)` join created — one Service hosts many Applications, one Application may front many Services
- [ ] **CSVC-04**: `ServiceSla(tenantId, serviceCiId, slaId)` join — SLAs attach **only** to Services (never directly to Applications)
- [ ] **CSVC-05**: `service.service.ts` service created; `getSlaForCi(ciId)` walks up the service graph
- [ ] **CSVC-06**: `/dashboard/services` list + `/dashboard/services/[id]` detail pages; Application detail gains "Linked Services" panel; Ticket detail gains "Impacted Service" field

### Relationship Verb Catalog (CREL)

- [ ] **CREL-01**: `CmdbRelationshipTypeRef` extended with `allowedSourceClassIds`, `allowedTargetClassIds`, `inverseKey` — class-pair constraints enforced at `cmdb.service.ts` relationship create
- [ ] **CREL-02**: Canonical CSDM verbs seeded per tenant: `depends-on`, `runs-on`, `hosted-on`, `uses`, `consumes`, `member-of`
- [ ] **CREL-03**: Auto-create inverse relationship on dual-direction verbs; legacy `CmdbRelationshipType` enum column dropped (gated after CREF-04 completes)
- [ ] **CREL-04**: CMDB relationship modal filters verb dropdown by source+target class

### Integrity & Orphan Cleanup (CINT)

- [ ] **CINT-01**: `CmdbConfigurationItem.assetId` uses `onDelete: SetNull`; asset-delete service path writes `CmdbChangeRecord` audit entry
- [ ] **CINT-02**: `ApplicationAsset.isPrimary` removed (duplicates `Application.primaryCiId` bridge)
- [ ] **CINT-03**: Nightly reconciliation job flags orphan CIs + primaryCi mismatches; surfaced in `cmdb-governance.service.ts` dashboard

### Legacy Column Removal (CLEG)

- [ ] **CLEG-01**: Drop `CmdbConfigurationItem.type`, `status`, `environment`, `ownerId` enum columns (pre-flight verifies zero rows with null FKs per tenant)
- [ ] **CLEG-02**: Drop `CmdbRelationship.relationshipType` enum column and legacy indexes; production canary on one tenant for one week before broad deploy

### AI Exposure + RBAC (CAI — cross-cutting)

- [ ] **CAI-01**: Every schema-touching phase updates `apps/api/src/services/ai-schema-context.ts` (staff AI) — new tables added, dropped columns removed, renamed columns reflected
- [ ] **CAI-02**: Every schema-touching phase updates `apps/api/src/services/portal-schema-context.ts` (end-user AI) — same diff scoped to end-user-visible tables
- [ ] **CAI-03**: `apps/api/src/services/portal-ai-sql-executor.ts` row-level security extended to new tables (e.g., `cmdb_software_installed` filtered via `ciId → asset.assignedToId`; Services filtered via `customerScope`)

## Future Requirements (deferred from v1.0)

- Populate Nyquist validation test suite across phases 1–5 (currently 0/5 compliant)
- AGNT-10 S3 + Azure Blob export plugins for .NET inventory agent
- `packages/` refactor to eliminate cross-app worker code duplication (SLA / email / CSV)
- `usage-snapshot.ts` placeholder fields (activeAgents, ticketCount, storageBytes)
- ServiceOffering (commercial service catalog) — defer to a later ITIL service catalog milestone

## Out of Scope (v2.0)

- OAuth2/SSO providers (Azure AD, Okta, Google) — stays deferred to Enterprise tier
- Real-time chat — not core to ITSM value
- ITIL Requested/Ordered/Received asset lifecycle states — scope creep; procurement milestone if needed
- Graph database for CMDB — PostgreSQL recursive CTEs proven sufficient in v1.0

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CREF-01 | — | Pending |
| CREF-02 | — | Pending |
| CREF-03 | — | Pending |
| CREF-04 | — | Pending |
| CREF-05 | — | Pending |
| CASR-01 | — | Pending |
| CASR-02 | — | Pending |
| CASR-03 | — | Pending |
| CASR-04 | — | Pending |
| CASR-05 | — | Pending |
| CASR-06 | — | Pending |
| CAID-01 | — | Pending |
| CAID-02 | — | Pending |
| CAID-03 | — | Pending |
| CAID-04 | — | Pending |
| CCRT-01 | — | Pending |
| CCRT-02 | — | Pending |
| CSVC-01 | — | Pending |
| CSVC-02 | — | Pending |
| CSVC-03 | — | Pending |
| CSVC-04 | — | Pending |
| CSVC-05 | — | Pending |
| CSVC-06 | — | Pending |
| CREL-01 | — | Pending |
| CREL-02 | — | Pending |
| CREL-03 | — | Pending |
| CREL-04 | — | Pending |
| CINT-01 | — | Pending |
| CINT-02 | — | Pending |
| CINT-03 | — | Pending |
| CLEG-01 | — | Pending |
| CLEG-02 | — | Pending |
| CAI-01 | — | Pending (cross-cutting) |
| CAI-02 | — | Pending (cross-cutting) |
| CAI-03 | — | Pending (cross-cutting) |
