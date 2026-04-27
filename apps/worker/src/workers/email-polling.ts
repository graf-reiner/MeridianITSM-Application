import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';
import { pollMailbox } from '../services/email-inbound.service.js';

/**
 * Email Polling Worker — runs every 5 minutes via repeatable job.
 * Queries ALL active EmailAccount records across all tenants and polls each one.
 * One failing mailbox does not block others.
 */
export const emailPollingWorker = new Worker(
  QUEUE_NAMES.EMAIL_POLLING,
  async (job) => {
    // ── Ad-hoc single-account poll (job.name === 'poll-once') ────────────────
    // The api enqueues this when a connector test starts so the test sees its
    // own message arrive without waiting for the next 5-minute cycle.
    if (job.name === 'poll-once') {
      const data = job.data as { tenantId?: string; accountId?: string } | undefined;
      if (!data?.accountId || !data?.tenantId) {
        console.warn(`[email-polling] poll-once job ${job.id} missing tenantId/accountId, skipping`);
        return;
      }
      const account = await prisma.emailAccount.findFirst({
        where: { id: data.accountId, tenantId: data.tenantId, isActive: true },
      });
      if (!account) {
        console.warn(`[email-polling] poll-once: account ${data.accountId} not found / inactive for tenant ${data.tenantId}`);
        return;
      }
      try {
        const { newTickets, comments } = await pollMailbox(account);
        console.log(`[email-polling] poll-once for ${account.id}: ${newTickets} new tickets, ${comments} comments`);
      } catch (err) {
        console.error(`[email-polling] poll-once failed for ${account.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // ── Scheduled all-accounts cycle (default) ───────────────────────────────
    console.log(`[email-polling] Starting poll run (job ${job.id})`);

    const accounts = await prisma.emailAccount.findMany({
      where: { isActive: true, emailToTicket: true },
    });

    let totalNewTickets = 0;
    let totalComments = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const account of accounts) {
      try {
        const { newTickets, comments } = await pollMailbox(account);
        totalNewTickets += newTickets;
        totalComments += comments;
        successCount++;
      } catch (err) {
        errorCount++;
        console.error(
          `[email-polling] Failed to poll account ${account.id} (tenant ${account.tenantId}): ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue to next account — one failure should not block others
      }
    }

    console.log(
      `[email-polling] Polled ${accounts.length} accounts (${successCount} ok, ${errorCount} errors), created ${totalNewTickets} tickets, threaded ${totalComments} comments`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 2, // Allow ad-hoc poll-once to run alongside the scheduled cycle
  },
);

emailPollingWorker.on('failed', (job, err) => {
  console.error(`[email-polling] Job ${job?.id} failed:`, err.message);
});
