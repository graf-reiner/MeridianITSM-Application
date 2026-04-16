---
phase: 7
slug: ci-reference-table-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Generated from RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 (apps/api unit + integration), Playwright (apps/web E2E) |
| **Config file** | `apps/api/vitest.config.ts` (existing), `apps/web/playwright.config.ts` (existing). Wave 0 may add `apps/api/vitest.integration.config.ts` for the real-DB unique-index test. |
| **Quick run command** | `pnpm --filter @meridian/api vitest run src/__tests__/cmdb-service.test.ts src/__tests__/cmdb-import.test.ts src/__tests__/cmdb-reconciliation.test.ts` |
| **Full suite command** | `pnpm --filter @meridian/api vitest run && pnpm --filter web playwright test --grep cmdb` |
| **Phase 7 backfill command** | `pnpm tsx packages/db/scripts/phase7-backfill.ts` (Wave 0 — replaces `cmdb-migration.ts`) |
| **Phase 7 verification command** | `pnpm tsx packages/db/scripts/phase7-verify.ts` (Wave 0 — exits non-zero if any tenant has null FKs) |
| **Phase 7 grep gate** | `bash packages/db/scripts/phase7-grep-gate.sh` (Wave 0 — exits non-zero on legacy enum writes) |
| **Estimated runtime** | Quick: ~12s. Full: ~90s. Backfill: per-tenant, ~5s/tenant on dev. |

---

## Sampling Rate

- **After every task commit:** Run quick command (`vitest run` on the just-modified service test file)
- **After every plan wave:** Run `pnpm --filter @meridian/api vitest run && pnpm tsx packages/db/scripts/phase7-verify.ts && bash packages/db/scripts/phase7-grep-gate.sh`
- **Before `/gsd-verify-work`:** Full suite green + `phase7-verify.ts` reports "all tenants compliant" + `phase7-grep-gate.sh` exits 0 + Playwright `--grep cmdb` green + manual smoke (create CI in dev tenant via UI, observe FK ids in DB, observe AI chat answers "how many servers do we have?" using JOIN)
- **Max feedback latency:** ~12 seconds (quick run)

---

## Per-Task Verification Map

