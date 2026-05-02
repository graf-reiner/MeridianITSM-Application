// ─── Auto-Close Worker ────────────────────────────────────────────────────────
// Runs every 15 minutes. Transitions RESOLVED tickets to CLOSED after a
// configurable number of days. Priority order for the threshold:
//   1. Queue.autoCloseDays (if ticket is in a queue with this set)
//   2. Category.autoCloseDays (if ticket has a category with this set)
//   3. Tenant.settings.autoCloseDays (tenant-level default)
//   4. Fallback: 3 days (hardcoded default)
//
// Creates a TicketActivity audit entry for each auto-closed ticket.

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js';
import { formatTicketNumber } from '@meridian/core';

const QUEUE_NAME = 'auto-close';
const DEFAULT_AUTO_CLOSE_DAYS = 3;

export const autoCloseQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export const autoCloseWorker = new Worker(
  QUEUE_NAME,
  async (_job: Job) => {
    // Find all RESOLVED tickets with a resolvedAt timestamp
    const resolvedTickets = await prisma.ticket.findMany({
      where: {
        status: 'RESOLVED',
        resolvedAt: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        ticketNumber: true,
        title: true,
        resolvedAt: true,
        queueId: true,
        categoryId: true,
        queue: { select: { autoCloseDays: true } },
        category: { select: { autoCloseDays: true } },
      },
    });

    if (resolvedTickets.length === 0) {
      return { closed: 0 };
    }

    // Group tickets by tenant to batch tenant settings lookups
    const byTenant = new Map<string, typeof resolvedTickets>();
    for (const ticket of resolvedTickets) {
      const list = byTenant.get(ticket.tenantId) ?? [];
      list.push(ticket);
      byTenant.set(ticket.tenantId, list);
    }

    // Load tenant settings for auto-close days
    const tenantSettings = new Map<string, number | null>();
    const tenantIds = [...byTenant.keys()];
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, settings: true },
    });
    for (const tenant of tenants) {
      const settings = tenant.settings as Record<string, unknown> | null;
      const days = settings?.autoCloseDays;
      tenantSettings.set(tenant.id, typeof days === 'number' ? days : null);
    }

    const now = Date.now();
    let closed = 0;

    for (const ticket of resolvedTickets) {
      // Determine threshold: queue > category > tenant > default
      const thresholdDays =
        ticket.queue?.autoCloseDays ??
        ticket.category?.autoCloseDays ??
        tenantSettings.get(ticket.tenantId) ??
        DEFAULT_AUTO_CLOSE_DAYS;

      const resolvedMs = ticket.resolvedAt!.getTime();
      const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

      if (now - resolvedMs >= thresholdMs) {
        try {
          await prisma.$transaction([
            prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                status: 'CLOSED',
                closedAt: new Date(),
              },
            }),
            prisma.ticketActivity.create({
              data: {
                tenantId: ticket.tenantId,
                ticketId: ticket.id,
                activityType: 'FIELD_CHANGED',
                fieldName: 'status',
                oldValue: 'RESOLVED',
                newValue: 'CLOSED',
                metadata: {
                  reason: 'auto-close',
                  autoCloseDays: thresholdDays,
                },
              },
            }),
          ]);
          closed++;
        } catch (err) {
          console.error(`[auto-close] Failed to close ticket ${formatTicketNumber(ticket.ticketNumber)}:`, err);
        }
      }
    }

    if (closed > 0) {
      console.log(`[auto-close] Auto-closed ${closed} ticket(s)`);
    }

    return { checked: resolvedTickets.length, closed };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

autoCloseWorker.on('completed', (job) => {
  const result = job?.returnvalue;
  if (result && result.closed > 0) {
    console.log(`[auto-close] Cycle completed:`, result);
  }
});

autoCloseWorker.on('failed', (job, err) => {
  console.error(`[auto-close] Cycle failed:`, err.message);
});

/**
 * Start the repeating auto-close job. Runs every 15 minutes.
 */
export async function startAutoClose(): Promise<void> {
  const existing = await autoCloseQueue.getRepeatableJobs();
  for (const job of existing) {
    await autoCloseQueue.removeRepeatableByKey(job.key);
  }

  await autoCloseQueue.add('auto-close-cycle', {}, {
    repeat: { every: 15 * 60 * 1000 }, // every 15 minutes
  });

  console.log('[auto-close] Auto-close worker started (checking every 15 minutes)');
}
