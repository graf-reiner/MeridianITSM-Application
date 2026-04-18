---
phase: 8
slug: retire-asset-hardware-os-duplication
type: pattern-map
created: 2026-04-17
status: draft
---

# Phase 8: Retire Asset Hardware/OS Duplication — Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 28 (15 modify, 13 create)
**Analogs found:** 28 / 28 (100% — every file maps to an in-tree analog; most reuse Phase 7 directly)

> Pattern source for all Phase 8 plans. Each plan must reference the analog file + line numbers below rather than inventing new conventions. Phase 8 reuses **every** infrastructure helper Phase 7 introduced — the planner work is mostly **wiring**, not invention. **All file paths absolute relative to the repo root** `C:\Users\greiner\OneDrive\ClaudeAI\MeridianITSM-Application\`.

---

## File Classification

### Files to MODIFY (15)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `packages/db/prisma/schema.prisma` (Asset @ 1708-1717; CmdbCiServer @ 2426-2450) | schema | DDL | itself (additive: `CmdbSoftwareInstalled` mirrors Model 51 `CmdbCiApplication` shape) | exact (self-modification) |
| `apps/api/src/services/asset.service.ts` (lines 26-70, 122-130, 198, 262-270) | service | CRUD | itself (current shape) — strip 10 fields from `CreateAssetData`/`UpdateAssetData` interfaces + create/update bodies | exact (self) |
| `apps/api/src/services/cmdb.service.ts` (extension-write addition site) | service | request-response (write path) | itself + `cmdb-reference-resolver.service.ts` resolver caller pattern (Phase 7 PATTERNS sections 4-5) | exact (self) |
| `apps/api/src/services/ai-schema-context.ts` (line 95 `assets` block; line 171 `cmdb_ci_servers`) | config (static DDL doc) | n/a | itself + Phase 7 PATTERNS section 10 (JOIN-hint comment template) | exact (self) |
| `apps/api/src/services/portal-schema-context.ts` (lines 13-26) | config (static DDL doc) | n/a | itself (Phase 7 audit-comment block at lines 17-26) | exact (self) |
| `apps/api/src/routes/v1/agents/index.ts` (lines 338-434, the `/api/v1/agents/inventory` handler) | route | request-response (event ingestion) | itself (existing `inventorySnapshot.create` block) + `cmdb.service.ts:createCI` post-Phase-7 service-call pattern | exact (self — call new service after snapshot.create) |
| `apps/api/src/routes/v1/assets/index.ts` (POST body @ 48-56, 80-88; PUT body @ 188-196) | route | request-response | itself (existing extractor pattern) — strip 10 field assignments | exact (self) |
| `apps/api/src/routes/v1/cmdb/index.ts` (NEW: `PATCH /cmdb/cis/:id` body `{ assetId }` if not present) | route | request-response | `apps/api/src/routes/v1/cmdb/index.ts` existing PATCH/PUT routes | exact (self — add one route to file) |
| `apps/api/src/services/report.service.ts` (lines 39-57; 65 `getDashboardStats` shape) | service | CRUD (read-only report) | itself — `getTicketReport(tenantId, filters)` is the in-file template for "tenant-scoped report function returning `{ data, count }`" | exact (self — extend) |
| `apps/api/src/__tests__/asset-service.test.ts` | test (unit, Vitest) | mocked Prisma | itself (extend) — current tests reference dropped fields; Phase 8 strips them and adds negative assertions | exact (self) |
| `apps/api/src/__tests__/ai-schema-context.test.ts` | test (unit, Vitest) | static-import + assertion | itself (Phase 7 file extension; identical test shape) | exact (self) |
| `apps/api/src/__tests__/portal-context.test.ts` | test (unit, Vitest) | static-import + assertion | itself (Phase 7 file extension; identical test shape) | exact (self) |
| `apps/api/src/__tests__/portal-ai-sql-executor.test.ts` | test (unit, Vitest) | mocked Prisma + executor invocation | itself (Phase 7 file; extend with cmdb_software_installed + cmdb_migration_audit rejection cases) | exact (self) |
| `apps/worker/src/workers/cmdb-reconciliation.ts` (lines 318-332, 437-462) | worker | event-driven | itself (Phase 7 modified lines 187-189, 433; Phase 8 extends the CmdbCiServer upsert + adds software upsert loop) | exact (self) |
| `apps/web/src/app/dashboard/assets/[id]/page.tsx` (interface @ 29-58; render rows ~397, 605) | page (Next.js client component) | request-response (TanStack Query) | `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557, 580-587, 784-810` (canonical TAB_DEFS + tab nav + useQuery) | role-match (Phase 8 introduces FIRST tab structure to Asset page) |

### Files to CREATE (13)

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `packages/db/prisma/migrations/{ts}_phase8_extension_and_audit_tables/migration.sql` | migration (additive) | DDL | `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:62-110` (Prisma-generated body section) | role-match (no pre-flight needed — additive only) |
| `packages/db/prisma/migrations/{ts}_phase8_drop_asset_tech_columns/migration.sql` | migration (destructive) | DDL + pre-flight `DO $$` block | `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:1-60` (pre-flight DO + RAISE EXCEPTION) | exact |
| `packages/db/scripts/phase8-backfill.ts` | script (one-shot batch) | per-tenant raw SQL read + transaction write | `packages/db/scripts/phase7-backfill.ts` (full file, 381 lines) | exact |
| `packages/db/scripts/phase8-verify.ts` | script (one-shot read-only) | per-tenant `$queryRaw` count + introspection | `packages/db/scripts/phase7-verify.ts` (full file, 100 lines) | exact |
| `packages/db/scripts/phase8-grep-gate.sh` | script (CI gate) | static grep | `packages/db/scripts/phase7-grep-gate.sh` (full file, 78 lines) | exact |
| `apps/api/src/services/cmdb-extension.service.ts` (NEW — houses `upsertServerExtensionByAsset`) | service (helper) | request-response | `apps/api/src/services/cmdb-reference-resolver.service.ts` (file structure) + `apps/api/src/services/cmdb.service.ts:createCI` (orphan-create + advisory-lock pattern) | role-match |
| `apps/api/src/routes/v1/cmdb/cis/[id]/software.ts` (NEW: `GET /api/v1/cmdb/cis/:id/software`) | route | request-response | `apps/api/src/routes/v1/reports/index.ts:29-62` (Fastify GET pattern with tenantId extraction) | role-match |
| `apps/api/src/routes/v1/reports/software-installed.ts` (NEW: license report) | route | request-response | `apps/api/src/routes/v1/reports/index.ts:29-62` | exact |
| `apps/api/src/__tests__/cmdb-extension.test.ts` (NEW) | test (unit, Vitest) | mocked Prisma transaction | `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (vi.hoisted + vi.mock + prismaTransaction mock) | exact |
| `apps/api/src/__tests__/inventory-ingestion.test.ts` (NEW — integration) | test (integration, Vitest) | route invocation + DB assertions | `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (mock structure) | role-match |
| `apps/web/src/components/cmdb/CIPicker.tsx` (NEW) | component (React client) | request-response (`fetch`) | `apps/web/src/components/VendorPicker.tsx` (full file, ~110 lines) | exact |
| `apps/web/tests/asset-technical-profile.spec.ts` (NEW) | test (E2E, Playwright) | UI render + API intercept | `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` + Phase 7 PATTERNS section 20 | exact |
| `apps/web/tests/asset-link-ci.spec.ts` (NEW) | test (E2E, Playwright) | UI render + click + API intercept | `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` | exact |
| `apps/web/tests/asset-edit-no-tech-fields.spec.ts` (NEW — negative) | test (E2E, Playwright) | UI render + negative assertion | `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` | exact |

> **Note:** `packages/db/src/seeds/cmdb-reference.ts` is listed in VALIDATION.md as a Wave 0 sanity re-run target, not a modify target. The seed function itself is unchanged for Phase 8.

---

## Pattern Assignments

### 1. `packages/db/prisma/schema.prisma` (MODIFY — additive: 2 new models + 3 new CmdbCiServer columns; destructive: drop 10 Asset columns)

**Analog (additive new models):** `packages/db/prisma/schema.prisma:2425-2450` (Model 50 `CmdbCiServer` shape) + `packages/db/prisma/schema.prisma:2452-2469` (Model 51 `CmdbCiApplication` — for the relation/index/`@@map` template)

**Pattern: Tenant-scoped extension table with FK + cascade + indexes** (verbatim from `CmdbCiServer:2426-2450`):
```prisma
model CmdbCiServer {
  ciId                   String   @id @db.Uuid
  tenantId               String   @db.Uuid
  // ... fields ...
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  ci             CmdbConfigurationItem  @relation(fields: [ciId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("cmdb_ci_servers")
}
```

**Phase 8 NEW models** (Wave 1 additive — RESEARCH Pattern 3, verbatim):
```prisma
model CmdbSoftwareInstalled {
  id          String    @id @default(uuid()) @db.Uuid
  tenantId    String    @db.Uuid
  ciId        String    @db.Uuid
  name        String
  version     String
  vendor      String?
  publisher   String?
  installDate DateTime?
  source      String                                     // 'agent' | 'manual' | 'import' (D-05)
  licenseKey  String?
  lastSeenAt  DateTime  @default(now())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tenant Tenant                @relation(fields: [tenantId], references: [id])
  ci     CmdbConfigurationItem @relation(fields: [ciId], references: [id], onDelete: Cascade)

  @@unique([ciId, name, version])     // D-06
  @@index([tenantId])
  @@index([tenantId, name])           // license reporting
  @@index([ciId])
  @@index([tenantId, lastSeenAt])     // stale cleanup
  @@map("cmdb_software_installed")
}

model CmdbMigrationAudit {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  tableName  String
  recordId   String
  fieldName  String
  oldValue   String?
  newValue   String?
  status     String                                    // 'overwritten_by_ci' | etc.
  phase      String                                    // 'phase8' | 'phase9' | ...
  createdAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([tenantId, phase])
  @@index([tenantId, tableName, recordId])
  @@index([tenantId, createdAt])      // retention queries (Pitfall 4)
  @@map("cmdb_migration_audit")
}
```

**Phase 8 ADDITIVE columns on existing `CmdbCiServer`** (after line 2436, before `domainName`):
```prisma
  cpuModel              String?    // Phase 8 (CASR-02)
  disksJson             Json?      // Phase 8 (verbatim move from Asset.disks)
  networkInterfacesJson Json?      // Phase 8 (verbatim move from Asset.networkInterfaces)
```

**Phase 8 DESTRUCTIVE drops** (Wave 5 — `Asset` model at lines 1708-1717; remove these 10 fields):
- `hostname`, `operatingSystem`, `osVersion`, `cpuModel`, `cpuCores`, `ramGb`, `disks`, `networkInterfaces`, `softwareInventory`, `lastInventoryAt`

**Reverse relations to add:**
- `CmdbConfigurationItem` gains `softwareInstalled CmdbSoftwareInstalled[]`
- `Tenant` gains `cmdbSoftwareInstalled CmdbSoftwareInstalled[]` and `cmdbMigrationAudit CmdbMigrationAudit[]`

---

### 2. `packages/db/prisma/migrations/{ts}_phase8_extension_and_audit_tables/migration.sql` (NEW — Wave 1 additive)

**Analog:** Prisma-generated migration body (e.g., `20260417215217_phase7_ci_ref_notnull/migration.sql:62-110` — the section below the pre-flight DO blocks)

**Generation command:**
```bash
pnpm --filter @meridian/db prisma migrate dev --create-only --name phase8_extension_and_audit_tables
```

**No manual additions required** — the migration is purely additive (CREATE TABLE + ALTER TABLE ADD COLUMN). Per RESEARCH A5, `ALTER TABLE ADD COLUMN` with no DEFAULT is metadata-only in Postgres 11+ → instant on production-scale tables. No pre-flight gate needed for additive migrations.

---

### 3. `packages/db/prisma/migrations/{ts}_phase8_drop_asset_tech_columns/migration.sql` (NEW — Wave 5 destructive)

**Analog:** `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:1-60` (the two `DO $$` pre-flight blocks)

**Pattern: Pre-flight DO block with RAISE EXCEPTION before destructive DDL** (verbatim shape from Phase 7 file):
```sql
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
          OR a."ramGb" IS NOT NULL
          OR a."softwareInventory" IS NOT NULL)
     AND srv."ciId" IS NULL;
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

**Generation command:** `pnpm --filter @meridian/db prisma migrate dev --create-only --name phase8_drop_asset_tech_columns` then prepend the `DO $$` block manually.

---

### 4. `packages/db/scripts/phase8-backfill.ts` (NEW — Wave 2 per-tenant backfill)

**Analog:** `packages/db/scripts/phase7-backfill.ts` (full file, 381 lines)

**Imports + Prisma adapter setup** (verbatim from `phase7-backfill.ts:28-37`):
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes('--dry-run');
```

**Per-tenant raw-SQL read pattern** (RESEARCH Example 1 + Pattern 1 — chicken-and-egg avoidance):
```typescript
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

**Conflict-logging pattern (D-01 CI wins silently)** — call `tx.cmdbMigrationAudit.create(...)` for every conflicting field, batched via `createMany({ data: [...], skipDuplicates: true })` per RESEARCH Pitfall 4:
```typescript
const auditRows: Prisma.CmdbMigrationAuditCreateManyInput[] = [];
for (const field of HARDWARE_FIELDS) {
  const ciValue = existingExt?.[field];
  const assetValue = asset[ASSET_FIELD_MAP[field]];
  if (ciValue != null && assetValue != null && String(ciValue) !== String(assetValue)) {
    auditRows.push({
      tenantId, tableName: 'assets', recordId: asset.id,
      fieldName: field, oldValue: String(assetValue),
      newValue: String(ciValue), status: 'overwritten_by_ci', phase: 'phase8',
    });
  }
}
if (auditRows.length > 0 && !DRY_RUN) {
  await tx.cmdbMigrationAudit.createMany({ data: auditRows, skipDuplicates: true });
}
```

**Software JSON shape defense** (RESEARCH Pitfall 8):
```typescript
function parseSoftwareList(blob: unknown): Array<{ name: string; version: string; vendor?: string | null; publisher?: string | null; installDate?: string | null }> {
  if (!blob) return [];
  if (Array.isArray(blob)) return blob.filter((item) => item && typeof item === 'object' && 'name' in item);
  if (typeof blob === 'object' && blob !== null && 'apps' in blob && Array.isArray((blob as { apps: unknown[] }).apps)) {
    return (blob as { apps: Array<{ name: string; version: string }> }).apps;
  }
  // Unparseable — log to audit and skip
  return [];
}
```

**Multi-tenancy posture:** Every query passes `where: { tenantId }`; the per-tenant for-loop is single-tenant at any moment; never batches across tenants. Verified by direct read of `phase7-backfill.ts:194-263`.

---

### 5. `packages/db/scripts/phase8-verify.ts` (NEW — Wave 0 + Wave 5 verification gate)

**Analog:** `packages/db/scripts/phase7-verify.ts` (full file, 100 lines) + Phase 7 PATTERNS section 13

**Imports + setup pattern** — same as `phase8-backfill.ts` above.

**Per-tenant verification query** (RESEARCH Example 4):
```typescript
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
    (SELECT COUNT(*) FROM cmdb_configuration_items
        WHERE "tenantId" = t.id AND "assetId" IS NOT NULL) AS ci_count,
    (SELECT COUNT(*) FROM cmdb_ci_servers WHERE "tenantId" = t.id) AS ext_count,
    (SELECT COUNT(*) FROM cmdb_software_installed WHERE "tenantId" = t.id) AS software_row_count,
    (SELECT COUNT(*) FROM cmdb_migration_audit
        WHERE "tenantId" = t.id AND status = 'overwritten_by_ci' AND phase = 'phase8') AS audit_overwrites
   FROM tenants t
`;
```

**Post-Wave-5 column-existence check** (introspection — uses Postgres `information_schema`):
```typescript
const droppedCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
  SELECT column_name FROM information_schema.columns
   WHERE table_name = 'assets'
     AND column_name IN ('hostname','operatingSystem','osVersion','cpuModel',
                         'cpuCores','ramGb','disks','networkInterfaces',
                         'softwareInventory','lastInventoryAt')
`;
if (droppedCheck.length > 0) {
  console.error(`x Wave 5 incomplete — these columns still exist on assets: ${droppedCheck.map(r => r.column_name).join(', ')}`);
  totalIssues += droppedCheck.length;
}
```

**Cross-tenant isolation check** (RESEARCH Security threat — V4):
```typescript
const xtenant = await prisma.$queryRaw<Array<{ leaked: bigint }>>`
  SELECT COUNT(*) AS leaked
    FROM cmdb_software_installed s
    JOIN cmdb_configuration_items ci ON s."ciId" = ci.id
   WHERE s."tenantId" <> ci."tenantId"
`;
if (Number(xtenant[0].leaked) > 0) {
  console.error(`x Cross-tenant leak: ${xtenant[0].leaked} cmdb_software_installed rows where ciId.tenantId != s.tenantId`);
}
```

---

### 6. `packages/db/scripts/phase8-grep-gate.sh` (NEW — Wave 0 setup, Wave 3 ENFORCE)

**Analog:** `packages/db/scripts/phase7-grep-gate.sh` (full file, 78 lines)

**Pattern (verbatim header + check function shape from `phase7-grep-gate.sh:1-27`):**
```bash
#!/usr/bin/env bash
# Phase 8 grep gate: ensure no code reads/writes the 10 dropped Asset hardware fields.
#
# Wave 0: WARN mode (PHASE8_GATE_ENFORCE=0)
# Wave 3+: ENFORCE mode (default PHASE8_GATE_ENFORCE=1) — exits non-zero on any hit
#
# Patterns are pinned to specific field names so a contributor cannot satisfy
# the gate by renaming a variable. Mirrors Phase 7 T-7-01-02 mitigation.

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
```

**Phase 8-specific checks** (RESEARCH Example 3):
```bash
# Service layer
check "data\.(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/services/asset.service.ts
check "asset\.(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/services/asset.service.ts

# Routes
check "(hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces|softwareInventory|lastInventoryAt)" \
      apps/api/src/routes/v1/assets/index.ts

# Worker (must NOT write Asset hardware fields — Pitfall 5)
check "prisma\.asset\.(create|update|upsert)[\s\S]*hostname" \
      apps/worker/src/workers/cmdb-reconciliation.ts

# Web app (Pitfall 6)
check "  (hostname|operatingSystem|osVersion|cpuModel|cpuCores|ramGb|disks|networkInterfaces):" \
      apps/web/src/app/dashboard/assets/\[id\]/page.tsx

if [ "$FAIL" -ne 0 ]; then
  if [ "$ENFORCE" = "1" ]; then
    echo "x Phase 8 grep gate FAILED — dropped Asset fields still referenced"
    exit 1
  fi
  echo "! Phase 8 grep gate WARN — dropped Asset fields still referenced (expected in Waves 0-2)"
  exit 0
fi
echo "ok Phase 8 grep gate PASSED"
```

---

### 7. `apps/api/src/services/cmdb-extension.service.ts` (NEW — `upsertServerExtensionByAsset`)

**Analog (file structure):** `apps/api/src/services/cmdb-reference-resolver.service.ts` (full file, 117 lines — single-purpose service module exporting tenant-scoped functions)

**Analog (orphan-create + advisory-lock body):** `apps/api/src/services/cmdb.service.ts:createCI` body (lines ~223-287 per Phase 7 PATTERNS section 5) — the existing `pg_advisory_xact_lock` pattern for `ciNumber` allocation

**Analog (resolver use):** Phase 7 PATTERNS section 4 (existing `resolveClassId / resolveLifecycleStatusId / resolveOperationalStatusId / resolveEnvironmentId` are imported, NOT duplicated — this service runs in `apps/api`, so it imports directly from `cmdb-reference-resolver.service.ts`)

**Imports (from RESEARCH Pattern 4):**
```typescript
import type { Prisma } from '@meridian/db';
import {
  resolveClassId,
  resolveLifecycleStatusId,
  resolveOperationalStatusId,
  resolveEnvironmentId,
} from './cmdb-reference-resolver.service.js';
```

**Inline duplication of `inferClassKeyFromSnapshot`** (per CONTEXT decision Claude's Discretion — reuse the worker's heuristic; project's no-cross-app-import precedent means duplicating from worker into API is acceptable; this is the OPPOSITE direction of OPTION B but is the standard pattern for "API needs a worker helper":
```typescript
// Duplicated from apps/worker/src/workers/cmdb-reconciliation.ts:17-42
// per the project's no-cross-app-import convention. Keep in sync with the worker copy.
function inferClassKeyFromSnapshot(
  platform: string | null,
  hostname: string | null,
  operatingSystem: string | null,
): { classKey: string; legacyType: string } {
  // ... copy verbatim from worker (lines 22-42)
}
```

**Service signature (D-07 + RESEARCH Pattern 4):**
```typescript
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
    name: string; version: string;
    vendor?: string | null; publisher?: string | null;
    installDate?: string | null;
  }> | null;
}

export interface UpsertServerExtensionResult {
  ciId: string;
  created: boolean;          // true if a new CI was auto-created (D-08)
}

/**
 * Phase 8 (CASR-06, D-07, D-08): translate an agent-shaped inventory snapshot
 * into CMDB writes. Asset is NEVER touched by this path.
 *
 * Multi-tenancy: every prisma call inside this function MUST include tenantId.
 * Asset lookup is by (id, tenantId) — cross-tenant assetId returns null and throws.
 */
export async function upsertServerExtensionByAsset(
  tx: Prisma.TransactionClient,
  tenantId: string,
  assetId: string | null,
  snapshot: AgentInventorySnapshot,
  opts?: { source?: 'agent' | 'manual' | 'import' },
): Promise<UpsertServerExtensionResult> {
  // ... implementation per RESEARCH System Architecture Diagram lines 186-228
}
```

**Resolver-failure error pattern (Pitfall 7)** — mirror `cmdb-reconciliation.ts:216-225`:
```typescript
const classId = await resolveClassId(tenantId, classKey);
if (!classId) {
  throw new Error(
    `Phase 8: missing reference data for tenant ${tenantId} (classKey='${classKey}'). ` +
    `Run: pnpm tsx packages/db/scripts/seed-existing-tenants-cmdb-ref.ts`,
  );
}
```

**Software-version normalization (Pitfall 3):**
```typescript
const normalizedVersion = (item.version ?? '').trim() || 'unknown';
```

---

### 8. `apps/api/src/routes/v1/agents/index.ts` (MODIFY — call `upsertServerExtensionByAsset` after `inventorySnapshot.create`)

**Analog:** `apps/api/src/routes/v1/agents/index.ts:338-434` (existing `/api/v1/agents/inventory` handler)

**Imports to add at top of file:**
```typescript
import { upsertServerExtensionByAsset, type AgentInventorySnapshot } from '../../../services/cmdb-extension.service.js';
import { prisma } from '@meridian/db';
```

**Insertion site:** between line 420 (`}});` closing `inventorySnapshot.create`) and line 422 (`// Auto-trigger CMDB reconciliation`):

```typescript
    // Phase 8 (D-07 + CASR-06): synchronously translate snapshot to CMDB writes.
    // Asset is NEVER touched by this path. Orphan Asset (no linked CI) is
    // auto-created per D-08 inside upsertServerExtensionByAsset.
    let extensionResult: { ciId: string; created: boolean } | null = null;
    try {
      // Look up Asset by (hostname, tenantId) — agent.hostname is the canonical link.
      // The Asset.id may be null for an unmanaged endpoint; null is the orphan signal.
      const asset = await prisma.asset.findFirst({
        where: { tenantId: agent.tenantId, hostname: snapshot.hostname ?? agent.hostname },
        select: { id: true },
      });

      const snap: AgentInventorySnapshot = {
        hostname: snapshot.hostname,
        fqdn: snapshot.fqdn,
        operatingSystem: snapshot.operatingSystem,
        osVersion: snapshot.osVersion,
        cpuCount: snapshot.cpuCores,        // map agent's cpuCores -> CmdbCiServer.cpuCount
        cpuModel: snapshot.cpuModel,
        ramGb: snapshot.ramGb,
        storageGb: null,
        disks: snapshot.disks,
        networkInterfaces: snapshot.networkInterfaces,
        domainName: snapshot.domainName,
        hypervisorType: snapshot.hypervisorType,
        isVirtual: snapshot.isVirtual,
        installedSoftware: snapshot.installedSoftware as never,
      };

      extensionResult = await prisma.$transaction(async (tx) =>
        upsertServerExtensionByAsset(tx, agent.tenantId, asset?.id ?? null, snap, { source: 'agent' }),
      );
    } catch (err) {
      // Surface but don't fail the snapshot ingest — async worker is the backstop.
      request.log.error({ err, snapshotId: snapshot.id }, 'upsertServerExtensionByAsset failed');
    }
```

**Reply shape extension** (line 433):
```typescript
    return reply.code(201).send({
      snapshotId: snapshot.id,
      ciId: extensionResult?.ciId ?? null,
      created: extensionResult?.created ?? false,
    });
```

**Multi-tenancy posture (canonical):** `agent.tenantId` is the locked tenant context (set by AgentKey resolution at line 339); every Prisma call uses it. The Asset lookup filters `where: { tenantId: agent.tenantId, ... }` — verified, never `findUnique({ where: { id } })`.

---

### 9. `apps/api/src/services/asset.service.ts` (MODIFY — strip 10 fields from interfaces + bodies)

**Analog:** itself (current shape at lines 26-70 for interfaces, 122-130 + 262-270 for body assignments)

**Removal targets** (delete from `CreateAssetData` interface, lines 37-46):
```typescript
// REMOVE:
hostname?: string;
operatingSystem?: string;
osVersion?: string;
cpuModel?: string;
cpuCores?: number;
ramGb?: number;
disks?: unknown;
networkInterfaces?: unknown;
softwareInventory?: unknown;
```

**Removal targets** (delete from `UpdateAssetData` interface, lines 60-68):
```typescript
// REMOVE: same 9 fields (no `lastInventoryAt` here — it's in the model only, not in this interface today)
```

**Removal targets** (delete from `createAsset` body, lines 122-130):
```typescript
// REMOVE these 9 lines:
hostname: data.hostname,
operatingSystem: data.operatingSystem,
osVersion: data.osVersion,
cpuModel: data.cpuModel,
cpuCores: data.cpuCores,
ramGb: data.ramGb,
disks: data.disks as any,
networkInterfaces: data.networkInterfaces as any,
softwareInventory: data.softwareInventory as any,
```

**`listAssets` search filter (line 198)** — `hostname` is currently part of the search predicate. Change to a JOIN through `cmdb_configuration_items` on `assetId`:
```typescript
// BEFORE (search predicate today):
where: { tenantId, OR: [{ assetTag: { contains: search } }, { hostname: { contains: search } }, ...] }

// AFTER (Phase 8):
where: {
  tenantId,
  OR: [
    { assetTag: { contains: search, mode: 'insensitive' } },
    { serialNumber: { contains: search, mode: 'insensitive' } },
    { cmdbConfigItems: { some: { hostname: { contains: search, mode: 'insensitive' } } } },
  ],
},
```

---

### 10. `apps/api/src/routes/v1/assets/index.ts` (MODIFY — strip 10 fields from POST/PUT extractors)

**Analog:** itself (lines 48-56, 80-88, 188-196 — existing extractor pattern)

**Pattern: matching the strip in `asset.service.ts`** — the route currently extracts the 10 hardware fields from `request.body` and forwards to the service. With service-layer interfaces stripped, the extractors become dead code.

**Removal targets** in POST handler (~lines 48-56):
```typescript
// REMOVE these 9 lines from the request.body extractor:
hostname,
operatingSystem,
osVersion,
cpuModel,
cpuCores,
ramGb,
disks,
networkInterfaces,
softwareInventory,
```

**Removal targets** in PUT handler (~lines 188-196): same 9 lines.

**Auth pattern (existing — preserve)** — `request.user as { tenantId, userId }` extraction at the top of each handler. Verified in CMDB route Phase 7 PATTERNS section 9.

---

### 11. `apps/api/src/services/cmdb.service.ts` (MODIFY — register `upsertServerExtensionByAsset` IF planner chooses to colocate; otherwise no change to this file)

**Decision (per RESEARCH Architectural Responsibility Map):** `upsertServerExtensionByAsset` lives in a new `cmdb-extension.service.ts` (section 7 above) — clean separation. `cmdb.service.ts` requires NO Phase 8 modification.

**Audit only:** verify `cmdb.service.ts:createCI` advisory-lock pattern (`pg_advisory_xact_lock`) is exported in a way the new extension service can mirror. If not, the new service inlines its own copy (already established pattern).

---

### 12. `apps/worker/src/workers/cmdb-reconciliation.ts` (MODIFY — extend CmdbCiServer upsert + add software loop)

**Analog:** itself (existing CmdbCiServer upsert at lines 318-332 and 437-462; resolver pattern at lines 60-110 already in place)

**OPTION B compliance:** the worker does NOT import from `@meridian/api`. The resolver helpers are already inline-duplicated (lines 60-110). Phase 8 does NOT change this convention — if the worker needs the `parseSoftwareList` helper, it duplicates inline:
```typescript
// Duplicated from apps/api/src/services/cmdb-extension.service.ts
// per the project's no-cross-app-import convention. Keep in sync.
function parseSoftwareList(blob: unknown): Array<{ name: string; version: string; vendor?: string | null; publisher?: string | null; installDate?: string | null }> {
  // ... copy verbatim
}
```

**Extend existing CmdbCiServer upsert** (around lines 318-332) to write the new fields:
```typescript
// In the existing tx.cmdbCiServer.upsert({...}) call, ADD:
data: {
  // ... existing fields ...
  cpuModel: snapshot.cpuModel,                      // Phase 8 NEW
  disksJson: snapshot.disks as never,               // Phase 8 NEW
  networkInterfacesJson: snapshot.networkInterfaces as never,  // Phase 8 NEW
}
```

**ADD software upsert loop** (NEW — no current analog inline; closest pattern is the `cmdbChangeRecord` per-field loop later in the same file):
```typescript
// Phase 8: write cmdb_software_installed rows for each item in snapshot.installedSoftware
const softwareList = parseSoftwareList(snapshot.installedSoftware);
for (const item of softwareList) {
  const normalizedVersion = (item.version ?? '').trim() || 'unknown';
  await tx.cmdbSoftwareInstalled.upsert({
    where: { ciId_name_version: { ciId: ci.id, name: item.name, version: normalizedVersion } },
    create: {
      tenantId, ciId: ci.id, name: item.name, version: normalizedVersion,
      vendor: item.vendor ?? null, publisher: item.publisher ?? null,
      installDate: item.installDate ? new Date(item.installDate) : null,
      source: 'agent', lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
      vendor: item.vendor ?? undefined,
      publisher: item.publisher ?? undefined,
    },
  });
}
```

---

### 13. `apps/api/src/services/ai-schema-context.ts` (MODIFY — strip 10 cols from `assets`; add `cmdb_software_installed`; extend `cmdb_ci_servers`)

**Analog:** itself (line 95 `assets` block; line 100 `applications` block as the template for "table with FK + JOIN hints"; line 171 `cmdb_ci_servers` block) + Phase 7 PATTERNS section 10 (the JOIN-hint comment template established in Phase 7)

**Phase 8 changes:**

**(a) Strip 10 fields from `assets` block (line 95):**
```
// BEFORE (current shape, abbreviated):
assets: id(uuid PK), "tenantId"(uuid FK→tenants), "assetTag"(text), serialNumber(text),
  manufacturer(text), model(text), hostname(text), "operatingSystem"(text),
  "osVersion"(text), "cpuModel"(text), "cpuCores"(int), "ramGb"(float), disks(json),
  "networkInterfaces"(json), "softwareInventory"(json), "lastInventoryAt"(timestamp), ...

// AFTER (Phase 8):
assets: id(uuid PK), "tenantId"(uuid FK→tenants), "assetTag"(text), serialNumber(text),
  manufacturer(text), model(text), status(...), "purchaseDate"(timestamp),
  "purchaseCost"(decimal), "warrantyExpiry"(timestamp), "assignedToId"(uuid FK→users),
  "siteId"(uuid FK→sites), "assetTypeId"(uuid FK→asset_types), notes(text), ...
  -- NOTE: As of Phase 8, hardware/OS/software details live on the linked CI side.
  --       To resolve hostname / operatingSystem / cpuCount / memoryGb for an Asset:
  --         JOIN cmdb_configuration_items ci ON ci."assetId" = assets.id
  --         JOIN cmdb_ci_servers srv ON srv."ciId" = ci.id
  --       For installed software:
  --         JOIN cmdb_configuration_items ci ON ci."assetId" = assets.id
  --         JOIN cmdb_software_installed s ON s."ciId" = ci.id
```

**(b) Extend `cmdb_ci_servers` block (line 171):**
```
cmdb_ci_servers: ciId(uuid PK FK→cmdb_configuration_items), "tenantId"(uuid FK→tenants),
  serverType(text), operatingSystem(text), osVersion(text), cpuCount(int),
  cpuModel(text),                       -- Phase 8 NEW
  memoryGb(float), storageGb(float),
  disksJson(json),                       -- Phase 8 NEW
  networkInterfacesJson(json),           -- Phase 8 NEW
  domainName(text), virtualizationPlatform(text), ...
```

**(c) ADD `cmdb_software_installed` block:**
```
cmdb_software_installed: id(uuid PK), "tenantId"(uuid FK→tenants),
  "ciId"(uuid FK→cmdb_configuration_items), name(text), version(text),
  vendor(text), publisher(text), "installDate"(timestamp),
  source(text — 'agent'|'manual'|'import'),
  -- NOTE: licenseKey is OMITTED from AI context (sensitive); reports surface
  --       it only via the CI-scoped /api/v1/cmdb/cis/:id/software endpoint
  --       with cmdb.view permission.
  "lastSeenAt"(timestamp), "createdAt"(timestamp), "updatedAt"(timestamp)
  -- License reporting: SELECT s.name, s.version, s.vendor, ci.name AS ci_name
  --                    FROM cmdb_software_installed s
  --                    JOIN cmdb_configuration_items ci ON s."ciId" = ci.id
  --                    WHERE s."tenantId" = $1 AND s.name ILIKE '%X%';
```

**(d) ADD `cmdb_migration_audit` to `EXCLUDED_TABLES`** (forensic data, possibly contains overwritten sensitive values per CONTEXT Open Q resolution):
```typescript
const EXCLUDED_TABLES = [
  // ... existing tables ...
  'cmdb_migration_audit',                // Phase 8: forensic conflict log; not user-queryable
];
```

---

### 14. `apps/api/src/services/portal-schema-context.ts` (MODIFY — extend Phase 7 audit comment with Phase 8 subsection)

**Analog:** itself (Phase 7 audit-comment block at lines 17-26; Phase 7 PATTERNS section 11)

**Phase 8 change** (insert below the existing Phase 7 comment, per RESEARCH CAI-02):
```typescript
// PHASE 7 audit (CAI-02 lock-in): CMDB tables (cmdb_*) are intentionally
// EXCLUDED from the portal AI. Staff-only data.
//
// PHASE 8 audit: cmdb_software_installed and cmdb_migration_audit are
// likewise EXCLUDED. The /\bcmdb_/i regex in portal-ai-sql-executor.ts
// already enforces this; portal-context.test.ts adds defense-in-depth
// assertion that PORTAL_ALLOWED_TABLES contains zero cmdb_* entries.
export const PORTAL_ALLOWED_TABLES: string[] = [
  // unchanged
];
```

---

### 15. `apps/api/src/services/report.service.ts` (MODIFY — add `getSoftwareInventoryReport`)

**Analog:** itself (line 39 `TicketReportFilters` interface as the in-file template for tenant-scoped filter types; `getDashboardStats` at line 65 as the tenant-scoped report function template)

**Imports** (already in file):
```typescript
import { prisma } from '@meridian/db';
```

**Add types + function (RESEARCH Pattern 5):**
```typescript
export interface SoftwareInventoryReportFilters {
  softwareName?: string;
  vendor?: string;
  publisher?: string;
  ciClassKey?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Phase 8 (CRIT-5): software-by-CI listing for license reporting.
 * Tenant-scoped via tenantId on cmdb_software_installed.
 * NOTE: licenseKey is intentionally OMITTED from this list response —
 *       the CI-scoped /api/v1/cmdb/cis/:id/software endpoint surfaces it
 *       with cmdb.view permission.
 */
export async function getSoftwareInventoryReport(
  tenantId: string,
  filters: SoftwareInventoryReportFilters = {},
): Promise<{ data: Array<{ ciId: string; ciName: string; ciNumber: number; classKey: string; name: string; version: string; vendor: string | null; publisher: string | null; lastSeenAt: Date }>; count: number }> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const skip = (page - 1) * pageSize;

  // Use Prisma findMany + relation include — keeps tenantId in WHERE
  const where = {
    tenantId,
    ...(filters.softwareName && { name: { contains: filters.softwareName, mode: 'insensitive' as const } }),
    ...(filters.vendor && { vendor: filters.vendor }),
    ...(filters.publisher && { publisher: filters.publisher }),
    ...(filters.ciClassKey && { ci: { ciClass: { classKey: filters.ciClassKey } } }),
  };

  const [rows, count] = await Promise.all([
    prisma.cmdbSoftwareInstalled.findMany({
      where,
      include: {
        ci: { select: { id: true, name: true, ciNumber: true, ciClass: { select: { classKey: true } } } },
      },
      orderBy: [{ ci: { name: 'asc' } }, { name: 'asc' }],
      skip, take: pageSize,
    }),
    prisma.cmdbSoftwareInstalled.count({ where }),
  ]);

  return {
    data: rows.map((r) => ({
      ciId: r.ciId, ciName: r.ci.name, ciNumber: r.ci.ciNumber,
      classKey: r.ci.ciClass.classKey,
      name: r.name, version: r.version, vendor: r.vendor, publisher: r.publisher,
      lastSeenAt: r.lastSeenAt,
    })),
    count,
  };
}
```

**Multi-tenancy posture:** `where.tenantId` is the FIRST predicate; never `findMany({ where: { name } })`. Verified by direct read of `report.service.ts:65-99` (existing pattern).

---

### 16. `apps/api/src/routes/v1/reports/software-installed.ts` (NEW — license report route)

**Analog:** `apps/api/src/routes/v1/reports/index.ts:29-62` (the `GET /api/v1/reports/tickets` route)

**Pattern (verbatim shape, adapted for software inventory):**
```typescript
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePermission } from '../../../plugins/rbac.js';
import { getSoftwareInventoryReport } from '../../../services/report.service.js';

export async function softwareInventoryReportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/reports/software-installed',
    { preHandler: requirePermission('reports.read') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { tenantId: string; userId: string };
      const { tenantId } = user;
      const query = request.query as { softwareName?: string; vendor?: string; publisher?: string; ciClassKey?: string; page?: string; pageSize?: string };

      const result = await getSoftwareInventoryReport(tenantId, {
        softwareName: query.softwareName,
        vendor: query.vendor,
        publisher: query.publisher,
        ciClassKey: query.ciClassKey,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      });

      return reply.send({ data: result.data, count: result.count });
    },
  );
}
```

---

### 17. `apps/api/src/routes/v1/cmdb/cis/[id]/software.ts` (NEW — CI-scoped software list)

**Analog:** `apps/api/src/routes/v1/reports/index.ts:29-62` (Fastify GET shape) + the existing `/api/v1/cmdb/cis/:id/...` handlers in `apps/api/src/routes/v1/cmdb/index.ts`

**Pattern:**
```typescript
fastify.get(
  '/api/v1/cmdb/cis/:id/software',
  { preHandler: requirePermission('cmdb.view') },
  async (request, reply) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;
    const { id: ciId } = request.params as { id: string };

    // Defense-in-depth: verify CI belongs to tenant before listing software
    const ci = await prisma.cmdbConfigurationItem.findFirst({
      where: { id: ciId, tenantId },
      select: { id: true },
    });
    if (!ci) return reply.code(404).send({ error: 'CI not found' });

    const software = await prisma.cmdbSoftwareInstalled.findMany({
      where: { tenantId, ciId },
      orderBy: [{ name: 'asc' }, { version: 'asc' }],
    });

    return reply.send({ data: software });
  },
);
```

---

### 18. `apps/web/src/app/dashboard/assets/[id]/page.tsx` (MODIFY — INTRODUCE FIRST tab structure; strip 6 dropped fields from `AssetDetail`)

**Analog (TAB_DEFS shape — D-03):** `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557` (canonical CSDM-aligned tab definition):
```typescript
const TAB_DEFS: { key: Tab; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: mdiInformationOutline },
  { key: 'ownership', label: 'Ownership', icon: mdiAccountMultiple },
  { key: 'technical', label: 'Technical', icon: mdiWrench },
  { key: 'service', label: 'Service Context', icon: mdiCog },
  { key: 'relationships', label: 'Relationships', icon: mdiLanConnect },
  // ...
];
```

**Phase 8 TAB_DEFS for Asset detail (D-03):**
```typescript
type Tab = 'overview' | 'activity' | 'technical-profile';

const TAB_DEFS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: mdiInformationOutline },
  { key: 'activity', label: 'Activity', icon: mdiHistory },
  { key: 'technical-profile', label: 'Technical Profile', icon: mdiServerNetwork },
];

const [activeTab, setActiveTab] = useState<Tab>('overview');
```

**Tab nav render (verbatim styling from `cmdb/[id]/page.tsx:784-810`):**
```tsx
<div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
  {TAB_DEFS.map((tab) => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent-primary)' : 'transparent'}`,
        color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
        fontWeight: activeTab === tab.key ? 600 : 400,
        fontSize: 14,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        marginBottom: -1,
      }}
    >
      <Icon path={tab.icon} size={0.8} color="currentColor" />
      {tab.label}
    </button>
  ))}
