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
    concurrency: 1, // Cross-tenant sentinel — one run at a time
  },
);

emailPollingWorker.on('failed', (job, err) => {
  console.error(`[email-polling] Job ${job?.id} failed:`, err.message);
});
