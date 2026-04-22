import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@meridian/db';
import { Queue } from 'bullmq';
import agentUpdateRoutes from './updates.js';
import {
  upsertServerExtensionByAsset,
  type AgentInventorySnapshot,
} from '../../../services/cmdb-extension.service.js';

// Queue names mirrored locally to avoid cross-app imports from apps/worker — follows mapStripeStatus precedent
const CMDB_RECONCILIATION_QUEUE = 'cmdb-reconciliation';

// BullMQ connection config — same pattern as apps/api/src/routes/billing/webhook.ts
const bullmqConnection = {
  host: (() => {
    try {
      return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname;
    } catch {
      return 'localhost';
    }
  })(),
  port: (() => {
    try {
      return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379;
    } catch {
      return 6379;
    }
  })(),
  maxRetriesPerRequest: null as null,
};

// Create queue instance for enqueuing CMDB reconciliation jobs
const cmdbReconciliationQueue = new Queue(CMDB_RECONCILIATION_QUEUE, {
  connection: bullmqConnection,
});

/**
 * Agent External Routes (AGNT-03, AGNT-04, AGNT-05, AGNT-06)
 *
 * These routes are mounted in the external scope (agent key authentication).
 * Enrollment uses a token-based flow; heartbeat/inventory/cmdb-sync use AgentKey auth.
 *
 * POST /api/v1/agents/enroll      — Token enrollment, returns agentKey
 * POST /api/v1/agents/heartbeat   — Heartbeat + optional metrics (AgentKey auth)
 * POST /api/v1/agents/inventory   — Inventory snapshot submission (AgentKey auth)
 * POST /api/v1/agents/cmdb-sync   — CMDB CI payload, enqueues reconciliation (AgentKey auth)
 */

/**
 * Check if the current server time falls within the configured maintenance window.
 */
function isWithinMaintenanceWindow(
  start: string | null,
  end: string | null,
  day: string | null,
): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  if (day && currentDay !== day.toLowerCase()) return false;

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Resolve agent from Authorization: AgentKey <key> header.
 * Returns the agent record or sends 401 and returns null.
 * Agent must not be DEREGISTERED (suspended/offline agents can still heartbeat).
 */