</div>
```

**Lazy-fetch pattern for Technical Profile data** (mirror `cmdb/[id]/page.tsx:590-599` — `enabled: activeTab === 'relationships'`):
```typescript
const linkedCi = asset?.cmdbConfigItems?.[0];
const { data: ciDetail } = useQuery<CIDetail>({
  queryKey: ['cmdb-ci', linkedCi?.id],
  queryFn: async () => {
    const res = await fetch(`/api/v1/cmdb/cis/${linkedCi!.id}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load CI: ${res.status}`);
    return res.json() as Promise<CIDetail>;
  },
  enabled: activeTab === 'technical-profile' && !!linkedCi,
});

const { data: softwareList } = useQuery<{ data: SoftwareItem[] }>({
  queryKey: ['cmdb-ci-software', linkedCi?.id],
  queryFn: async () => {
    const res = await fetch(`/api/v1/cmdb/cis/${linkedCi!.id}/software`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load software: ${res.status}`);
    return res.json() as Promise<{ data: SoftwareItem[] }>;
  },
  enabled: activeTab === 'technical-profile' && !!linkedCi,
});
```

**D-04 orphan empty state** (RESEARCH Pattern 7):
```tsx
{activeTab === 'technical-profile' && (
  asset.cmdbConfigItems.length === 0 ? (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <Icon path={mdiLinkOff} size={2} color="var(--text-muted)" />
      <h3>No linked Configuration Item</h3>
      <p>
        This Asset isn't linked to a Configuration Item. Hardware, OS, and software
        details live on CIs in CMDB. <strong>Link a CI</strong> to see the technical
        profile here, or <strong>Create a new CI</strong> if none exists.
      </p>
      <button onClick={() => setLinkPickerOpen(true)}>
        <Icon path={mdiLink} size={0.8} /> Link a CI
      </button>
    </div>
  ) : (
    <TechnicalProfilePanel asset={asset} ci={ciDetail} software={softwareList?.data ?? []} />
  )
)}
```

**Strip 6 dropped fields from `AssetDetail` interface (lines 35-40):**
```typescript
// REMOVE these 6 lines (Pitfall 6):
hostname: string | null;
operatingSystem: string | null;
cpuModel: string | null;
ramGb: number | null;
// (osVersion, disks, networkInterfaces, softwareInventory, lastInventoryAt
//  are not on the interface today; the interface only declares 4 of the 10)
```

ALSO remove the corresponding render rows that today display these fields — the grep gate (section 6) catches any survivors.

---

### 19. `apps/web/src/components/cmdb/CIPicker.tsx` (NEW — search-by-name CI picker for D-04 Link-a-CI)

**Analog:** `apps/web/src/components/VendorPicker.tsx` (full file, ~110 lines — exact pattern to mirror per RESEARCH Open Q 5)

**Imports + component shape pattern** (verbatim from `VendorPicker.tsx:1-15`):
```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * A CMDB CI search picker with type-ahead. Used from the Asset detail page's
 * "Link a CI" empty state (D-04) when the operator wants to attach an Asset
 * to an existing CI.
 *
 * Fetches from /api/v1/cmdb/cis?search=... (existing endpoint).
 */
export function CIPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (ciId: string) => void;
}) {
  // ... state hooks
}
```

**Fetch pattern** (verbatim from `VendorPicker.tsx:39-54`):
```typescript
const fetchCis = useCallback(async (search: string) => {
  setLoading(true);
  try {
    const res = await fetch(`/api/v1/cmdb/cis?search=${encodeURIComponent(search)}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to load CIs');
    const json = (await res.json()) as { data?: CIOption[] };
    setCis(json.data ?? []);
  } catch {
    setCis([]);
  } finally {
    setLoading(false);
  }
}, []);
```

**Type-ahead debounce** (NEW — VendorPicker doesn't debounce because vendor list is small; CI list can be 1000s):
```typescript
useEffect(() => {
  const t = setTimeout(() => void fetchCis(query), 250);
  return () => clearTimeout(t);
}, [query, fetchCis]);
```

**Handle selection + invoke `PATCH /api/v1/cmdb/cis/:id` to set `assetId`** (the link write):
```typescript
const handleSelect = async (ciId: string) => {
  // Caller (Asset detail page) does the PATCH; CIPicker just emits the choice
  onSelect(ciId);
  onClose();
};
```

---

### 20. `apps/api/src/__tests__/cmdb-extension.test.ts` (NEW — `upsertServerExtensionByAsset` tests)

**Analog:** `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (vi.hoisted + vi.mock + prismaTransaction mock — Phase 7 PATTERNS section 16)

**Mock setup pattern** (verbatim from `cmdb-service.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrismaObj, mockTx } = vi.hoisted(() => ({
  mockPrismaObj: {} as Record<string, unknown>,
  mockTx: {} as Record<string, unknown>,
}));

const txAssetFindFirst = vi.fn();
const txCIFindFirst = vi.fn();
const txCICreate = vi.fn();
const txCIUpdate = vi.fn();
const txServerUpsert = vi.fn();
const txSoftwareUpsert = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();
const prismaTransaction = vi.fn();

Object.assign(mockTx, {
  asset: { findFirst: txAssetFindFirst },
  cmdbConfigurationItem: { findFirst: txCIFindFirst, create: txCICreate, update: txCIUpdate },
  cmdbCiServer: { upsert: txServerUpsert },
  cmdbSoftwareInstalled: { upsert: txSoftwareUpsert },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

Object.assign(mockPrismaObj, { $transaction: prismaTransaction });

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));
vi.mock('../services/cmdb-reference-resolver.service', () => ({
  resolveClassId: vi.fn().mockResolvedValue('class-uuid-server'),
  resolveLifecycleStatusId: vi.fn().mockResolvedValue('status-uuid-in-service'),
  resolveOperationalStatusId: vi.fn().mockResolvedValue('status-uuid-online'),
  resolveEnvironmentId: vi.fn().mockResolvedValue('env-uuid-prod'),
}));

beforeEach(() => {
  vi.clearAllMocks();
  prismaTransaction.mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
});
```

**Required tests (per VALIDATION.md Wave 0 + Per-Task Verification Map):**
1. `upsertServerExtensionByAsset writes only to CmdbCiServer` (CASR-06)
2. `upsertServerExtensionByAsset auto-creates CI for orphan` (D-08)
3. `upsertServerExtensionByAsset upserts CmdbSoftwareInstalled` (CASR-06, D-06)
4. `upsertServerExtensionByAsset rejects cross-tenant Asset` (Multi-tenancy)
5. `upsertServerExtensionByAsset throws on missing reference data` (Pitfall 7)

**Sample test (verbatim shape):**
```typescript
it('upsertServerExtensionByAsset writes only to CmdbCiServer (never touches Asset)', async () => {
  txAssetFindFirst.mockResolvedValue({ id: 'asset-1', tenantId: TENANT_ID });
  txCIFindFirst.mockResolvedValue({ id: 'ci-1', tenantId: TENANT_ID });
  txServerUpsert.mockResolvedValue({ ciId: 'ci-1' });
  txSoftwareUpsert.mockResolvedValue({});

  await prismaTransaction((tx: typeof mockTx) =>
    upsertServerExtensionByAsset(tx as never, TENANT_ID, 'asset-1', SAMPLE_SNAPSHOT),
  );

  expect(txServerUpsert).toHaveBeenCalledTimes(1);
  expect(mockTx.asset).not.toHaveProperty('update');  // Asset MUST NOT have been written
});
```

---

### 21. `apps/api/src/__tests__/inventory-ingestion.test.ts` (NEW — integration test for POST /agents/inventory rerouting)

**Analog:** `apps/api/src/__tests__/cmdb-service.test.ts:1-120` (mock structure)

**Required tests** (per VALIDATION.md):
1. `POST /agents/inventory writes to CmdbCiServer not Asset`
2. `POST /agents/inventory auto-creates CI for orphan Asset`

**Pattern:** mock `@meridian/db` Prisma; invoke the route handler directly (Fastify `inject()`); assert via `txServerUpsert.mock.calls`.

---

### 22. `apps/api/src/__tests__/asset-service.test.ts` (MODIFY — strip dropped-field tests; add negative assertions)

**Analog:** itself (existing tests)

**Removal targets:** any test that asserts `data.hostname`, `data.operatingSystem`, etc. is set on the Asset.

**Phase 8 NEW tests:**
```typescript
it('createAsset rejects hostname field at TypeScript level', () => {
  // Compile-time check via @ts-expect-error
  // @ts-expect-error — hostname removed from CreateAssetData in Phase 8
  const _badInput: CreateAssetData = { hostname: 'srv-01' };
});

it('createAsset does not write hostname to Asset row', async () => {
  // ... arrange mocks
  await createAsset(prisma, TENANT_ID, { manufacturer: 'Dell' }, USER_ID);
  const callArgs = txAssetCreate.mock.calls[0][0].data;
  expect(callArgs).not.toHaveProperty('hostname');
  expect(callArgs).not.toHaveProperty('operatingSystem');
  // ... etc for all 10
});
```

---

### 23. `apps/api/src/__tests__/ai-schema-context.test.ts` (MODIFY — extend with Phase 8 assertions)

**Analog:** itself (Phase 7 file — extend in same shape per Phase 7 PATTERNS section 19)

**Phase 8 NEW assertions:**
```typescript
it('ai-schema-context: assets has no hostname/operatingSystem/cpuCores', () => {
  expect(ctx).not.toMatch(/assets[^\n]*hostname/);
  expect(ctx).not.toMatch(/assets[^\n]*operatingSystem/);
  expect(ctx).not.toMatch(/assets[^\n]*cpuCores/);
});

it('ai-schema-context: cmdb_software_installed block present with JOIN docs', () => {
  expect(ctx).toMatch(/cmdb_software_installed/);
  expect(ctx).toMatch(/JOIN cmdb_software_installed/);
});

it('ai-schema-context: cmdb_ci_servers includes cpuModel/disksJson/networkInterfacesJson', () => {
  expect(ctx).toMatch(/cmdb_ci_servers[\s\S]*cpuModel/);
  expect(ctx).toMatch(/cmdb_ci_servers[\s\S]*disksJson/);
  expect(ctx).toMatch(/cmdb_ci_servers[\s\S]*networkInterfacesJson/);
});

it('ai-schema-context excludes cmdb_migration_audit', () => {
  expect(EXCLUDED_TABLES).toContain('cmdb_migration_audit');
});
```

---

### 24. `apps/api/src/__tests__/portal-context.test.ts` (MODIFY — extend with Phase 8 assertions)

**Analog:** itself (Phase 7 file — extend in same shape per Phase 7 PATTERNS section 18)

**Phase 8 NEW assertions:**
```typescript
it('PORTAL_ALLOWED_TABLES still excludes cmdb_software_installed', () => {
  expect(PORTAL_ALLOWED_TABLES).not.toContain('cmdb_software_installed');
  expect(PORTAL_ALLOWED_TABLES).not.toContain('cmdb_migration_audit');
});

it('portal-schema-context Phase 8 exclusion comment present', async () => {
  const fileContent = await readFile('apps/api/src/services/portal-schema-context.ts', 'utf8');
  expect(fileContent).toMatch(/PHASE 8 audit/);
});
```

---

### 25. `apps/api/src/__tests__/portal-ai-sql-executor.test.ts` (MODIFY — add cmdb_software_installed + cmdb_migration_audit rejection cases)

**Analog:** itself (existing rejection tests for `cmdb_*` regex)

**Phase 8 NEW tests:**
```typescript
it('executePortalQuery rejects cmdb_software_installed', async () => {
  const result = await executePortalQuery(TENANT_ID, 'SELECT * FROM cmdb_software_installed');
  expect(result.error).toMatch(/forbidden table/i);
});

it('executePortalQuery rejects cmdb_migration_audit', async () => {
  const result = await executePortalQuery(TENANT_ID, 'SELECT * FROM cmdb_migration_audit');
  expect(result.error).toMatch(/forbidden table/i);
});
```

---

### 26. `apps/web/tests/asset-technical-profile.spec.ts` (NEW — Playwright Technical Profile tab on linked Asset)

**Analog:** `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` + Phase 7 PATTERNS section 20

**Imports pattern** (verbatim):
```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';
```

**Test structure:**
```typescript
test.describe('Asset Technical Profile tab', () => {
  test('renders linked CI hardware on click', async ({ page }) => {
    // Pre-condition: dev seed has at least 1 Asset with a linked CI carrying CmdbCiServer
    await loginAsAdmin(page, '/dashboard/assets');

    // Click into first Asset
    await page.getByRole('link', { name: /AST-/ }).first().click();

    // Click Technical Profile tab
    await page.getByRole('button', { name: /Technical Profile/i }).click();

    // Wait for the lazy CI fetch
    await page.waitForResponse((res) => res.url().includes('/api/v1/cmdb/cis/') && res.ok());

    // Assert hardware fields rendered
    await expect(page.getByText(/Operating System/i)).toBeVisible();
    await expect(page.getByText(/CPU/i)).toBeVisible();
    await expect(page.getByText(/Memory/i)).toBeVisible();
  });
});
```

---

### 27. `apps/web/tests/asset-link-ci.spec.ts` (NEW — orphan empty state + Link-a-CI flow)

**Analog:** `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100`

**Test structure:**
```typescript
test('orphan Asset shows Link-a-CI empty state', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/assets');

  // Find or create an orphan Asset (no linked CI)
  await page.getByRole('link', { name: /AST-ORPHAN/ }).click();
  await page.getByRole('button', { name: /Technical Profile/i }).click();

  // Empty state visible
  await expect(page.getByText(/No linked Configuration Item/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Link a CI/i })).toBeVisible();

  // Click Link a CI -> picker opens
  await page.getByRole('button', { name: /Link a CI/i }).click();
  await expect(page.getByPlaceholder(/Search CIs/i)).toBeVisible();

  // Type-ahead and select first match
  await page.getByPlaceholder(/Search CIs/i).fill('srv');
  await page.waitForResponse((res) => res.url().includes('/api/v1/cmdb/cis?search=') && res.ok());
  await page.getByRole('option').first().click();

  // Tab now shows the linked CI hardware
  await expect(page.getByText(/Operating System/i)).toBeVisible();
});
```

---

### 28. `apps/web/tests/asset-edit-no-tech-fields.spec.ts` (NEW — negative; no hostname/OS/CPU input on Asset edit form)

**Analog:** `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100`

**Test structure:**
```typescript
test('Asset edit form has no hostname/OS/CPU/RAM inputs after Phase 8', async ({ page }) => {
  await loginAsAdmin(page, '/dashboard/assets');
  await page.getByRole('link', { name: /AST-/ }).first().click();

  // Edit page (or inline edit toggle)
  await page.getByRole('button', { name: /Edit/i }).click();

  // Negative assertions
  await expect(page.getByLabel(/hostname/i)).toHaveCount(0);
  await expect(page.getByLabel(/Operating System/i)).toHaveCount(0);
  await expect(page.getByLabel(/CPU Model/i)).toHaveCount(0);
  await expect(page.getByLabel(/CPU Cores/i)).toHaveCount(0);
  await expect(page.getByLabel(/RAM/i)).toHaveCount(0);
});
```

---

## Shared Patterns

### Multi-Tenancy: Mandatory `tenantId` Filter (Project Rule 1 — CLAUDE.md)

**Source:** `apps/api/src/services/cmdb-reference-resolver.service.ts:29-32` (canonical resolver pattern); `apps/api/src/services/report.service.ts:65+` (canonical service-function tenant scoping)
**Apply to:** Every Phase 8 service, route, worker, script — without exception.

**Canonical service-function signature:**
```typescript
export async function someServiceFunction(tenantId: string, ...args): Promise<...> {
  return prisma.someTable.findMany({ where: { tenantId, ... } });
}
```

**Canonical Asset lookup** (Phase 8 inventory ingestion uses this):
```typescript
const asset = await prisma.asset.findFirst({
  where: { tenantId: agent.tenantId, hostname: snapshot.hostname },  // GOOD
});

const asset = await prisma.asset.findUnique({ where: { id: assetId } });  // FORBIDDEN — IDOR risk
```

**Canonical cache key shape (resolver pattern):** `${tenantId}:${otherKey}` — verified at `cmdb-reference-resolver.service.ts:26, 45, 80, 99`. Phase 8 inventory ingestion path inherits this via the imported resolvers.

### Worker OPTION B (no cross-app imports)

**Source:** `apps/worker/src/workers/cmdb-reconciliation.ts:44-110` (the existing Phase 7 inline-duplicated resolvers, with the project-standard `// Duplicated from apps/api/...` header comment at lines 46-49)
**Apply to:** Any Phase 8 helper the worker needs that lives in `apps/api`. Phase 8's `parseSoftwareList` and `inferClassKeyFromSnapshot` (if needed in BOTH places) follow this convention.

**Header-comment template (verbatim from `cmdb-reconciliation.ts:46-49`):**
```typescript
// Phase 8: duplicated from apps/api/src/services/cmdb-extension.service.ts
// to avoid cross-app imports. Keep these in sync with the API copy when the
// contract changes.
```

### Per-Tenant Backfill with Raw SQL Reads (RESEARCH Pattern 1 — chicken-and-egg)

**Source:** `packages/db/scripts/phase7-backfill.ts:243-263` (Phase 7 precedent)
**Apply to:** `phase8-backfill.ts` reads of soon-to-be-dropped Asset columns.

**Why raw SQL:** Once `prisma generate` has run against the new schema (Wave 1 ADD COLUMN; Wave 5 DROP COLUMN), the typed client refuses null-filter reads or refuses to reference dropped columns. `$queryRaw` bypasses validation. Phase 7 hit this; Phase 8 will hit it harder (10 dropped columns vs Phase 7's 0).

### Pre-flight DO Block in Destructive Migrations (RESEARCH Pattern 2)

**Source:** `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql:11-60` (the two `DO $$` blocks)
**Apply to:** The Wave 5 destructive Asset column drop migration.

**Why:** A pre-flight `RAISE EXCEPTION` produces an actionable operator message ("Run packages/db/scripts/phase8-backfill.ts before applying this migration") instead of a cryptic Prisma constraint failure on a column that no longer exists.

### Tenant-Scoped Cache (resolver convention)

**Source:** `apps/api/src/services/cmdb-reference-resolver.service.ts` (full file — Phase 7's reusable export)
**Apply to:** Phase 8 `upsertServerExtensionByAsset` calls these resolvers DIRECTLY (no need to duplicate in API; only the worker duplicates per OPTION B).

```typescript
import {
  resolveClassId,
  resolveLifecycleStatusId,
  resolveOperationalStatusId,
  resolveEnvironmentId,
} from './cmdb-reference-resolver.service.js';
```

### Vitest Mock Setup (vi.hoisted + vi.mock + prismaTransaction)

**Source:** `apps/api/src/__tests__/cmdb-service.test.ts:1-120`
**Apply to:** Every new Phase 8 Vitest file (`cmdb-extension.test.ts`, `inventory-ingestion.test.ts`).

(Pattern body shown in section 20 above.)

### Playwright E2E Test Structure

**Source:** `apps/web/tests/apm-cmdb-bridge.spec.ts:1-100` + helpers from `apps/web/tests/helpers.ts`
**Apply to:** All 3 new Phase 8 E2E specs (`asset-technical-profile`, `asset-link-ci`, `asset-edit-no-tech-fields`).

```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Feature name', () => {
  test('test name', async ({ page }) => {
    await loginAsAdmin(page, '/dashboard/...');
    // ... assertions
  });
});
```

### Tab Pattern (D-03 — CSDM-aligned)

**Source:** `apps/web/src/app/dashboard/cmdb/[id]/page.tsx:548-557` (TAB_DEFS) + `:784-810` (tab nav render) + `:580-587` (TanStack Query data fetch) + `:590-599` (lazy fetch with `enabled: activeTab === 'X'`)
**Apply to:** `apps/web/src/app/dashboard/assets/[id]/page.tsx` (Phase 8 introduces FIRST tab structure here).

**Critical: NO existing tab structure on the Asset detail page today** (RESEARCH Assumption A7 verified). Phase 8 adds the FIRST tab pattern; no prior conflicts to resolve.

### AI Schema Context Update (Project Rule 6 — CLAUDE.md)

**Source:** `apps/api/src/services/ai-schema-context.ts:100` (the `applications` block — the in-file template for "table with FK + JOIN hints")
**Apply to:** The same PR/wave that lands the schema migration. CLAUDE.md Rule 6 mandates same-commit update.

### Portal AI Hard-Reject (CAI-03)

**Source:** `apps/api/src/services/portal-ai-sql-executor.ts:78-87` (the `/\bcmdb_/i` regex)
**Apply to:** Phase 8 adds NO new regex; the existing pattern automatically covers `cmdb_software_installed` and `cmdb_migration_audit`. Defense-in-depth via Vitest assertions in `portal-ai-sql-executor.test.ts`.

### CSDM Field Ownership Contract (Project Rule 7)

**Source:** `docs/architecture/csdm-field-ownership.md` (Phase 0 contract — already shipped)
**Apply to:** Every Phase 8 service-layer modification. Phase 8's mantra: "Asset = ownership shell, CI = technical profile."

**Mechanism:** No model may carry both Asset.hostname AND CmdbCiServer.hostname (they did until Phase 8). Phase 8 strips Asset's copy. The grep gate (`packages/db/scripts/phase8-grep-gate.sh`) enforces zero references to the dropped fields after Wave 5.

### Conflict Audit Pattern (D-01 — CI wins silently, log to `cmdb_migration_audit`)

**Source:** No prior in-tree analog (Phase 8 INTRODUCES `cmdb_migration_audit`)
**Apply to:** Phase 8 backfill (Wave 2); reusable by Phases 9-14.

**Anti-pattern (do NOT use):** raw SQL `INSERT INTO cmdb_migration_audit ...`. Use the typed Prisma model `tx.cmdbMigrationAudit.createMany({ data: [...], skipDuplicates: true })` per RESEARCH Pitfall 4 + Don't Hand-Roll table.

### Software JSON Shape Defense (Pitfall 8 + Pitfall 10)

**Source:** No prior in-tree analog — Phase 8 INTRODUCES `parseSoftwareList`
**Apply to:** Both `phase8-backfill.ts` (reading `Asset.softwareInventory` JSON blob) and `cmdb-extension.service.ts` (reading `snapshot.installedSoftware` JSON blob). Define ONCE per app:
- `apps/api/src/services/cmdb-extension.service.ts` exports `parseSoftwareList`
- `apps/worker/src/workers/cmdb-reconciliation.ts` duplicates inline (OPTION B)
- `packages/db/scripts/phase8-backfill.ts` duplicates inline (script tier; one-shot)

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `cmdb_migration_audit` table & its writes | model + service helper | conflict log | Phase 7 used `RAISE EXCEPTION` to BLOCK on conflicts; Phase 8's policy (D-01) is to LOG and CONTINUE. No prior in-tree audit-log table for cross-model conflicts. **Planner action:** Phase 8 INTRODUCES this convention; Phases 9-14 reuse. Add a brief note to `docs/architecture/csdm-field-ownership.md` after Phase 8 ships. |
| `parseSoftwareList` helper | service helper | data transform | The two existing JSON blob shapes (`Asset.softwareInventory` legacy + `InventorySnapshot.installedSoftware` agent-current) have NO single in-tree parser today — both write paths are ad-hoc. **Planner action:** Phase 8 introduces the helper; document it as the canonical shape adapter. |
| `CIPicker.tsx` component | component | request-response | `VendorPicker.tsx` is the closest analog (vendor dropdown) — but vendor list is small (no debounce, no type-ahead). CI list can be 1000s, requiring type-ahead + debounce. **Planner action:** mirror `VendorPicker.tsx` structure but ADD type-ahead + debounce per section 19 above. |
| Inventory POST → CMDB synchronous translation | service | request-response | Phase 7's reconciliation worker is async-only (every 15 min). Phase 8 introduces SYNCHRONOUS in-request CMDB write via `upsertServerExtensionByAsset`. **No prior synchronous translation function in the project**; closest analog is `cmdb.service.ts:createCI` which does synchronous CI creation but not snapshot translation. |

Everything else maps to a clear in-tree analog whose pattern Phase 8 should copy verbatim or mirror with documented diff.

---

## Audit-Only Files (Verify, Do Not Modify Unless Issue Found)

Per RESEARCH Assumption A4: `apps/api/src/routes/v1/agents/index.ts` does NOT currently call `prisma.asset.update` from the inventory POST handler. **Phase 8 ADDS the synchronous `upsertServerExtensionByAsset` call but explicitly does NOT add any Asset write.** The grep gate keeps a watch on this file.

Per RESEARCH Assumption A7: `apps/web/src/app/dashboard/assets/[id]/page.tsx` has no existing tab structure. **Phase 8 INTRODUCES the first tab pattern.** No prior conflict to resolve.

---

## Wave Mapping (planner reference)

| Wave | Files Touched | Pattern Sections |
|------|---------------|------------------|
| **Wave 0** | Verify scripts (4, 5, 6), test scaffolds (20, 21, 22, 23, 24, 25, 26, 27, 28), `CIPicker.tsx` skeleton (19), Wave 0 sanity re-seed | All Phase 7 reuse patterns; Pitfall 7 sanity check |
| **Wave 1** | Schema additive (1), additive migration (2), `cmdb-extension.service.ts` (7), `parseSoftwareList` helper, worker extension (12) | RESEARCH Pattern 3 (new models); Pattern 4 (service); Pattern 1 (raw SQL not yet needed) |
| **Wave 2** | `phase8-backfill.ts` (4) | RESEARCH Pattern 1 (chicken-and-egg); D-01 audit logging |
| **Wave 3** | `asset.service.ts` (9), `routes/v1/assets/index.ts` (10), `routes/v1/agents/index.ts` (8); ENFORCE-mode grep gate flip (6) | Strip pattern; service-layer guard; OPTION B for worker |
| **Wave 4** | `ai-schema-context.ts` (13), `portal-schema-context.ts` (14), `report.service.ts` + new routes (15, 16, 17); test extensions (23, 24, 25) | RESEARCH Pattern 5 (license report); CAI-01/02/03 |
| **Wave 5** | Destructive migration (3); Asset detail page tab introduction (18); `CIPicker.tsx` finalize (19); Playwright tests (26, 27, 28); final `phase8-verify.ts` gate | RESEARCH Pattern 2 (pre-flight DO); Pattern 6 (tab pattern); Pattern 7 (orphan empty state) |

---

## Metadata

**Analog search scope:**
- `apps/api/src/services/` (asset, cmdb, cmdb-reference-resolver, ai-schema-context, portal-schema-context, portal-ai-sql-executor, report)
- `apps/api/src/routes/v1/` (agents, assets, cmdb, reports)
- `apps/api/src/__tests__/` (cmdb-service, cmdb-import, cmdb-reconciliation, ai-schema-context, portal-context, portal-ai-sql-executor, asset-service, signup-cmdb-seed)
- `apps/worker/src/workers/cmdb-reconciliation.ts`
- `apps/web/src/app/dashboard/assets/[id]/page.tsx`, `apps/web/src/app/dashboard/cmdb/[id]/page.tsx`
- `apps/web/src/components/VendorPicker.tsx`
- `apps/web/tests/apm-cmdb-bridge.spec.ts`, `apps/web/tests/helpers.ts`
- `packages/db/prisma/schema.prisma` (Asset @ 1708-1717; CmdbCiServer @ 2426-2450; CmdbCiApplication @ 2452-2469)
- `packages/db/prisma/migrations/20260417215217_phase7_ci_ref_notnull/migration.sql`
- `packages/db/scripts/phase7-{backfill,verify,grep-gate}.{ts,sh}`
- `.planning/phases/07-ci-reference-table-migration/07-PATTERNS.md` (Phase 7 reuse map)

**Files scanned in detail:** 19 (verified by direct Read with absolute paths and line numbers).

**Pattern extraction date:** 2026-04-17

**Confidence:** HIGH — Phase 7 just shipped; every reuse target is recently-modified verified code at the line numbers cited. The four NEW patterns (`cmdb_migration_audit`, `parseSoftwareList`, type-ahead `CIPicker`, synchronous CMDB translation) are documented as such with no spurious analog claim.

**CSDM Field Ownership posture:** Phase 8 implements the Asset-side retreat per `docs/architecture/csdm-field-ownership.md`. Hardware/OS/software fields move to their canonical owner (`CmdbCiServer` + `CmdbSoftwareInstalled`); Asset becomes a financial/ownership shell with read-only joined visibility. No field is duplicated post-Phase 8.

**Multi-tenancy posture:** Every Phase 8 query filters by `tenantId`. Both new tables (`cmdb_software_installed`, `cmdb_migration_audit`) carry `tenantId` even though the value is derivable from `ciId` — matches the project-wide ALL-tables-have-tenantId invariant. Cross-tenant isolation verified by `phase8-verify.ts` and `getSoftwareInventoryReport excludes other tenants` Vitest test.

---

## PATTERN MAPPING COMPLETE
