import { Worker, type Job } from 'bullmq';
import { prisma } from '@meridian/db';
import { CloudflareApiError, CloudflareClient, decrypt, provisionCloudflareRoute } from '@meridian/core';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

interface TenantCfProvisionJobData {
  tenantId: string;
  hostname: string;
  cloudflareDomainId: string;
  retry?: boolean;
}

async function process(job: Job<TenantCfProvisionJobData>): Promise<void> {
  const { tenantId, hostname, cloudflareDomainId } = job.data;

  // Mark in-progress so the UI sees PROVISIONING (not just PENDING).
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { cfRouteStatus: 'PROVISIONING' },
    select: { cfOriginOverride: true },
  });

  const config = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  if (!config || !config.isEnabled) {
    throw new Error('Cloudflare integration is not configured or has been disabled');
  }
  const domain = await prisma.cloudflareDomain.findUnique({ where: { id: cloudflareDomainId } });
  if (!domain || !domain.isEnabled) {
    throw new Error(`Cloudflare domain '${cloudflareDomainId}' not found or disabled`);
  }

  const apiToken = decrypt(config.apiTokenEnc);
  const client = new CloudflareClient({ apiToken, accountId: config.accountId });

  const originService = tenant.cfOriginOverride?.trim() || config.defaultOrigin;
  const result = await provisionCloudflareRoute(client, {
    hostname,
    zoneId: domain.zoneId,
    tunnelId: config.tunnelId,
    tunnelCname: config.tunnelCname,
    originService,
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      cfRouteStatus: 'ACTIVE',
      cfRouteError: null,
      cfDnsRecordId: result.dnsRecordId,
      cfRouteProvisionedAt: new Date(),
    },
  });
  console.log(
    `[tenant-cf-provision] tenant=${tenantId} hostname=${hostname} ingressInserted=${result.ingressInserted} dnsCreated=${result.dnsRecordCreated}`,
  );
}

export const tenantCfProvisionWorker = new Worker<TenantCfProvisionJobData>(
  QUEUE_NAMES.TENANT_CF_PROVISION,
  async (job) => {
    try {
      await process(job);
    } catch (err) {
      const message =
        err instanceof CloudflareApiError
          ? `Cloudflare API: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      // On terminal failure (last attempt) BullMQ moves to failed; persist
      // the error message so the operator UI can show it.
      const lastAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
      if (lastAttempt) {
        await prisma.tenant
          .update({
            where: { id: job.data.tenantId },
            data: { cfRouteStatus: 'FAILED', cfRouteError: message.slice(0, 500) },
          })
          .catch((updateErr) =>
            console.error('[tenant-cf-provision] failed to persist FAILED status:', updateErr),
          );
      }
      throw err;
    }
  },
  {
    connection: bullmqConnection,
    // Cloudflare's tunnel-config PUT is last-writer-wins, so concurrent
    // provisions can silently drop ingress entries. Single-concurrency keeps
    // the read-modify-write race-free across the whole platform.
    concurrency: 1,
  },
);