async function resolveAgent(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers['authorization'];
  const headerStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (!headerStr?.startsWith('AgentKey ')) {
    await reply.code(401).send({ error: 'AgentKey required' });
    return null;
  }

  const agentKey = headerStr.slice(9).trim();
  if (!agentKey) {
    await reply.code(401).send({ error: 'AgentKey required' });
    return null;
  }

  const agent = await prisma.agent.findFirst({
    where: { agentKey },
  });

  if (!agent || agent.status === ('DEREGISTERED' as never)) {
    await reply.code(401).send({ error: 'Invalid or inactive agent key' });
    return null;
  }

  return agent;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  // Register agent update package routes (upload, download, deploy, list)
  await app.register(agentUpdateRoutes);

  // ─── POST /api/v1/agents/enroll ───────────────────────────────────────────────
  // Public within external scope — validates enrollment token, creates Agent record.

  app.post('/api/v1/agents/enroll', async (request, reply) => {
    const body = request.body as {
      token?: string;
      hostname?: string;
      platform?: string;
      agentVersion?: string;
    };

    const { token, hostname, platform, agentVersion } = body;

    if (!token || !hostname || !platform) {
      return reply.code(400).send({ error: 'token, hostname, and platform are required' });
    }

    // Hash the submitted token for lookup
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();

    // Find an active, non-expired enrollment token
    const enrollmentToken = await prisma.agentEnrollmentToken.findFirst({
      where: {
        tokenHash,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (!enrollmentToken) {
      return reply.code(401).send({ error: 'Invalid or expired enrollment token' });
    }

    // Check enrollment limit (-1 means unlimited)
    if (enrollmentToken.maxEnrollments >= 0 && enrollmentToken.enrollCount >= enrollmentToken.maxEnrollments) {
      return reply.code(409).send({ error: 'Enrollment token max usage reached' });
    }

    // Normalize platform string to enum value
    const platformLower = platform.toLowerCase();
    let platformEnum: 'WINDOWS' | 'LINUX' | 'MACOS';
    if (platformLower.includes('windows')) platformEnum = 'WINDOWS';
    else if (platformLower.includes('linux')) platformEnum = 'LINUX';
    else if (platformLower.includes('macos') || platformLower.includes('darwin') || platformLower.includes('mac os')) platformEnum = 'MACOS';
    else {
      return reply.code(400).send({
        error: `Unable to determine platform from: "${platform}". Expected Windows, Linux, or macOS.`,
      });
    }

    // Check if an agent with this hostname already exists for this tenant.
    // If so, re-key it instead of creating a duplicate.
    const existingAgent = await prisma.agent.findFirst({
      where: { hostname, tenantId: enrollmentToken.tenantId },
      orderBy: { enrolledAt: 'desc' },
    });

    if (existingAgent) {
      // Re-enroll: generate new key, update existing record
      const newAgentKey = randomBytes(32).toString('hex');

      const updated = await prisma.$transaction(async (tx) => {
        const reEnrolled = await tx.agent.update({
          where: { id: existingAgent.id },
          data: {
            agentKey: newAgentKey,
            platform: platformEnum,
            agentVersion: agentVersion ?? null,
            status: 'ACTIVE',
            enrolledAt: now,
            lastHeartbeatAt: now,
          },
        });

        await tx.agentEnrollmentToken.update({
          where: { id: enrollmentToken.id },
          data: { enrollCount: { increment: 1 } },
        });

        return reEnrolled;
      });

      return reply.code(200).send({ agentKey: newAgentKey, agentId: updated.id });
    }

    // Generate a unique agent key for a brand-new agent
    const agentKey = randomBytes(32).toString('hex');

    // Transactionally create the agent and increment enrollCount
    const agent = await prisma.$transaction(async (tx) => {
      const newAgent = await tx.agent.create({
        data: {
          tenantId: enrollmentToken.tenantId,
          agentKey,
          hostname,
          platform: platformEnum,
          agentVersion: agentVersion ?? null,
          status: 'ACTIVE',
          enrolledAt: now,
          lastHeartbeatAt: now,
        },
      });

      await tx.agentEnrollmentToken.update({
        where: { id: enrollmentToken.id },
        data: { enrollCount: { increment: 1 } },
      });

      return newAgent;
    });

    return reply.code(201).send({ agentKey, agentId: agent.id });
  });

  // ─── POST /api/v1/agents/heartbeat ────────────────────────────────────────────
  // AgentKey auth — updates lastHeartbeatAt and optionally records metrics.

  app.post('/api/v1/agents/heartbeat', async (request, reply) => {
    const agent = await resolveAgent(request, reply);
    if (!agent) return;

    const body = (request.body ?? {}) as {
      agentVersion?: string;
      metrics?: Record<string, unknown>;
    };

    const updateData: Record<string, unknown> = {
      lastHeartbeatAt: new Date(),
      status: 'ACTIVE',
    };
    const versionChanged = body.agentVersion && body.agentVersion !== agent.agentVersion;
    if (body.agentVersion) {
      updateData.agentVersion = body.agentVersion;
      if (agent.updateInProgress) {
        updateData.updateInProgress = false;
        updateData.updateStartedAt = null;
      }
      if (agent.forceUpdateUrl) {
        updateData.forceUpdateUrl = null;
      }
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
    });

    // Log a HEARTBEAT event — throttled to one row per agent per 15 min so a
    // chatty agent doesn't bury the more interesting events. Also log a
    // reconnect event if the agent was offline for a while (>15 min gap).
    const now = new Date();
    const FIFTEEN_MIN = 15 * 60 * 1000;
    const priorBeat = agent.lastHeartbeatAt?.getTime() ?? 0;
    const gap = priorBeat ? now.getTime() - priorBeat : Infinity;
    const recentLog = await prisma.agentEventLog.findFirst({
      where: { tenantId: agent.tenantId, agentId: agent.id, category: 'HEARTBEAT' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const sinceLastLog = recentLog ? now.getTime() - recentLog.createdAt.getTime() : Infinity;
    if (sinceLastLog > FIFTEEN_MIN) {
      const reconnected = gap > FIFTEEN_MIN;
      await prisma.agentEventLog.create({
        data: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          level: 'INFO',
          category: 'HEARTBEAT',
          message: reconnected
            ? `Agent reconnected after ${Math.round(gap / 60000)} min offline`
            : 'Heartbeat received',
          context: body.agentVersion ? { agentVersion: body.agentVersion } : undefined,
          eventAt: now,
        },
      });
    }

    // If the agent just reported a new version, close out any pending
    // deployment target waiting for it.
    if (versionChanged && body.agentVersion) {
      const pendingTarget = await prisma.agentUpdateDeploymentTarget.findFirst({
        where: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          status: { in: ['PENDING', 'DOWNLOADING', 'INSTALLING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (pendingTarget && pendingTarget.toVersion === body.agentVersion) {
        await prisma.$transaction([
          prisma.agentUpdateDeploymentTarget.update({
            where: { id: pendingTarget.id },
            data: {
              status: 'SUCCESS',
              completedAt: new Date(),
              errorMessage: null,
            },
          }),
          prisma.agentUpdateDeployment.update({
            where: { id: pendingTarget.deploymentId },
            data: {
              successCount: { increment: 1 },
              pendingCount: { decrement: 1 },
            },
          }),
        ]);
        await prisma.agentEventLog.create({
          data: {
            tenantId: agent.tenantId,
            agentId: agent.id,
            level: 'INFO',
            category: 'UPDATE_INSTALLED',
            message: `Agent updated to v${body.agentVersion}`,
            context: {
              fromVersion: pendingTarget.fromVersion,
              toVersion: body.agentVersion,
              deploymentId: pendingTarget.deploymentId,
            },
            eventAt: new Date(),
          },
        });
      } else if (versionChanged && body.agentVersion) {
        // Version changed but not a tracked deployment (manual install etc.)
        await prisma.agentEventLog.create({
          data: {
            tenantId: agent.tenantId,
            agentId: agent.id,
            level: 'INFO',
            category: 'VERSION_CHANGED',
            message: `Agent version changed to v${body.agentVersion}`,
            context: { fromVersion: agent.agentVersion, toVersion: body.agentVersion },
            eventAt: new Date(),
          },
        });
      }
    }

    if (body.metrics && typeof body.metrics === 'object') {
      const metricEntries = Object.entries(body.metrics);
      if (metricEntries.length > 0) {
        await prisma.metricSample.createMany({
          data: metricEntries.map(([key, value]) => ({
            tenantId: agent.tenantId,
            agentId: agent.id,
            metricType: 'heartbeat',
            metricName: key,
            value: typeof value === 'number' ? value : 0,
            timestamp: new Date(),
          })),
        });
      }
    }

    let update: {
      latestVersion: string;
      updateUrl: string;
      checksum: string;
      fileSize: number;
    } | null = null;

    if (agent.forceUpdateUrl) {
      const forced = await prisma.agentUpdate.findFirst({
        where: { platform: agent.platform },
        orderBy: { createdAt: 'desc' },
      });
      if (forced) {
        update = {
          latestVersion: forced.version,
          updateUrl: agent.forceUpdateUrl,
          checksum: forced.checksum,
          fileSize: forced.fileSize,
        };
      }
    }

    if (!update && body.agentVersion) {
      const latest = await prisma.agentUpdate.findFirst({
        where: { platform: agent.platform },
        orderBy: { createdAt: 'desc' },
      });

      if (latest && latest.version > (body.agentVersion ?? '0.0.0')) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: agent.tenantId },
          select: {
            agentUpdatePolicy: true,
            agentUpdateWindowStart: true,
            agentUpdateWindowEnd: true,
            agentUpdateWindowDay: true,
          },
        });

        const policy = tenant?.agentUpdatePolicy ?? 'manual';
        let shouldIncludeUpdate = false;

        if (policy === 'auto') {
          shouldIncludeUpdate = true;
        } else if (policy === 'scheduled') {
          shouldIncludeUpdate = isWithinMaintenanceWindow(
            tenant?.agentUpdateWindowStart ?? null,
            tenant?.agentUpdateWindowEnd ?? null,
            tenant?.agentUpdateWindowDay ?? null,
          );
        }

        if (shouldIncludeUpdate) {
          update = {
            latestVersion: latest.version,
            // Relative path so the agent's authenticated client fetches via our
            // server and streams the binary (MinIO is not publicly routable).
            updateUrl: `api/v1/agents/updates/${agent.platform.toLowerCase()}`,
            checksum: latest.checksum,
            fileSize: latest.fileSize,
          };
        }
      }
    }

    return reply.code(200).send({ ok: true, update });
  });

  // ─── POST /api/v1/agents/inventory ────────────────────────────────────────────
  // AgentKey auth — stores inventory snapshot tenant-scoped.

  app.post('/api/v1/agents/inventory', async (request, reply) => {
    const agent = await resolveAgent(request, reply);
    if (!agent) return;

    const body = request.body as Record<string, unknown>;

    // Normalize OS field — agent sends { name, version, ... } object or a plain string
    const osObj = typeof body.os === 'object' && body.os !== null ? body.os as Record<string, unknown> : null;
    const osString = typeof body.os === 'string' ? body.os : (osObj?.name as string) ?? null;
    const osVersion = (osObj?.version as string) ?? null;
    const hw = (body.hardware ?? {}) as Record<string, unknown>;
    const cpus = Array.isArray(hw.cpus) ? hw.cpus as Record<string, unknown>[] : [];
    const firstCpu = cpus[0] ?? {};
    const totalMemBytes = typeof hw.totalMemoryBytes === 'number' ? hw.totalMemoryBytes : 0;
    const security = (body.security ?? {}) as Record<string, unknown>;
    const directory = (body.directory ?? {}) as Record<string, unknown>;
    const uptime = (body.uptime ?? {}) as Record<string, unknown>;
    const virt = (body.virtualization ?? {}) as Record<string, unknown>;
    const perf = (body.performance ?? {}) as Record<string, unknown>;

    // Create the InventorySnapshot with enriched fields
    const snapshot = await prisma.inventorySnapshot.create({
      data: {
        tenantId: agent.tenantId,
        agentId: agent.id,
        // Identity
        hostname: (body.hostname as string) ?? agent.hostname,
        fqdn: (body.fqdn as string) ?? null,
        deviceType: (body.deviceType as string) ?? null,
        // OS
        operatingSystem: osString,
        osVersion: osVersion,
        osBuild: (osObj?.buildNumber as string) ?? null,
        osEdition: (osObj?.edition as string) ?? null,
        // CPU
        cpuModel: (firstCpu.name as string) ?? null,
        cpuCores: typeof firstCpu.cores === 'number' ? firstCpu.cores : null,
        cpuThreads: typeof firstCpu.threads === 'number' ? firstCpu.threads : null,
        cpuSpeedMhz: typeof firstCpu.speedMhz === 'number' ? firstCpu.speedMhz : null,
        // Memory
        ramGb: totalMemBytes > 0 ? Math.round(totalMemBytes / 1073741824 * 100) / 100 : null,
        // Hardware identity
        serialNumber: (hw.serialNumber as string) ?? null,
        manufacturer: (hw.manufacturer as string) ?? null,
        model: (hw.model as string) ?? null,
        biosVersion: (hw.biosVersion as string) ?? null,
        tpmVersion: (hw.tpmVersion as string) ?? null,
        secureBootEnabled: typeof hw.secureBootEnabled === 'boolean' ? hw.secureBootEnabled : null,
        // Security (quick-query)
        diskEncrypted: typeof security.diskEncryptionEnabled === 'boolean' ? security.diskEncryptionEnabled : null,
        antivirusProduct: (security.antivirusProduct as string) ?? null,
        firewallEnabled: typeof security.firewallEnabled === 'boolean' ? security.firewallEnabled : null,
        // Directory
        domainName: (body.domainWorkgroup as string) ?? (directory.adDomainName as string) ?? null,
        // Virtualization
        isVirtual: typeof virt.isVirtual === 'boolean' ? virt.isVirtual : null,
        hypervisorType: (virt.hypervisorType as string) ?? null,
        // Uptime
        lastBootTime: uptime.lastBootTime ? new Date(uptime.lastBootTime as string) : null,
        uptimeSeconds: typeof uptime.uptime === 'object' && uptime.uptime !== null
          ? (uptime.uptime as { totalSeconds?: number }).totalSeconds ?? null
          : null,
        // Detailed JSON collections
        disks: hw.disks as never ?? null,
        networkInterfaces: body.network as never ?? null,
        installedSoftware: body.software as never ?? null,
        services: body.services as never ?? null,
        windowsUpdates: body.windowsUpdates as never ?? null,
        memoryModules: hw.memoryModules as never ?? null,
        gpus: hw.gpus as never ?? null,
        battery: hw.battery as never ?? null,
        monitors: hw.monitors as never ?? null,
        bitLockerVolumes: body.bitLockerVolumes as never ?? null,
        securityPosture: body.security as never ?? null,
        directoryStatus: body.directory as never ?? null,
        performance: body.performance as never ?? null,
        virtualization: body.virtualization as never ?? null,
        localUsers: body.localUsers as never ?? null,
        rawData: body as never,
        scanDurationMs: typeof body.scanDurationMs === 'number' ? body.scanDurationMs : null,
        collectedAt: new Date(),
      },
    });

    // Phase 8 (D-07 + CASR-06): synchronously translate the snapshot to CMDB
    // writes. Asset is NEVER touched by this path. Orphan Asset (no linked CI)
    // is auto-created per D-08 inside upsertServerExtensionByAsset.
    //
    // Multi-tenancy posture (CLAUDE.md Rule 1): `agent.tenantId` is the locked
    // tenant context (resolved by AgentKey above); upsertServerExtensionByAsset
    // itself enforces cross-tenant rejection (T-8-02-01 mitigation, Wave 1 Test 4).
    let extensionResult: { ciId: string; created: boolean } | null = null;
    try {
      // Phase 8 Wave 5 (CASR-01): Asset.hostname is dropped. The Wave 3
      // `prisma.asset.findFirst({ where: { tenantId, hostname } })` correlation
      // no longer compiles (Asset.hostname does not exist on the schema) and
      // would error at runtime against the dropped column.
      //
      // Until the Agent model gains a direct Asset FK (`Agent.assetId`) in
      // a later phase (planned for Phase 9 / CAID), we pass `null` for the
      // assetId — upsertServerExtensionByAsset's D-08 orphan-create path takes
      // over and provisions a CmdbConfigurationItem scoped to `agent.tenantId`.
      //
      // TODO (Phase 9 / CAID): replace with a stronger correlation key once
      // Agent has a direct `assetId` FK OR a unique `(serialNumber, manufacturer)`
      // canonical pair surfaces in the snapshot payload. See
      // .planning/phases/08-retire-asset-hardware-os-duplication/08-06-SUMMARY.md.
      const assetIdForExt: string | null = null;

      const installedSoftwareRaw = body.software ?? null;
      const snap: AgentInventorySnapshot = {
        hostname: ((body.hostname as string) ?? agent.hostname) ?? null,
        fqdn: (body.fqdn as string) ?? null,
        operatingSystem: osString,
        osVersion: osVersion,
        // map agent's first-CPU.cores -> CmdbCiServer.cpuCount
        cpuCount: typeof firstCpu.cores === 'number' ? (firstCpu.cores as number) : null,
        cpuModel: (firstCpu.name as string) ?? null,
        ramGb: totalMemBytes > 0 ? Math.round((totalMemBytes / 1073741824) * 100) / 100 : null,
        storageGb: null,
        disks: hw.disks ?? null,
        networkInterfaces: body.network ?? null,
        domainName: ((body.domainWorkgroup as string) ?? (directory.adDomainName as string)) ?? null,
        hypervisorType: (virt.hypervisorType as string) ?? null,
        isVirtual: typeof virt.isVirtual === 'boolean' ? (virt.isVirtual as boolean) : null,
        installedSoftware: installedSoftwareRaw as never,
      };

      extensionResult = await prisma.$transaction(async (tx) =>
        upsertServerExtensionByAsset(
          tx,
          agent.tenantId,
          assetIdForExt,
          snap,
          {
            source: 'agent',
            // CR-01: pass agentId so the service can dedup against an existing
            // CI by (tenantId, agentId) BEFORE falling through to the D-08
            // orphan-create branch. Without this, every inventory POST created
            // a new CI in the 15-minute window between reconciler runs.
            agentId: agent.id,
            // WR-01: agentKey becomes sourceRecordKey on the CI for parity
            // with cmdb-reconciliation worker's create payload.
            agentKey: agent.agentKey ?? null,
          },
        ),
      );
    } catch (err) {
      // Surface but do NOT fail the snapshot ingest — async worker is the
      // backstop (same non-blocking pattern as the BullMQ enqueue try/catch
      // immediately below).
      request.log.error(
        { err, snapshotId: snapshot.id },
        'Phase 8: upsertServerExtensionByAsset failed',
      );
    }

    // Auto-trigger CMDB reconciliation for this agent
    try {
      await cmdbReconciliationQueue.add('agent-inventory', {
        tenantId: agent.tenantId,
        agentId: agent.id,
        trigger: 'inventory-submit',
      });
    } catch {
      // Non-critical — reconciliation will still run on schedule
    }

    return reply.code(201).send({
      snapshotId: snapshot.id,
      ciId: extensionResult?.ciId ?? null,
      created: extensionResult?.created ?? false,
    });
  });

  // ─── POST /api/v1/agents/cmdb-sync ────────────────────────────────────────────
  // AgentKey auth — accepts CI payload and enqueues reconciliation job.

  app.post('/api/v1/agents/cmdb-sync', async (request, reply) => {
    const agent = await resolveAgent(request, reply);
    if (!agent) return;

    const body = request.body as Record<string, unknown>;

    // Enqueue CMDB reconciliation job with agent context
    await cmdbReconciliationQueue.add('agent-sync', {
      tenantId: agent.tenantId,
      agentId: agent.id,
      payload: body,
    });

    return reply.code(202).send({ status: 'queued' });
  });

  // ─── POST /api/v1/agents/events ───────────────────────────────────────────────
  // AgentKey auth — ingests batched events emitted by the agent.
  // Side-effects: map update-lifecycle events to AgentUpdateDeploymentTarget
  // status transitions so the admin UI reflects download / install / error.

  app.post('/api/v1/agents/events', async (request, reply) => {
    const agent = await resolveAgent(request, reply);
    if (!agent) return;

    const body = request.body as {
      events?: Array<{
        level?: string;
        category?: string;
        message?: string;
        context?: Record<string, unknown> | null;
        eventAt?: string;
      }>;
    };

    const raw = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
    if (raw.length === 0) return reply.code(200).send({ accepted: 0 });

    const VALID_LEVELS = new Set(['INFO', 'WARN', 'ERROR']);
    const normalized = raw
      .map((e) => {
        const level = (e.level ?? 'INFO').toUpperCase();
        if (!VALID_LEVELS.has(level)) return null;
        const msg = typeof e.message === 'string' ? e.message.slice(0, 4000) : '';
        if (!msg) return null;
        const eventAt = e.eventAt ? new Date(e.eventAt) : new Date();
        return {
          tenantId: agent.tenantId,
          agentId: agent.id,
          level,
          category: e.category ?? null,
          message: msg,
          context: (e.context ?? null) as never,
          eventAt: Number.isNaN(eventAt.getTime()) ? new Date() : eventAt,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    if (normalized.length > 0) {
      await prisma.agentEventLog.createMany({ data: normalized });
    }

    // Derive deployment-target state transitions from the batch.
    let desiredStatus: 'DOWNLOADING' | 'INSTALLING' | 'ERROR' | null = null;
    let errorMessage: string | null = null;
    for (const e of normalized) {
      const ctx = (e.context ?? {}) as Record<string, unknown>;
      const kind = typeof ctx.kind === 'string' ? ctx.kind : null;
      if (kind === 'update-error' || (e.category === 'update' && e.level === 'ERROR')) {
        desiredStatus = 'ERROR';
        errorMessage = e.message;
      } else if (kind === 'update-installing' && desiredStatus !== 'ERROR') {
        desiredStatus = 'INSTALLING';
      } else if (
        kind === 'update-downloading' &&
        desiredStatus !== 'ERROR' &&
        desiredStatus !== 'INSTALLING'
      ) {
        desiredStatus = 'DOWNLOADING';
      }
    }

    if (desiredStatus) {
      const openTarget = await prisma.agentUpdateDeploymentTarget.findFirst({
        where: {
          tenantId: agent.tenantId,
          agentId: agent.id,
          status: { in: ['PENDING', 'DOWNLOADING', 'INSTALLING'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (openTarget) {
        if (desiredStatus === 'ERROR') {
          await prisma.$transaction([
            prisma.agentUpdateDeploymentTarget.update({
              where: { id: openTarget.id },
              data: {
                status: 'ERROR',
                errorMessage: errorMessage?.slice(0, 2000) ?? 'Agent reported update error',
                completedAt: new Date(),
              },
            }),
            prisma.agentUpdateDeployment.update({
              where: { id: openTarget.deploymentId },
              data: { errorCount: { increment: 1 }, pendingCount: { decrement: 1 } },
            }),
          ]);
        } else if (openTarget.status !== desiredStatus) {
          await prisma.agentUpdateDeploymentTarget.update({
            where: { id: openTarget.id },
            data: {
              status: desiredStatus,
              startedAt: openTarget.startedAt ?? new Date(),
            },
          });
        }
      }
    }

    return reply.code(202).send({ accepted: normalized.length });
  });
}
