import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── CMDB Reconciliation Worker ───────────────────────────────────────────────
//
// Cross-tenant global sweep (like SLA monitor). Runs every 15 minutes via repeatable job.
// Processes all ACTIVE agents, compares their latest InventorySnapshot to existing CIs,
// creates/updates CIs, logs per-field changes, and marks stale CIs INACTIVE after 24h.
//
// Duplicated helper: ciNumber generation via raw SQL FOR UPDATE (same pattern as cmdb.service.ts
// in apps/api) to avoid cross-app imports — follows mapStripeStatus precedent.

function inferCiTypeFromSnapshot(
  platform: string,
  hostname: string,
  operatingSystem: string | null,
): string {
  const os = (operatingSystem ?? '').toLowerCase();
  const host = (hostname ?? '').toLowerCase();
  const plt = platform.toLowerCase();

  // Server heuristics: server OS edition or server-like hostname
  if (
    os.includes('server') ||
    host.startsWith('srv') ||
    host.includes('-srv-') ||
    os.includes('ubuntu server') ||
    os.includes('centos') ||
    os.includes('rhel') ||
    os.includes('debian')
  ) {
    return 'SERVER';
  }

  if (plt === 'linux') return 'SERVER'; // Linux agents tend to be servers
  if (plt === 'macos') return 'WORKSTATION';
  if (plt === 'windows') return 'WORKSTATION';

  return 'OTHER';
}

