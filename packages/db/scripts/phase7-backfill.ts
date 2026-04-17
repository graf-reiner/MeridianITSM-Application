/**
 * Phase 7 per-tenant FK backfill — SCAFFOLD (Wave 0).
 *
 * This Wave-0 file exists to make the verification harness discoverable. Wave 2
 * (plan 07-03) will fill in the implementation bodies for each step. The mapping
 * tables below are already authoritative — Wave 2 consumes them as-is.
 *
 * Run: pnpm tsx packages/db/scripts/phase7-backfill.ts
 *
 * Multi-tenancy posture: every operation runs per-tenant inside the for-loop below.
 * Never batch across tenants.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Mapping Tables ──────────────────────────────────────────────────────────
// Copied/adapted from packages/db/scripts/cmdb-migration.ts:22-56 +
// RESEARCH.md assumption A1 (STATUS_TO_OPERATIONAL).

export const TYPE_TO_CLASS: Record<string, string> = {
  SERVER: 'server',
  WORKSTATION: 'endpoint',
  NETWORK_DEVICE: 'network_device',
  SOFTWARE: 'application',
  SERVICE: 'application_service',
  DATABASE: 'database',
  VIRTUAL_MACHINE: 'virtual_machine',
  CONTAINER: 'application_instance',
  OTHER: 'generic',
};

export const STATUS_TO_LIFECYCLE: Record<string, string> = {
  ACTIVE: 'in_service',
  INACTIVE: 'in_service',
  DECOMMISSIONED: 'retired',
  PLANNED: 'planned',
};

// Phase 7 NEW (RESEARCH.md A1): legacy CmdbCiStatus carries no operational signal.
// Default ALL existing CIs to 'unknown'; reconciliation worker will set 'online'
// on next heartbeat.
export const STATUS_TO_OPERATIONAL: Record<string, string> = {
  ACTIVE: 'unknown',
  INACTIVE: 'unknown',
  DECOMMISSIONED: 'unknown',
  PLANNED: 'unknown',
};

export const ENV_TO_KEY: Record<string, string> = {
  PRODUCTION: 'prod',
  STAGING: 'staging',
  DEV: 'dev',
  DR: 'dr',
};

export const REL_TYPE_TO_KEY: Record<string, string> = {
  DEPENDS_ON: 'depends_on',
  HOSTS: 'hosted_on',
  VIRTUALIZES: 'hosted_on',
  CONNECTS_TO: 'connected_to',
  MEMBER_OF: 'member_of',
  REPLICATES_TO: 'replicated_to',
  BACKED_UP_BY: 'backed_up_by',
  USES: 'uses',
  SUPPORTS: 'supports',
  MANAGED_BY: 'managed_by',
  OWNED_BY: 'owned_by',
  CONTAINS: 'contains',
  INSTALLED_ON: 'installed_on',
};

async function main() {
  console.log('Phase 7 backfill — SCAFFOLD (Wave 2 implements bodies)\n');
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    console.log(`\n=== Processing tenant: ${tenant.name} (${tenant.id}) ===`);
    console.log('  TODO Wave 2: seedReferenceDataIfNeeded(tenant.id)');
    console.log(
      '  TODO Wave 2: build lookup maps (class, status-lifecycle, status-operational, env, relType)',
    );
    console.log('  TODO Wave 2: detectRelationshipDuplicates(tenant.id)');
    console.log(
      '  TODO Wave 2: migrateCIReferences(tenant.id, maps) — INCLUDES operationalStatusId',
    );
    console.log('  TODO Wave 2: migrateRelationshipReferences(tenant.id, relTypeMap)');
  }

  console.log('\nScaffold run complete. Exit 0.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect().then(() => pool.end()));
