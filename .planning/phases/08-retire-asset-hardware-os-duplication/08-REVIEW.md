---
phase: 08-retire-asset-hardware-os-duplication
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - apps/api/src/__tests__/ai-schema-context.test.ts
  - apps/api/src/__tests__/asset-service.test.ts
  - apps/api/src/__tests__/cmdb-extension.test.ts
  - apps/api/src/__tests__/cmdb-patch-route.test.ts
  - apps/api/src/__tests__/cmdb-reconciliation.test.ts
  - apps/api/src/__tests__/inventory-ingestion.test.ts
  - apps/api/src/__tests__/portal-ai-sql-executor.test.ts
  - apps/api/src/__tests__/portal-context.test.ts
  - apps/api/src/__tests__/software-inventory-report.test.ts
  - apps/api/src/__tests__/test-helpers.ts
  - apps/api/src/routes/v1/agents/index.ts
  - apps/api/src/routes/v1/assets/index.ts
  - apps/api/src/routes/v1/cmdb/cis/[id]/software.ts
  - apps/api/src/routes/v1/cmdb/index.ts
  - apps/api/src/routes/v1/index.ts
  - apps/api/src/routes/v1/reports/software-installed.ts
  - apps/api/src/services/ai-schema-context.ts
  - apps/api/src/services/asset.service.ts
  - apps/api/src/services/cmdb-extension.service.ts
  - apps/api/src/services/portal-schema-context.ts
  - apps/api/src/services/report.service.ts
  - apps/web/src/app/dashboard/assets/[id]/page.tsx
  - apps/web/src/components/cmdb/CIPicker.tsx
  - apps/web/tests/asset-edit-no-tech-fields.spec.ts
  - apps/web/tests/asset-link-ci.spec.ts
  - apps/web/tests/asset-technical-profile.spec.ts
  - apps/worker/src/workers/cmdb-reconciliation.ts
  - packages/db/__tests__/phase8-backfill.test.ts
  - packages/db/prisma/migrations/20260418041431_phase8_extension_and_audit_tables/migration.sql
  - packages/db/prisma/migrations/20260418051442_phase8_drop_asset_tech_columns/migration.sql
  - packages/db/prisma/schema.prisma
  - packages/db/scripts/phase8-backfill.ts
  - packages/db/scripts/phase8-grep-gate.sh
  - packages/db/scripts/phase8-verify.ts
  - packages/db/vitest.config.ts
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

Phase 8 retires the Asset hardware/OS/software duplication by moving 10 columns onto `CmdbCiServer` + `CmdbSoftwareInstalled`, with a forensic `CmdbMigrationAudit` table and a pre-flight-gated destructive migration. Overall the architecture is sound and multi-tenancy discipline is rigorous — every new table carries `tenantId` with a Tenant FK, every route/service call filters by `tenantId`, the PATCH endpoint has a dual-tenant guard, `phase8-verify.ts` Check 4 performs an affirmative cross-tenant leak sweep, and both portal AI allowlist and Portal SQL executor correctly reject the new `cmdb_*` tables. The destructive migration has a clean DO-block pre-flight gate with an actionable error message.

The review found **one Critical** correctness bug, **four Warnings** around data-consistency edges in the new agent-inventory path, and **five Info** items (mostly style/consistency). The Critical issue is in the newly rerouted agent inventory ingestion path, which creates a duplicate `CmdbConfigurationItem` on every inventory POST when the agent has no prior Asset linkage.

## Critical Issues

### CR-01: Agent inventory POST auto-creates a duplicate CI on every submission

**File:** `apps/api/src/routes/v1/agents/index.ts:449` (call site) + `apps/api/src/services/cmdb-extension.service.ts:82-155` (service body)

**Issue:**
The Phase 8 Wave 5 reroute sets `assetIdForExt: string | null = null` unconditionally (line 449) and passes it into `upsertServerExtensionByAsset`. Inside the service:

- Line 84: `if (assetId)` short-circuits → `resolvedAsset` stays `null`.
- Lines 100-106: `if (resolvedAsset)` block that looks up the linked CI is **skipped**.
- Line 108: `if (!ci)` is therefore **always true** → the D-08 orphan-create branch runs on every call.

