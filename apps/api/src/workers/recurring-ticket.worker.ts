// ─── Recurring Ticket Worker ──────────────────────────────────────────────────
// Runs every 5 minutes. Checks for recurring tickets whose nextRunAt has passed,
// creates a new ticket, and calculates the next run time.

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js';
import { getNextCronDate } from '../services/cron.service.js';

const QUEUE_NAME = 'recurring-tickets';

export const recurringTicketQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export const recurringTicketWorker = new Worker(
  QUEUE_NAME,
  async (_job: Job) => {
    const now = new Date();

    // Find all active recurring tickets due to run
    const dueItems = await prisma.recurringTicket.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
    });

    let created = 0;

    for (const item of dueItems) {
      try {
        // Generate ticket number atomically
        const result = await prisma.$queryRaw<[{ next: number }]>`
          SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
          FROM "tickets"
          WHERE "tenantId" = ${item.tenantId}::uuid
          FOR UPDATE
        `;
        const ticketNumber = result[0].next;

        // Create the ticket
        const ticket = await prisma.ticket.create({
          data: {
            tenantId: item.tenantId,
            ticketNumber,
            title: item.title,
            description: item.description,
            type: item.type,
            priority: item.priority,
            status: 'NEW',
            categoryId: item.categoryId,
            queueId: item.queueId,
            assignedToId: item.assignedToId,
            assignedGroupId: item.assignedGroupId,
            tags: item.tags,
            customFields: item.customFields ?? undefined,
            source: 'RECURRING',
            requestedById: item.createdById,
          },
        });

        // Log activity
        await prisma.ticketActivity.create({
          data: {
            tenantId: item.tenantId,
            ticketId: ticket.id,
            activityType: 'CREATED',
            metadata: { recurringTicketId: item.id, recurringTicketName: item.name },
          },
        });

        // Calculate next run
        const nextRunAt = getNextCronDate(item.schedule, item.timezone);

        await prisma.recurringTicket.update({
          where: { id: item.id },
          data: {
            lastRunAt: now,
            nextRunAt,
          },
        });

        created++;
      } catch (err) {
        console.error(`[recurring-tickets] Failed to create ticket from "${item.name}":`, err);
      }
    }

    return { checked: dueItems.length, created };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

recurringTicketWorker.on('completed', (job) => {
  const result = job?.returnvalue;
  if (result && result.created > 0) {
    console.log(`[recurring-tickets] Cycle completed:`, result);
  }
});

recurringTicketWorker.on('failed', (job, err) => {
  console.error(`[recurring-tickets] Cycle failed:`, err.message);
});

/**
 * Start the repeating recurring ticket check. Runs every 5 minutes.
 */
export async function startRecurringTickets(): Promise<void> {
  const existing = await recurringTicketQueue.getRepeatableJobs();
  for (const job of existing) {
    await recurringTicketQueue.removeRepeatableByKey(job.key);
  }

  await recurringTicketQueue.add('recurring-check', {}, {
    repeat: { every: 5 * 60 * 1000 },
  });

  console.log('[recurring-tickets] Recurring ticket worker started (checking every 5 minutes)');
}
