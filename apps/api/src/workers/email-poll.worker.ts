import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js';
import { pollMailbox } from '../services/email-inbound.service.js';

const QUEUE_NAME = 'email-polling';

// Create the queue
export const emailPollQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// Create the worker
export const emailPollWorker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log('[email-poll] Starting email poll cycle');

    // Get all active accounts with IMAP configured
    const accounts = await prisma.emailAccount.findMany({
      where: {
        isActive: true,
        imapHost: { not: null },
        imapUser: { not: null },
        imapPasswordEnc: { not: null },
      },
    });

    // Skip paused accounts
    const pausedAccountIds = new Set(
      (await prisma.emailPollJob.findMany({ where: { isPaused: true }, select: { emailAccountId: true } }))
        .map(j => j.emailAccountId)
    );

    let totalNew = 0;
    let totalComments = 0;

    for (const account of accounts) {
      if (pausedAccountIds.has(account.id)) continue;
      // Check if enough time has passed since last poll
      const intervalMs = (account.pollInterval ?? 5) * 60 * 1000;
      const lastPolled = account.lastPolledAt?.getTime() ?? 0;
      const now = Date.now();

      if (now - lastPolled < intervalMs) {
        continue; // Skip — not enough time elapsed for this account
      }

      try {
        const result = await pollMailbox(account);
        totalNew += result.newTickets;
        totalComments += result.comments;
        // Note: lastPolledAt and lastProcessedUid are now updated inside pollMailbox
      } catch (err) {
        // pollMailbox no longer throws, but guard just in case
        console.error(`[email-poll] Unexpected error polling account ${account.name}:`, err);
      }
    }

    return { totalNew, totalComments, accountsChecked: accounts.length };
  },
  {
    connection: redis,
    concurrency: 1, // Only one poll cycle at a time
  },
);

emailPollWorker.on('completed', (job) => {
  console.log(`[email-poll] Cycle completed:`, job?.returnvalue);
});

emailPollWorker.on('failed', (job, err) => {
  console.error(`[email-poll] Cycle failed:`, err.message);
});

/**
 * Start the repeating email poll job.
 * Runs every minute — individual account intervals are checked inside the worker.
 */
export async function startEmailPolling(): Promise<void> {
  // Remove any existing repeatable jobs
  const existing = await emailPollQueue.getRepeatableJobs();
  for (const job of existing) {
    await emailPollQueue.removeRepeatableByKey(job.key);
  }

  // Add a new repeatable job — runs every 1 minute
  // The worker checks each account's individual pollInterval
  await emailPollQueue.add('poll-cycle', {}, {
    repeat: { every: 60 * 1000 }, // every 1 minute
  });

  console.log('[email-poll] Email polling started (checking every 1 minute)');
}