Consequence: every `POST /api/v1/agents/inventory` request creates a brand-new `CmdbConfigurationItem` row (with a fresh `ciNumber`) plus a new `CmdbCiServer` extension. The existing `cmdb-reconciliation` worker deduplicates by `agentId` / `hostname`, but it runs on a 15-minute schedule — in between reconciler runs every inventory POST leaves a new orphan CI behind. Over a day of hourly inventory on a 1,000-agent tenant this produces thousands of duplicate CIs, all with `ciNumber` collisions competing through the advisory lock. This also breaks plan-limit enforcement (CIs count toward subscription usage) and pollutes the CMDB list view.

The existing `inventory-ingestion.test.ts` Test 1 (line 167) masks the bug by pre-seeding `txCIFindFirst.mockResolvedValue({ id: 'ci-1' })` — but because the service is never invoked on the `resolvedAsset` branch, that mock is actually never consulted. Test 2 (line 217) confirms the orphan-create path: `txCICreate.mockResolvedValue({ id: 'ci-new' })` and `createCall.data.assetId` is `null`. Both tests pass, but they encode the bug rather than catch it.

**Fix:**
Add an agent-scoped CI lookup to `upsertServerExtensionByAsset` BEFORE the D-08 orphan branch. The worker already does this — mirror its dedup. Two places to change:

1. `apps/api/src/services/cmdb-extension.service.ts` — extend the signature to accept an optional `agentId` and a `hostname` hint, and add a dedup step:

```ts
export async function upsertServerExtensionByAsset(
  tx: Tx,
  tenantId: string,
  assetId: string | null,
  snapshot: AgentInventorySnapshot,
  opts?: { source?: 'agent' | 'manual' | 'import'; agentId?: string | null },
): Promise<UpsertServerExtensionResult> {
  // ... existing Asset resolution ...

  let ci: { id: string } | null = null;

  if (resolvedAsset) {
    ci = await tx.cmdbConfigurationItem.findFirst({
      where: { tenantId, assetId: resolvedAsset.id },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // NEW: dedup by agentId (mirrors the worker's primary key)
  if (!ci && opts?.agentId) {
    ci = await tx.cmdbConfigurationItem.findFirst({
      where: { tenantId, agentId: opts.agentId, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // NEW: dedup by hostname fallback (mirrors worker lines 292-305)
  if (!ci && snapshot.hostname) {
    ci = await tx.cmdbConfigurationItem.findFirst({
      where: { tenantId, hostname: snapshot.hostname, isDeleted: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!ci) {
    // D-08 orphan path — only reached when NOTHING matches
    // ... existing create ...
    // ALSO set agentId on the created CI so future lookups hit the fast path
  }
  // ...
}
```

2. `apps/api/src/routes/v1/agents/index.ts:470-478` — pass `agent.id` through:

```ts
extensionResult = await prisma.$transaction(async (tx) =>
  upsertServerExtensionByAsset(
    tx,
    agent.tenantId,
    assetIdForExt,
    snap,
    { source: 'agent', agentId: agent.id },
  ),
);
```

Additionally add a regression test to `inventory-ingestion.test.ts` asserting that a SECOND inventory POST with the same hostname returns the same `ciId` (i.e. does not create a new CI).

## Warnings

### WR-01: `upsertServerExtensionByAsset` orphan-create does not set `agentId` or `sourceSystem` on new CI

**File:** `apps/api/src/services/cmdb-extension.service.ts:140-152`

**Issue:**
When the service auto-creates a CI via the D-08 orphan path, the new `CmdbConfigurationItem` row is written with only `tenantId`, class/status/environment FKs, `ciNumber`, `name`, and `assetId`. It does NOT set `agentId`, `sourceSystem: 'agent'`, `sourceRecordKey: agentKey`, `firstDiscoveredAt`, or `lastSeenAt`. Compare to the reconciliation worker at `apps/worker/src/workers/cmdb-reconciliation.ts:327-370` which sets all of these.

Consequence: CIs created via the synchronous API path are indistinguishable from manually-created CIs. The `cmdb-reconciliation` worker's own lookup path (lines 287-290) filters by `agentId` — it will never match these API-created CIs, so it creates YET ANOTHER duplicate when it next runs. Together with CR-01 this compounds the duplication.

**Fix:**
Thread `opts.agentId` + `agentKey` through to the create payload, and populate the governance fields:

```ts
const created = await tx.cmdbConfigurationItem.create({
  data: {
    tenantId,
    classId,
    lifecycleStatusId,
    operationalStatusId,
    environmentId,
    ciNumber,
    name: snapshot.hostname || `unnamed-${ciNumber}`,
    assetId: resolvedAsset?.id ?? null,
    // NEW — mirror worker's governance fields
    agentId: opts?.agentId ?? null,
    sourceSystem: 'agent',
    sourceRecordKey: opts?.agentKey ?? null,
    hostname: snapshot.hostname ?? null,
    firstDiscoveredAt: new Date(),
    lastSeenAt: new Date(),
  },
  select: { id: true },
});
```

### WR-02: Software report `ciClassKey` filter does not scope the nested join by `tenantId`

**File:** `apps/api/src/services/report.service.ts:505-509`

**Issue:**
The filter builder adds:
```ts
...(filters.ciClassKey && {
  ci: { ciClass: { classKey: filters.ciClassKey } },
}),
```

The outer `where.tenantId` correctly scopes `cmdb_software_installed`, and the `ciId` FK enforces referential integrity with the CI, but the nested `ci.ciClass` traversal does NOT carry a tenantId. If a future regression produces a cross-tenant `cmdbCiClass` row (same `classKey`, different tenant — currently prevented by the `@@unique([tenantId, classKey])` constraint) the join would match. Defense in depth recommends scoping the nested joins.

**Fix:**
```ts
...(filters.ciClassKey && {
  ci: { tenantId, ciClass: { tenantId, classKey: filters.ciClassKey } },
}),
```

Same posture as the CMDB service pattern. Low likelihood exploit today, but free to add.

### WR-03: Backfill does not populate `ci.hostname` from `asset.hostname` on orphan-create

**File:** `packages/db/scripts/phase8-backfill.ts:330-343`

**Issue:**
When the backfill auto-creates an orphan CI (line 331-343), it sets `name: asset.hostname || \`unnamed-asset-${asset.id.slice(0, 8)}\`` but does not set `hostname` on the CI. Per the field-ownership contract documented in the schema (`cmdb_configuration_items.hostname`), the CI owns hostname post-Phase 8. The backfill leaves hostname `NULL` on the new CI even when the Asset carried it.

Consequence: after Wave 5 drops `assets.hostname`, queries like the AI example `SELECT ci.hostname FROM cmdb_configuration_items ci JOIN ...` return NULL for backfilled orphan CIs. The TechnicalProfilePanel UI falls back to `ext?.hostname` (which IS set), but search and list views that rely on `ci.hostname` miss these CIs.

**Fix:**
```ts
const created = await tx.cmdbConfigurationItem.create({
  data: {
    tenantId,
    classId: classRow[0].id,
    // ...
    name: asset.hostname || `unnamed-asset-${asset.id.slice(0, 8)}`,
    hostname: asset.hostname ?? null, // NEW
    assetId: asset.id,
  },
  // ...
});
```

### WR-04: Grep gate pattern too lax — will not catch `response.hostname` or similar CI-derived reads

**File:** `packages/db/scripts/phase8-grep-gate.sh:57`

**Issue:**
The web-app check enforces `asset\.(hostname|...)` which ONLY matches literal `asset.<field>` property accesses. This is intentional per the file comment, but it misses common rename patterns:

- Destructured reads: `const { hostname } = asset;` followed by `hostname` use — not detected.
- Spread rewrites: `const rec = { ...asset }; rec.hostname` — not detected.
- JSON-body mutations: `body.hostname` when `body` came from Asset form fetch.

Similarly, the service-layer check `data\.(hostname|...)` and `asset\.(hostname|...)` will miss type-narrowed aliases.

**Fix:**
This is acknowledged in the file comment as "the literal prefix 'asset.' is the Pitfall 6 signal" — a Warning-level item because it's an intentional trade-off. Optional hardening: add TypeScript interface checks in CI that import `AssetDetail` type and check it has zero properties matching `/^(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)$/`. A `tsc --noEmit` pass against the web app is already the strongest defense — no change required if that runs in CI.

## Info

### IN-01: `ASSET_FIELD_MAP` is dead code

**File:** `packages/db/scripts/phase8-backfill.ts:172-185`

**Issue:**
`ASSET_FIELD_MAP` is defined but every consumer uses `HARDWARE_FIELDS` directly; the `void ASSET_FIELD_MAP` on line 185 silences the unused-variable lint. The map is effectively documentation comments but lives in code.

