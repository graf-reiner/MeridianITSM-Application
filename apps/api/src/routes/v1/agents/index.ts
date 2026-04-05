import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@meridian/db';
import { Queue } from 'bullmq';

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

    // Generate a unique agent key
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

    // Update lastHeartbeatAt and optionally agentVersion
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        lastHeartbeatAt: new Date(),
        status: 'ACTIVE',
        ...(body.agentVersion ? { agentVersion: body.agentVersion } : {}),
      },
    });

    // If metrics provided, create a MetricSample for each metric
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

    return reply.code(200).send({ ok: true });
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

    return reply.code(201).send({ snapshotId: snapshot.id });
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
}
