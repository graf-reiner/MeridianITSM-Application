import type { Prisma } from '@prisma/client';

/**
 * Phase 7 (CREF-01..04 + tenant-lifecycle): seed the per-tenant CMDB reference
 * vocabulary (CI classes, lifecycle/operational statuses, environments,
 * relationship types).
 *
 * Accepts a Prisma.TransactionClient so callers (signup, owner provisioning,
 * prisma/seed.ts demo seed) can run this inside their own transaction.
 *
 * IDEMPOTENT — re-running for the same tenant does NOT overwrite tenant
 * customizations because every upsert uses `update: {}`.
 *
 * Multi-tenancy: every row written is scoped to the passed `tenantId`.
 *
 * Seeds: 15 CI classes + 11 statuses (6 lifecycle + 5 operational) + 6
 * environments + 13 relationship types. Values match packages/db/prisma/seed.ts
 * 1:1 (A7 lock — no additions, no removals, no label changes).
 */
export async function seedCmdbReferenceData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  // === 15 CI Classes (verbatim from prior seed.ts:357-373) ===
  const ciClasses = [
    { classKey: 'business_service', className: 'Business Service', icon: 'mdiBriefcase', description: 'Customer-facing business service' },
    { classKey: 'technical_service', className: 'Technical Service', icon: 'mdiCog', description: 'Infrastructure or platform service' },
    { classKey: 'application', className: 'Application', icon: 'mdiApplication', description: 'Software application' },
    { classKey: 'application_instance', className: 'Application Instance', icon: 'mdiApplicationCog', description: 'Deployed instance of an application' },
    { classKey: 'saas_application', className: 'SaaS Application', icon: 'mdiCloud', description: 'Cloud-hosted SaaS application' },
    { classKey: 'server', className: 'Server', icon: 'mdiServer', description: 'Physical or virtual server' },
    { classKey: 'virtual_machine', className: 'Virtual Machine', icon: 'mdiMonitor', description: 'Virtual machine instance' },
    { classKey: 'database', className: 'Database', icon: 'mdiDatabase', description: 'Database instance' },
    { classKey: 'network_device', className: 'Network Device', icon: 'mdiRouterNetwork', description: 'Network infrastructure device' },
    { classKey: 'load_balancer', className: 'Load Balancer', icon: 'mdiScaleBalance', description: 'Load balancer or traffic manager' },
    { classKey: 'storage', className: 'Storage', icon: 'mdiHarddisk', description: 'Storage system or array' },
    { classKey: 'cloud_resource', className: 'Cloud Resource', icon: 'mdiCloudOutline', description: 'Cloud platform resource' },
    { classKey: 'dns_endpoint', className: 'DNS Endpoint', icon: 'mdiDns', description: 'DNS record or endpoint' },
    { classKey: 'certificate', className: 'Certificate', icon: 'mdiCertificate', description: 'SSL/TLS certificate' },
    { classKey: 'generic', className: 'Generic', icon: 'mdiCubeOutline', description: 'Generic configuration item' },
  ];

  const classMap: Record<string, string> = {};
  for (const cls of ciClasses) {
    const record = await tx.cmdbCiClass.upsert({
      where: { tenantId_classKey: { tenantId, classKey: cls.classKey } },
      update: {},
      create: { ...cls, tenantId },
    });
    classMap[cls.classKey] = record.id;
  }

  // Parent-class wiring (verbatim from prior seed.ts:386-399)
  const parentMappings: Record<string, string> = {
    virtual_machine: 'server',
    load_balancer: 'network_device',
    application_instance: 'application',
    saas_application: 'application',
  };
  for (const [child, parent] of Object.entries(parentMappings)) {
    if (classMap[child] && classMap[parent]) {
      await tx.cmdbCiClass.update({
        where: { id: classMap[child] },
        data: { parentClassId: classMap[parent] },
      });
    }
  }

  // === 11 Statuses: 6 lifecycle + 5 operational (verbatim from prior seed.ts:403-414) ===
  const statuses = [
    // Lifecycle (6)
    { statusType: 'lifecycle', statusKey: 'planned', statusName: 'Planned', sortOrder: 1 },
    { statusType: 'lifecycle', statusKey: 'ordered', statusName: 'Ordered', sortOrder: 2 },
    { statusType: 'lifecycle', statusKey: 'installed', statusName: 'Installed', sortOrder: 3 },
    { statusType: 'lifecycle', statusKey: 'in_service', statusName: 'In Service', sortOrder: 4 },
    { statusType: 'lifecycle', statusKey: 'under_change', statusName: 'Under Change', sortOrder: 5 },
    { statusType: 'lifecycle', statusKey: 'retired', statusName: 'Retired', sortOrder: 6 },
    // Operational (5)
    { statusType: 'operational', statusKey: 'online', statusName: 'Online', sortOrder: 1 },
    { statusType: 'operational', statusKey: 'offline', statusName: 'Offline', sortOrder: 2 },
    { statusType: 'operational', statusKey: 'degraded', statusName: 'Degraded', sortOrder: 3 },
    { statusType: 'operational', statusKey: 'maintenance', statusName: 'Maintenance', sortOrder: 4 },
    { statusType: 'operational', statusKey: 'unknown', statusName: 'Unknown', sortOrder: 5 },
  ];
  for (const status of statuses) {
    await tx.cmdbStatus.upsert({
      where: {
        tenantId_statusType_statusKey: {
          tenantId,
          statusType: status.statusType,
          statusKey: status.statusKey,
        },
      },
      update: {},
      create: { ...status, tenantId },
    });
  }

  // === 6 Environments (verbatim from prior seed.ts:433-440) ===
  const environments = [
    { envKey: 'prod', envName: 'Production', sortOrder: 1 },
    { envKey: 'test', envName: 'Test', sortOrder: 2 },
    { envKey: 'dev', envName: 'Development', sortOrder: 3 },
    { envKey: 'qa', envName: 'QA', sortOrder: 4 },
    { envKey: 'dr', envName: 'Disaster Recovery', sortOrder: 5 },
    { envKey: 'lab', envName: 'Lab', sortOrder: 6 },
  ];
  for (const env of environments) {
    await tx.cmdbEnvironment.upsert({
      where: { tenantId_envKey: { tenantId, envKey: env.envKey } },
      update: {},
      create: { ...env, tenantId },
    });
  }

  // === 13 Relationship Types (verbatim from prior seed.ts:452-465) ===
  const relationshipTypes: Array<{
    relationshipKey: string;
    relationshipName: string;
    forwardLabel: string;
    reverseLabel: string;
    isDirectional?: boolean;
  }> = [
    { relationshipKey: 'depends_on', relationshipName: 'Depends On', forwardLabel: 'depends on', reverseLabel: 'is depended on by' },
    { relationshipKey: 'runs_on', relationshipName: 'Runs On', forwardLabel: 'runs on', reverseLabel: 'runs' },
    { relationshipKey: 'hosted_on', relationshipName: 'Hosted On', forwardLabel: 'is hosted on', reverseLabel: 'hosts' },
    { relationshipKey: 'connected_to', relationshipName: 'Connected To', forwardLabel: 'connects to', reverseLabel: 'connects to', isDirectional: false },
    { relationshipKey: 'member_of', relationshipName: 'Member Of', forwardLabel: 'is member of', reverseLabel: 'has member' },
    { relationshipKey: 'replicated_to', relationshipName: 'Replicated To', forwardLabel: 'replicates to', reverseLabel: 'is replicated from' },
    { relationshipKey: 'backed_up_by', relationshipName: 'Backed Up By', forwardLabel: 'is backed up by', reverseLabel: 'backs up' },
    { relationshipKey: 'uses', relationshipName: 'Uses', forwardLabel: 'uses', reverseLabel: 'is used by' },
    { relationshipKey: 'supports', relationshipName: 'Supports', forwardLabel: 'supports', reverseLabel: 'is supported by' },
    { relationshipKey: 'managed_by', relationshipName: 'Managed By', forwardLabel: 'is managed by', reverseLabel: 'manages' },
    { relationshipKey: 'owned_by', relationshipName: 'Owned By', forwardLabel: 'is owned by', reverseLabel: 'owns' },
    { relationshipKey: 'contains', relationshipName: 'Contains', forwardLabel: 'contains', reverseLabel: 'is contained in' },
    { relationshipKey: 'installed_on', relationshipName: 'Installed On', forwardLabel: 'is installed on', reverseLabel: 'has installed' },
  ];
  for (const rel of relationshipTypes) {
    await tx.cmdbRelationshipTypeRef.upsert({
      where: { tenantId_relationshipKey: { tenantId, relationshipKey: rel.relationshipKey } },
      update: {},
      create: {
        tenantId,
        relationshipKey: rel.relationshipKey,
        relationshipName: rel.relationshipName,
        forwardLabel: rel.forwardLabel,
        reverseLabel: rel.reverseLabel,
        isDirectional: rel.isDirectional ?? true,
      },
    });
  }
}