**Fix:**
Move the CI-side-name → Asset-side-name mapping into a `//` comment block above `HARDWARE_FIELDS`, or actually reference `ASSET_FIELD_MAP[field]` in the `fieldPairs` array to make the mapping authoritative. Preferred:

```ts
const fieldPairs: Array<[(typeof HARDWARE_FIELDS)[number], unknown, unknown]> = HARDWARE_FIELDS.map(
  (ciField) => [
    ciField,
    existingExt?.[ciField as keyof typeof existingExt] ?? null,
    asset[ASSET_FIELD_MAP[ciField] as keyof typeof asset],
  ],
);
```

That makes the map load-bearing instead of void-cast.

### IN-02: Worker's stale-CI sweep still reads legacy `status: 'ACTIVE'` enum

**File:** `apps/worker/src/workers/cmdb-reconciliation.ts:640`

**Issue:**
```ts
const staleCIs = await prisma.cmdbConfigurationItem.findMany({
  where: {
    agentId: { not: null },
    status: 'ACTIVE',      // legacy enum column
    isDeleted: false,
    lastSeenAt: { lt: staleThreshold },
  },
  // ...
});
```

CIs created via the reference-FK-only path (Phase 7 Wave 5 onward, and per this Phase 8 reroute) may have `status` at the default enum value `ACTIVE` incidentally, but the worker relies on that default — not intentional FK state. The comment on line 634-636 says Phase 14 rewrites this to `JOIN cmdb_statuses ON operationalStatusId`. Out of scope for Phase 8, called out here as a forward-compat pin.

**Fix:**
Tracked; no change in Phase 8. Ensure the Phase 14 tracking issue references `cmdb-reconciliation.ts:640`.

### IN-03: Inconsistent `storageGb` handling between API route and worker

**File:** `apps/api/src/routes/v1/agents/index.ts:461` vs `apps/worker/src/workers/cmdb-reconciliation.ts:323-324`

**Issue:**
The API route builds `storageGb: null` (line 461) in the `AgentInventorySnapshot` passed to the service, losing the disk totals. The worker computes `totalStorageGb` via `computeTotalStorageGb(snapshot.disks)` and persists it. After the service runs, the CI extension has `storageGb: null` for that upsert; the next worker run fixes it. Minor data-freshness gap.

**Fix:**
Compute `storageGb` in the route from `hw.disks` before building the snapshot:

```ts
function computeTotalStorageGb(disks: unknown): number | null {
  if (!Array.isArray(disks)) return null;
  // ... mirror worker's helper ...
}

const snap: AgentInventorySnapshot = {
  // ...
  storageGb: computeTotalStorageGb(hw.disks),
  // ...
};
```

Or extract the helper to a shared package. Low-priority style/consistency — the next 15-minute reconciler run corrects it.

### IN-04: `test-helpers.ts` `mockPrisma: Record<string, any>` uses broad `any` typing

**File:** `apps/api/src/__tests__/test-helpers.ts:20-21, 55`

**Issue:**
The shared helper's return type uses `Record<string, any>` for `mockPrisma` and `any` for transaction callback args. Test code is less strict than prod, but the project's vitest + TS config could catch mis-typed mocks earlier.

**Fix:**
Replace with `Record<string, unknown>` or define a narrow `MockPrisma` interface. Not blocking.

### IN-05: `inventory-ingestion.test.ts` assertion name is misleading

**File:** `apps/api/src/__tests__/inventory-ingestion.test.ts:158`

**Issue:**
The test title is `'POST /agents/inventory writes to CmdbCiServer not Asset (assetId always null in Wave 5)'` — and it asserts `body.ciId === 'ci-1'`. But because `assetId` is always null (per the route comment), the `txCIFindFirst` return value of `{ id: 'ci-1' }` is never consulted — see CR-01. The test passes for a different reason than the title claims: the orphan-create path fell through and happened to return `'ci-1'` because `txCICreate.mockResolvedValue(...)` wasn't configured, so Fastify likely returned an unexpected shape.

**Fix:**
After fixing CR-01, this test should be split into two:
- "existing CI by agentId → reuse" — pre-seeds a CI with `agent.id`, asserts no new CI is created
- "no matching CI → orphan create" — asserts exactly one CI is created and carries `agentId`

See CR-01 for the full recommendation.

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