> Filled by `gsd-planner` during planning. Each task in each PLAN.md must reference one of the test commands below or include a Wave 0 dependency for the test it relies on.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-XX-XX | TBD | TBD | CREF-01 | tenant-isolation | classId required, no cross-tenant leak | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "createCI rejects missing classId"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-01 | — | createCI does not write legacy `type` field | Unit (Vitest negative assertion) | `pnpm --filter @meridian/api vitest run -t "createCI does not write legacy type field"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-02 | — | lifecycleStatusId / operationalStatusId NOT NULL after backfill | DB integration | `pnpm tsx packages/db/scripts/phase7-verify.ts` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-02 | — | Backfill maps `CmdbCiStatus.ACTIVE` → `lifecycleStatusId='in_service'` | Unit (Vitest) | `pnpm --filter @meridian/db vitest run -t "STATUS_TO_LIFECYCLE maps ACTIVE to in_service"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-02 | — | Backfill defaults `operationalStatusId='unknown'` | Unit (Vitest) | `pnpm --filter @meridian/db vitest run -t "operationalStatusId defaults to unknown"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-03 | — | environmentId NOT NULL after backfill | DB integration | `pnpm tsx packages/db/scripts/phase7-verify.ts` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-04 | — | relationshipTypeId NOT NULL after backfill | DB integration | `pnpm tsx packages/db/scripts/phase7-verify.ts` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-04 | — | Unique composite index uses `relationshipTypeId` | DB introspection | `pnpm tsx packages/db/scripts/phase7-verify.ts` (asserts via `\d cmdb_relationships`) | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-04 | — | Duplicate `(sourceId, targetId, relationshipTypeId)` rejected by DB | Integration (real Postgres) | `pnpm --filter @meridian/api vitest run -t "duplicate relationship rejected by unique index"` | ❌ W0 (needs `vitest.integration.config.ts` + testcontainers/postgres OR local PG) | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-05 | — | No legacy enum writes in cmdb.service / application.service / cmdb-import.service / cmdb-reconciliation worker | Static (grep) | `bash packages/db/scripts/phase7-grep-gate.sh` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CREF-05 | — | UI dropdowns sourced from API ref-table fetches | E2E (Playwright) | `pnpm --filter web playwright test tests/cmdb-ref-table-dropdowns.spec.ts` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CAI-01 | — | `ai-schema-context.ts` documents `JOIN cmdb_ci_classes` for `cmdb_configuration_items` | Static (file content) | `pnpm --filter @meridian/api vitest run -t "ai-schema-context documents cmdb_configuration_items joins"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CAI-02 | tenant-isolation | `portal-schema-context.ts` excludes all `cmdb_*` tables | Static (file content) | `pnpm --filter @meridian/api vitest run -t "portal context excludes cmdb_*"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | CAI-03 | tenant-isolation | Portal AI SQL executor rejects queries against `cmdb_*` tables | Unit (Vitest) | `pnpm --filter @meridian/api vitest run -t "executePortalQuery rejects cmdb_configuration_items"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | Multi-tenancy | tenant-isolation | Reference-table list endpoint of tenant A returns 0 rows from tenant B | E2E (Playwright, two tenants) | `pnpm --filter web playwright test tests/cmdb-ref-tenant-isolation.spec.ts` | ❌ W0 (needs `loginAsTenantBAdmin` helper) | ⬜ pending |
| 7-XX-XX | TBD | TBD | Tenant lifecycle | tenant-isolation | Signup endpoint seeds reference data for new tenant | Integration (Vitest) | `pnpm --filter @meridian/api vitest run -t "signup seeds cmdb reference data"` | ❌ W0 | ⬜ pending |
| 7-XX-XX | TBD | TBD | Tenant lifecycle | tenant-isolation | Owner provisioning seeds reference data for new tenant | Integration (Vitest) | `pnpm --filter owner vitest run -t "provisioning seeds cmdb reference data"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The following test/script files MUST exist before any implementation tasks run. Plan must place these in **Wave 0** so the entire phase has a verification harness from day one.

- [ ] `packages/db/scripts/phase7-verify.ts` — verification script: per-tenant null-FK report, unique-index introspection, exits non-zero on failure
- [ ] `packages/db/scripts/phase7-backfill.ts` — extends `cmdb-migration.ts` with `STATUS_TO_OPERATIONAL` mapping + duplicate-relationship pre-flight detection
- [ ] `packages/db/scripts/phase7-grep-gate.sh` — bash script: greps for legacy enum writes in cmdb.service, application.service, cmdb-import.service, cmdb-reconciliation worker AND `apps/api/src/routes/v1/assets/index.ts:270,297` — exits non-zero on any hit
- [ ] `packages/db/src/seeds/cmdb-reference.ts` — extracted reusable seeder (takes `tx` parameter so signup can call it inside its transaction)
- [ ] `apps/api/src/__tests__/cmdb-service.test.ts` — extend with: createCI rejects missing classId, createCI does not write legacy type/status/environment, deleteCI uses `lifecycleStatusId='retired'`
- [ ] `apps/api/src/__tests__/cmdb-import.test.ts` — extend with: import requires classKey to resolve to non-null classId
- [ ] `apps/api/src/__tests__/cmdb-reconciliation.test.ts` — extend with: reconciliation resolves classId via `resolveClassId`, stale-CI marker writes `operationalStatusId='offline'` not legacy `status='INACTIVE'`
- [ ] `apps/api/src/__tests__/signup-cmdb-seed.test.ts` — NEW: signup integration test asserts ref data populated for new tenant
- [ ] `apps/api/src/__tests__/portal-context.test.ts` — NEW: asserts `PORTAL_ALLOWED_TABLES` excludes all `cmdb_*` tables
- [ ] `apps/api/src/__tests__/ai-schema-context.test.ts` — NEW: asserts SCHEMA_CONTEXT contains `JOIN cmdb_ci_classes` documentation and does NOT contain the legacy enum token list for `cmdb_configuration_items`
- [ ] `apps/web/tests/cmdb-ref-table-dropdowns.spec.ts` — NEW: Playwright verifies CMDB new-CI form populates class/status/environment dropdowns from API fetches
- [ ] `apps/web/tests/cmdb-ref-tenant-isolation.spec.ts` — NEW: requires second test tenant; `apps/web/tests/helpers.ts` may need `loginAsTenantBAdmin()` helper extension
- [ ] (Optional) `apps/api/vitest.integration.config.ts` — for the real-Postgres unique-index test (CREF-04 last row)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AI chat answers "how many servers do we have?" using `JOIN cmdb_ci_classes` | CAI-01 | Requires running LLM call against the dev assistant; not deterministic enough for CI | After Phase 7 deploy: open AI assistant in dev tenant, ask "how many servers do we have?", confirm response cites correct count and the underlying SQL plan (visible in dev mode) uses the JOIN |
| Pre-flight backfill dry-run on production-shaped data | CREF-04 (relationship duplicates) | Production data shape can only be sampled from a real DB snapshot | Restore latest prod snapshot to dev DB, run `pnpm tsx packages/db/scripts/phase7-backfill.ts --dry-run`, inspect the duplicate-relationship report. Address any duplicates with operator before scheduling NOT NULL migration |
| Migration name matches `phase7_*` convention | naming convention | Prisma generates timestamped name; convention check is by eye when reviewing the migration commit | After running `pnpm prisma migrate dev --create-only --name phase7_ci_ref_notnull`, confirm the directory created under `apps/web/prisma/migrations/` matches `*_phase7_ci_ref_notnull/` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
