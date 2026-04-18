---
phase: 8
slug: retire-asset-hardware-os-duplication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Generated from RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (apps/api unit + integration), Playwright (apps/web E2E) |
| **Config file** | `apps/api/vitest.config.ts`, `packages/db/vitest.config.ts`, `apps/web/playwright.config.ts` (all existing) |
| **Quick run command** | `pnpm --filter @meridian/api vitest run src/__tests__/cmdb-extension.test.ts src/__tests__/asset-service.test.ts src/__tests__/ai-schema-context.test.ts src/__tests__/portal-context.test.ts` |
| **Full suite command** | `pnpm --filter @meridian/api vitest run && pnpm --filter @meridian/db vitest run && pnpm --filter web playwright test --grep "asset\|cmdb\|software"` |
| **Phase 8 backfill command** | `pnpm tsx packages/db/scripts/phase8-backfill.ts` (Wave 0) |
| **Phase 8 verification command** | `pnpm tsx packages/db/scripts/phase8-verify.ts` (Wave 0) |
| **Phase 8 grep gate** | `bash packages/db/scripts/phase8-grep-gate.sh` (Wave 0; ENFORCE mode after Wave 3) |
| **Estimated runtime** | Quick: ~15s. Full: ~120s. Backfill: per-tenant, ~10s/tenant on dev. |

---

## Sampling Rate

- **After every task commit:** Run quick command (Vitest on the just-modified service test file)
- **After every plan wave:** Run `pnpm --filter @meridian/api vitest run && pnpm --filter @meridian/db vitest run && pnpm tsx packages/db/scripts/phase8-verify.ts && bash packages/db/scripts/phase8-grep-gate.sh`
- **Before `/gsd-verify-work`:** Full suite green + `phase8-verify.ts` reports "all tenants compliant" + `phase8-grep-gate.sh` exits 0 + Playwright `--grep "asset|cmdb|software"` green + manual smoke (POST a fake inventory snapshot to a dev tenant; observe a new `CmdbCiServer` row + `CmdbSoftwareInstalled` rows; observe Asset row hardware fields are NULL/dropped)
- **Max feedback latency:** ~15 seconds (quick run)

---

## Per-Task Verification Map

