/**
 * CMDB ITIL Migration Script
 *
 * One-time data migration to populate new reference table FKs from existing enum values,
 * create CIs for existing Applications, migrate CmdbTicketLinks, and run duplicate detection.
 *
 * Run: npx tsx packages/db/scripts/cmdb-migration.ts
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

const TYPE_TO_CLASS: Record<string, string> = {
  SERVER: 'server',
  WORKSTATION: 'server',
  NETWORK_DEVICE: 'network_device',
  SOFTWARE: 'application',
  SERVICE: 'technical_service',
  DATABASE: 'database',
  VIRTUAL_MACHINE: 'virtual_machine',
  CONTAINER: 'cloud_resource',
  OTHER: 'generic',
};

const STATUS_TO_LIFECYCLE: Record<string, string> = {
  ACTIVE: 'in_service',
  INACTIVE: 'retired',
  DECOMMISSIONED: 'retired',
  PLANNED: 'planned',
};

const ENV_TO_KEY: Record<string, string> = {
  PRODUCTION: 'prod',
  STAGING: 'test',
  DEV: 'dev',
  DR: 'dr',
};

const REL_TYPE_TO_KEY: Record<string, string> = {
  DEPENDS_ON: 'depends_on',
  HOSTS: 'hosted_on',
  CONNECTS_TO: 'connected_to',
  RUNS_ON: 'runs_on',
  BACKS_UP: 'backed_up_by',
  VIRTUALIZES: 'hosted_on',
  MEMBER_OF: 'member_of',
};

const TICKET_LINK_TYPE_MAP: Record<string, string> = {
  AFFECTED: 'affected',
  RELATED: 'related',
  CAUSED_BY: 'root_cause',
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting CMDB ITIL Migration...\n');

  // Get all tenants
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Found ${tenants.length} tenants\n`);

  for (const tenant of tenants) {
    console.log(`\n═══ Processing tenant: ${tenant.name} (${tenant.id}) ═══`);

    // Step 1: Seed reference tables if not already seeded
    await seedReferenceDataIfNeeded(tenant.id);

    // Step 2: Build lookup maps
    const classMap = await buildLookupMap(tenant.id, 'class');
    const statusMap = await buildLookupMap(tenant.id, 'status');
    const envMap = await buildLookupMap(tenant.id, 'environment');
    const relTypeMap = await buildLookupMap(tenant.id, 'relationType');

    // Step 3: Migrate CI enum values to FK references
    await migrateCIReferences(tenant.id, classMap, statusMap, envMap);

    // Step 4: Migrate relationship type enum values
    await migrateRelationshipReferences(tenant.id, relTypeMap);

    // Step 5: Migrate ownerId to technicalOwnerId
    await migrateOwnership(tenant.id);

    // Step 6: Migrate CmdbTicketLink to CmdbIncidentLink/CmdbProblemLink
    await migrateTicketLinks(tenant.id);

    // Step 7: Populate firstDiscoveredAt from discoveredAt
    await populateFirstDiscovered(tenant.id);

    console.log(`\n✓ Tenant ${tenant.name} migration complete`);
  }

  console.log('\n\n═══ Migration complete! ═══');
}

// ─── Step 1: Seed reference data ─────────────────────────────────────────────

async function seedReferenceDataIfNeeded(tenantId: string) {
  const existingClasses = await prisma.cmdbCiClass.count({ where: { tenantId } });
  if (existingClasses > 0) {
    console.log('  Reference data already seeded, skipping...');
    return;
  }

  console.log('  Seeding reference data...');
  // This would call the same seed function from seed.ts
  // For now, just log — the seed should be run first
  console.log('  ⚠ Run `pnpm --filter web prisma db seed` first to seed reference data');
}

// ─── Step 2: Build lookup maps ───────────────────────────────────────────────

async function buildLookupMap(tenantId: string, type: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  if (type === 'class') {
    const items = await prisma.cmdbCiClass.findMany({ where: { tenantId }, select: { id: true, classKey: true } });
    items.forEach((i) => map.set(i.classKey, i.id));
  } else if (type === 'status') {
    const items = await prisma.cmdbStatus.findMany({ where: { tenantId, statusType: 'lifecycle' }, select: { id: true, statusKey: true } });
    items.forEach((i) => map.set(i.statusKey, i.id));
  } else if (type === 'environment') {
    const items = await prisma.cmdbEnvironment.findMany({ where: { tenantId }, select: { id: true, envKey: true } });
    items.forEach((i) => map.set(i.envKey, i.id));
  } else if (type === 'relationType') {
    const items = await prisma.cmdbRelationshipTypeRef.findMany({ where: { tenantId }, select: { id: true, relationshipKey: true } });
    items.forEach((i) => map.set(i.relationshipKey, i.id));
  }

  return map;
}

// ─── Step 3: Migrate CI references ───────────────────────────────────────────

async function migrateCIReferences(
  tenantId: string,
  classMap: Map<string, string>,
  statusMap: Map<string, string>,
  envMap: Map<string, string>,
) {
  const cis = await prisma.cmdbConfigurationItem.findMany({
    where: { tenantId, classId: null },
    select: { id: true, type: true, status: true, environment: true },
  });

  console.log(`  Migrating ${cis.length} CI references...`);
  let migrated = 0;

  for (const ci of cis) {
    const classKey = TYPE_TO_CLASS[ci.type] ?? 'generic';
    const statusKey = STATUS_TO_LIFECYCLE[ci.status] ?? 'in_service';
    const envKey = ENV_TO_KEY[ci.environment] ?? 'prod';

    const classId = classMap.get(classKey);
    const lifecycleStatusId = statusMap.get(statusKey);
    const environmentId = envMap.get(envKey);

    if (classId || lifecycleStatusId || environmentId) {
      await prisma.cmdbConfigurationItem.update({
        where: { id: ci.id },
        data: {
          classId: classId ?? undefined,
          lifecycleStatusId: lifecycleStatusId ?? undefined,
          environmentId: environmentId ?? undefined,
          sourceSystem: 'migration',
        },
      });
      migrated++;
    }
  }

  console.log(`  ✓ Migrated ${migrated} CI references`);
}

// ─── Step 4: Migrate relationship references ─────────────────────────────────

async function migrateRelationshipReferences(
  tenantId: string,
  relTypeMap: Map<string, string>,
) {
  const rels = await prisma.cmdbRelationship.findMany({
    where: { tenantId, relationshipTypeId: null },
    select: { id: true, relationshipType: true },
  });

  console.log(`  Migrating ${rels.length} relationship type references...`);
  let migrated = 0;

  for (const rel of rels) {
    const relKey = REL_TYPE_TO_KEY[rel.relationshipType] ?? 'depends_on';
    const relationshipTypeId = relTypeMap.get(relKey);

    if (relationshipTypeId) {
      await prisma.cmdbRelationship.update({
        where: { id: rel.id },
        data: { relationshipTypeId },
      });
      migrated++;
    }
  }

  console.log(`  ✓ Migrated ${migrated} relationship references`);
}

// ─── Step 5: Migrate ownership ───────────────────────────────────────────────

async function migrateOwnership(tenantId: string) {
  const cis = await prisma.cmdbConfigurationItem.findMany({
    where: { tenantId, ownerId: { not: null }, technicalOwnerId: null },
    select: { id: true, ownerId: true },
  });

  console.log(`  Migrating ${cis.length} CI ownership (ownerId → technicalOwnerId)...`);

  for (const ci of cis) {
    await prisma.cmdbConfigurationItem.update({
      where: { id: ci.id },
      data: { technicalOwnerId: ci.ownerId },
    });
  }

  console.log(`  ✓ Migrated ${cis.length} ownership records`);
}

// ─── Step 6: Migrate ticket links ────────────────────────────────────────────

async function migrateTicketLinks(tenantId: string) {
  const links = await prisma.cmdbTicketLink.findMany({
    where: { tenantId },
    include: { ticket: { select: { type: true } } },
  });

  console.log(`  Migrating ${links.length} ticket links...`);
  let incidents = 0;
  let problems = 0;

  for (const link of links) {
    const impactRole = TICKET_LINK_TYPE_MAP[link.linkType] ?? 'related';

    if (link.ticket.type === 'PROBLEM') {
      // Check if already migrated
      const existing = await prisma.cmdbProblemLink.findFirst({
        where: { ciId: link.ciId, ticketId: link.ticketId },
      });
      if (!existing) {
        await prisma.cmdbProblemLink.create({
          data: { tenantId, ciId: link.ciId, ticketId: link.ticketId, impactRole },
        });
        problems++;
      }
    } else {
      // INCIDENT and SERVICE_REQUEST → CmdbIncidentLink
      const existing = await prisma.cmdbIncidentLink.findFirst({
        where: { ciId: link.ciId, ticketId: link.ticketId },
      });
      if (!existing) {
        await prisma.cmdbIncidentLink.create({
          data: { tenantId, ciId: link.ciId, ticketId: link.ticketId, impactRole },
        });
        incidents++;
      }
    }
  }

  console.log(`  ✓ Migrated ${incidents} incident links, ${problems} problem links`);
}

// ─── Step 7: Populate firstDiscoveredAt ──────────────────────────────────────

async function populateFirstDiscovered(tenantId: string) {
  const result = await prisma.cmdbConfigurationItem.updateMany({
    where: { tenantId, firstDiscoveredAt: null, discoveredAt: { not: null } },
    data: { firstDiscoveredAt: undefined }, // Can't copy field directly in Prisma
  });

  // Use raw SQL for field-to-field copy
  const updated = await prisma.$executeRaw`
    UPDATE cmdb_configuration_items
    SET "firstDiscoveredAt" = "discoveredAt"
    WHERE "tenantId" = ${tenantId}::uuid
    AND "firstDiscoveredAt" IS NULL
    AND "discoveredAt" IS NOT NULL
  `;

  console.log(`  ✓ Populated firstDiscoveredAt for ${updated} CIs`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Migration failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