export const cmdbReconciliationWorker = new Worker(
  QUEUE_NAMES.CMDB_RECONCILIATION,
  async (job) => {
    console.log(`[cmdb-reconciliation] Running global CI reconciliation sweep (job ${job.id})`);

    let created = 0;
    let updated = 0;
    let staleMarked = 0;

    // ─── Step 1: Process all ACTIVE agents ──────────────────────────────────

    const agents = await prisma.agent.findMany({
      where: { status: 'ACTIVE' },
      include: {
        inventorySnapshots: {
          orderBy: { collectedAt: 'desc' },
          take: 1,
        },
      },
    });

    console.log(`[cmdb-reconciliation] Processing ${agents.length} active agents`);

    for (const agent of agents) {
      const snapshot = agent.inventorySnapshots[0];
      if (!snapshot) continue; // No inventory yet — skip

      const tenantId = agent.tenantId;

      try {
        // Find existing CI linked to this agent
        const existingCi = await prisma.cmdbConfigurationItem.findFirst({
          where: { agentId: agent.id, tenantId },
        });

        const hostname = snapshot.hostname ?? agent.hostname;
        const operatingSystem = snapshot.operatingSystem ?? null;
        const osVersion = snapshot.osVersion ?? null;
        const ciType = inferCiTypeFromSnapshot(agent.platform, hostname, operatingSystem);

        // Build attributesJson from snapshot hardware data
        const newAttributesJson: Record<string, unknown> = {};
        if (snapshot.cpuModel) newAttributesJson['cpuModel'] = snapshot.cpuModel;
        if (snapshot.cpuCores) newAttributesJson['cpuCores'] = snapshot.cpuCores;
        if (snapshot.ramGb) newAttributesJson['ramGb'] = snapshot.ramGb;
        if (snapshot.disks) newAttributesJson['disks'] = snapshot.disks;
        if (snapshot.networkInterfaces) newAttributesJson['networkInterfaces'] = snapshot.networkInterfaces;
        if (snapshot.installedSoftware) newAttributesJson['installedSoftware'] = snapshot.installedSoftware;
        newAttributesJson['agentPlatform'] = agent.platform;
        newAttributesJson['agentVersion'] = agent.agentVersion ?? null;

        if (!existingCi) {
          // ─── Create new CI ────────────────────────────────────────────────

          await prisma.$transaction(async (tx) => {
            // Sequential ciNumber via FOR UPDATE lock — same pattern as cmdb.service.ts
            const result = await tx.$queryRaw<[{ next: bigint }]>`
              SELECT COALESCE(MAX("ciNumber"), 0) + 1 AS next
              FROM cmdb_configuration_items
              WHERE "tenantId" = ${tenantId}::uuid
              FOR UPDATE
            `;
            const ciNumber = Number(result[0].next);

            const ci = await tx.cmdbConfigurationItem.create({
              data: {
                tenantId,
                ciNumber,
                name: hostname,
                type: ciType as never,
                status: 'ACTIVE' as never,
                environment: 'PRODUCTION' as never,
                agentId: agent.id,
                attributesJson: newAttributesJson as never,
                discoveredAt: snapshot.collectedAt,
                lastSeenAt: new Date(),
              },
            });

            await tx.cmdbChangeRecord.create({
              data: {
                tenantId,
                ciId: ci.id,
                changeType: 'CREATED',
                changedBy: 'AGENT',
                agentId: agent.id,
              },
            });
          });

          created++;
          console.log(`[cmdb-reconciliation] Created CI for agent ${agent.id} (host: ${hostname})`);
        } else {
          // ─── Diff and update existing CI ─────────────────────────────────
          //
          // Manual CMDB edits win — per user decision, agent data only fills empty fields
          // or updates agent-sourced fields. If a field was last edited by a USER, skip
          // the agent update for that field.
          //
          // Check changedBy = 'USER' on the most recent CmdbChangeRecord per field.
          // If found, that field is "locked" by the human edit and agent data is ignored.

          const changedFields: Array<{
            fieldName: string;
            oldValue: string;
            newValue: string;
          }> = [];

          /**
           * Track a candidate field change only if the field was not last modified by a user.
           * Queries the most recent change record for this field on this CI.
           */
          const trackChangeIfNotUserLocked = async (
            field: string,
            oldVal: unknown,
            newVal: unknown,
          ) => {
            const oldStr = oldVal == null ? '' : String(oldVal);
            const newStr = newVal == null ? '' : String(newVal);
            if (oldStr === newStr) return; // No change — nothing to do

            // Check if the most recent change to this field was by a USER (manual edit)
            const lastChange = await prisma.cmdbChangeRecord.findFirst({
              where: { ciId: existingCi.id, fieldName: field },
              orderBy: { createdAt: 'desc' },
              select: { changedBy: true },
            });

            if (lastChange?.changedBy === 'USER') {
              // Manual CMDB edits win — skip agent update for this field
              console.log(
                `[cmdb-reconciliation] Skipping field '${field}' on CI ${existingCi.id} — last changed by USER (manual edit wins)`,
              );
              return;
            }

            changedFields.push({ fieldName: field, oldValue: oldStr, newValue: newStr });
          };

          // Compare fields — each check respects the manual-edit-wins rule
          await trackChangeIfNotUserLocked('name', existingCi.name, hostname);

          const existingAttrs = (existingCi.attributesJson ?? {}) as Record<string, unknown>;
          const newAttrsStr = JSON.stringify(newAttributesJson);
          const oldAttrsStr = JSON.stringify(existingAttrs);
          await trackChangeIfNotUserLocked('attributesJson', oldAttrsStr, newAttrsStr);

          if (changedFields.length > 0) {
            await prisma.$transaction(async (tx) => {
              // Log each changed field
              await tx.cmdbChangeRecord.createMany({
                data: changedFields.map((f) => ({
                  tenantId,
                  ciId: existingCi.id,
                  changeType: 'UPDATED' as const,
                  fieldName: f.fieldName,
                  oldValue: f.oldValue,
                  newValue: f.newValue,
                  changedBy: 'AGENT' as const,
                  agentId: agent.id,
                })),
              });

              // Build update object — only fields that passed the manual-edit-wins check
              const updateData: Record<string, unknown> = {
                lastSeenAt: new Date(),
              };
              if (changedFields.some((f) => f.fieldName === 'name')) {
                updateData['name'] = hostname;
              }
              if (changedFields.some((f) => f.fieldName === 'attributesJson')) {
                updateData['attributesJson'] = newAttributesJson as never;
              }

              await tx.cmdbConfigurationItem.update({
                where: { id: existingCi.id },
                data: updateData as never,
              });
            });

            updated++;
            console.log(
              `[cmdb-reconciliation] Updated CI ${existingCi.id} with ${changedFields.length} field changes`,
            );
          } else {
            // No field changes (or all changes blocked by manual-edit-wins) — just bump lastSeenAt
            await prisma.cmdbConfigurationItem.update({
              where: { id: existingCi.id },
              data: { lastSeenAt: new Date() },
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmdb-reconciliation] Error processing agent ${agent.id}: ${message}`);
        // Continue with remaining agents — don't fail the whole job
      }
    }

    // ─── Step 2: Mark stale CIs INACTIVE (agentId set, lastSeenAt > 24h) ──

    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleCIs = await prisma.cmdbConfigurationItem.findMany({
      where: {
        agentId: { not: null },
        status: 'ACTIVE',
        lastSeenAt: { lt: staleThreshold },
      },
      select: { id: true, tenantId: true, agentId: true },
    });

    console.log(`[cmdb-reconciliation] Found ${staleCIs.length} stale CIs to mark INACTIVE`);

    for (const ci of staleCIs) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.cmdbChangeRecord.create({
            data: {
              tenantId: ci.tenantId,
              ciId: ci.id,
              changeType: 'UPDATED',
              fieldName: 'status',
              oldValue: 'ACTIVE',
              newValue: 'INACTIVE',
              changedBy: 'AGENT',
              agentId: ci.agentId,
            },
          });

          await tx.cmdbConfigurationItem.update({
            where: { id: ci.id },
            data: { status: 'INACTIVE' as never },
          });
        });

        staleMarked++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmdb-reconciliation] Error marking CI ${ci.id} stale: ${message}`);
      }
    }

    console.log(
      `[cmdb-reconciliation] Reconciliation complete — created: ${created}, updated: ${updated}, stale marked: ${staleMarked}`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Cross-tenant batch sweep — single-threaded
  },
);

cmdbReconciliationWorker.on('failed', (job, err) => {
  console.error(`[cmdb-reconciliation] Job ${job?.id} failed:`, err.message);
});