> Filled by `gsd-planner` during planning. Each task in each PLAN.md must reference one of the test commands below or include a Wave 0 dependency.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-XX-XX | TBD | TBD | CASR-01 | — | Asset schema lacks 10 hardware columns after migration | DB introspection | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-01 | — | Prisma client refuses to write Asset.hostname after Wave 5 | Unit (Vitest expect throw) | `pnpm --filter @meridian/api vitest run -t "createAsset rejects hostname field"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-02 | — | CmdbCiServer has cpuModel + disksJson + networkInterfacesJson | DB introspection | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-03 | — | CmdbSoftwareInstalled table exists with correct cols + unique constraint | DB introspection | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-03 | licenseKey leak | License reporting query returns expected rows for CI with 3 software items | Integration (real PG) | `pnpm --filter @meridian/api vitest run -t "getSoftwareInventoryReport returns CIs with software"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-04 | conflict-logging | Backfill upserts CmdbCiServer for every Asset with hardware data; logs conflicts | Integration | `pnpm --filter @meridian/db vitest run -t "phase8-backfill upserts CmdbCiServer and logs CI-wins conflicts"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-04 | — | Per-tenant migration produces zero unresolved conflicts | DB integration | `pnpm tsx packages/db/scripts/phase8-verify.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-05 | — | Asset detail Technical Profile tab renders linked CI hardware | E2E | `pnpm --filter web playwright test tests/asset-technical-profile.spec.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-05 | — | Orphan Asset shows "Link a CI" empty state | E2E | `pnpm --filter web playwright test tests/asset-link-ci.spec.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-05 | — | Asset edit page no longer accepts hostname/OS/CPU/RAM input | E2E (negative) | `pnpm --filter web playwright test tests/asset-edit-no-tech-fields.spec.ts` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-06 | tenant-isolation | upsertServerExtensionByAsset writes to CmdbCiServer; never touches Asset | Unit (mocked Prisma) | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset writes only to CmdbCiServer"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-06 | D-08 orphan | upsertServerExtensionByAsset auto-creates CI for orphan Asset | Unit | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset auto-creates CI for orphan"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-06 | — | Inventory POST writes to CmdbCiServer + Asset row UNCHANGED | Integration (real PG) | `pnpm --filter @meridian/api vitest run -t "POST /agents/inventory writes to CmdbCiServer not Asset"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CASR-06 | D-06 dedup | upsertServerExtensionByAsset upserts CmdbSoftwareInstalled with (ciId, name, version) + lastSeenAt | Integration | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset upserts CmdbSoftwareInstalled"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CAI-01 | — | ai-schema-context: assets removed 10 fields; cmdb_software_installed added | Static (Vitest content) | `pnpm --filter @meridian/api vitest run -t "ai-schema-context: assets has no hostname/operatingSystem; cmdb_software_installed exists"` | ❌ W0 (extends Phase 7 file) | ⬜ pending |
| 8-XX-XX | TBD | TBD | CAI-01 | sensitive-table | ai-schema-context.ts excludes cmdb_migration_audit | Static | `pnpm --filter @meridian/api vitest run -t "ai-schema-context excludes cmdb_migration_audit"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CAI-02 | tenant-isolation | portal-schema-context Phase 8 exclusion comment present | Static | `pnpm --filter @meridian/api vitest run -t "portal-schema-context Phase 8 exclusion comment present"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CAI-03 | tenant-isolation | portal-ai-sql-executor rejects SELECT on cmdb_software_installed | Unit | `pnpm --filter @meridian/api vitest run -t "executePortalQuery rejects cmdb_software_installed"` | ❌ W0 (extends Phase 7) | ⬜ pending |
| 8-XX-XX | TBD | TBD | CAI-03 | tenant-isolation | portal-ai-sql-executor rejects SELECT on cmdb_migration_audit | Unit | `pnpm --filter @meridian/api vitest run -t "executePortalQuery rejects cmdb_migration_audit"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | CSDM Field Ownership | — | No Asset write path writes the 10 dropped fields | Static (grep) | `bash packages/db/scripts/phase8-grep-gate.sh` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | Multi-tenancy | tenant-isolation | upsertServerExtensionByAsset filters by tenantId in every Prisma call | Static + Unit | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset rejects cross-tenant Asset"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | Multi-tenancy | tenant-isolation | License reporting query of tenant A returns 0 rows from tenant B | Integration (two-tenant) | `pnpm --filter @meridian/api vitest run -t "getSoftwareInventoryReport excludes other tenants"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | D-01 conflict logging | conflict-logging | Per-Asset backfill writes one row per conflicting field to cmdb_migration_audit | Unit (mocked tx) | `pnpm --filter @meridian/db vitest run -t "phase8-backfill logs conflict per field"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | D-08 orphan auto-create | orphan path | Inventory POST for Asset with no linked CI auto-creates the CI | Integration | `pnpm --filter @meridian/api vitest run -t "POST /agents/inventory auto-creates CI for orphan Asset"` | ❌ W0 | ⬜ pending |
| 8-XX-XX | TBD | TBD | Pitfall 7 — missing ref data | seed-gap | upsertServerExtensionByAsset throws structured error if resolveClassId returns null | Unit | `pnpm --filter @meridian/api vitest run -t "upsertServerExtensionByAsset throws on missing reference data"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/db/scripts/phase8-verify.ts` — DB introspection: dropped columns gone, new tables exist, per-tenant null-FK report, cross-tenant isolation check
- [ ] `packages/db/scripts/phase8-backfill.ts` — per-tenant Asset → CmdbCiServer + CmdbSoftwareInstalled backfill with CI-wins conflict logging
- [ ] `packages/db/scripts/phase8-grep-gate.sh` — bash script: zero references to dropped Asset fields in `apps/api/src/`, `apps/web/src/`, `apps/worker/src/`
- [ ] `apps/api/src/__tests__/cmdb-extension.test.ts` — NEW: upsertServerExtensionByAsset tests (writes-only, orphan auto-create, tenant isolation, missing-ref-data throw)
- [ ] `apps/api/src/__tests__/asset-service.test.ts` — MODIFY (existing): remove tests for dropped fields; add negative assertions
- [ ] `apps/api/src/__tests__/ai-schema-context.test.ts` — MODIFY (existing from Phase 7): extend with Phase 8 assertions
- [ ] `apps/api/src/__tests__/portal-context.test.ts` — MODIFY (existing from Phase 7): extend with cmdb_software_installed + cmdb_migration_audit rejection
- [ ] `apps/api/src/__tests__/inventory-ingestion.test.ts` — NEW: integration test for POST /agents/inventory rerouting writes
- [ ] `apps/web/tests/asset-technical-profile.spec.ts` — NEW: Playwright Technical Profile tab on linked Asset
- [ ] `apps/web/tests/asset-link-ci.spec.ts` — NEW: Playwright orphan empty state + Link-a-CI flow
- [ ] `apps/web/tests/asset-edit-no-tech-fields.spec.ts` — NEW: Playwright negative — Asset edit form has no hostname/OS/CPU input
- [ ] `apps/web/src/components/cmdb/CIPicker.tsx` — NEW: search-by-name CI picker for Link-a-CI flow (mirror VendorPicker.tsx)
- [ ] `packages/db/src/seeds/cmdb-reference.ts` — VERIFY (Wave 0 sanity): re-run `seed-existing-tenants-cmdb-ref.ts` to catch tenants added between Phase 7 ship and Phase 8 start

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inventory POST end-to-end smoke | CASR-06 | Requires real .NET agent or curl with valid AgentKey against running dev API | After Phase 8 deploy: from dev server, `curl -X POST -H 'X-Agent-Key: <key>' /api/v1/agents/inventory -d @sample-snapshot.json`. Confirm: new CmdbCiServer row appears, CmdbSoftwareInstalled rows appear for each software item, Asset row hardware fields are NULL/gone |
| License reporting AI smoke | CAI-01 | LLM behavior is non-deterministic | Open staff AI assistant, ask "Which CIs have Microsoft Office installed?". Confirm SQL plan uses `JOIN cmdb_software_installed` and returns expected count |
| Pre-flight backfill dry-run on production-shaped data | CASR-04 | Production data shape can only be sampled from a real DB snapshot | Restore latest prod snapshot to dev, run `pnpm tsx packages/db/scripts/phase8-backfill.ts --dry-run`. Inspect the conflict report. Address any unexpected conflict patterns before scheduling production migration |
| Migration name matches `phase8_*` convention | naming | Prisma generates timestamped name; convention check by eye | After `pnpm prisma migrate dev --create-only --name phase8_drop_asset_tech_columns`, confirm directory created at `packages/db/prisma/migrations/*_phase8_drop_asset_tech_columns/` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
