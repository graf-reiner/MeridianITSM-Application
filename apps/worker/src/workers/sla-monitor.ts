import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// Pure SLA math functions — duplicated from apps/api/src/services/sla.service.ts
// to avoid cross-app imports (same pattern as mapStripeStatus in stripe-webhook.ts)

function getElapsedPercentage(startTime: Date, breachAt: Date): number {
  const elapsed = Date.now() - startTime.getTime();
  const total = breachAt.getTime() - startTime.getTime();
  if (total <= 0) return 100;
  return Math.max(0, Math.round((elapsed / total) * 100));
}

function getSlaStatus(percentage: number): 'OK' | 'WARNING' | 'CRITICAL' | 'BREACHED' {
  if (percentage >= 100) return 'BREACHED';
  if (percentage >= 90) return 'CRITICAL';
  if (percentage >= 75) return 'WARNING';
  return 'OK';
}

export const slaMonitorWorker = new Worker(
  QUEUE_NAMES.SLA_MONITOR,
  async (job) => {
    console.log(`[sla-monitor] Running SLA breach check (job ${job.id})`);

    // Cross-tenant sentinel: processes all active tickets across all tenants.
    // Intentionally no per-tenant scoping — this is a global SLA check (see CONTEXT.md).
    const activeTickets = await prisma.ticket.findMany({
      where: {
        status: {
          notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'],
        },
        slaBreachAt: {
          not: null,
        },
      },
      include: {
        sla: true,
      },
    });

    console.log(`[sla-monitor] Checking ${activeTickets.length} active tickets with SLA`);

    for (const ticket of activeTickets) {
      // Skip if SLA timer is paused
      const customFields = ticket.customFields as Record<string, unknown> | null;
      if (customFields?.slaPausedAt) {
        continue;
      }

      if (!ticket.slaBreachAt) continue;

      const elapsedPct = getElapsedPercentage(ticket.createdAt, ticket.slaBreachAt);
      const status = getSlaStatus(elapsedPct);

      try {
        if (status === 'WARNING' && !customFields?.sla_75_notified) {
          // 75% threshold — notify assignee
          if (ticket.assignedToId) {
            await prisma.notification.create({
              data: {
                tenantId: ticket.tenantId,
                userId: ticket.assignedToId,
                type: 'SLA_WARNING',
                title: `SLA Warning: Ticket #${ticket.ticketNumber}`,
                body: `Ticket "${ticket.title}" has consumed 75% of its SLA time.`,
                resourceId: ticket.id,
                resource: 'ticket',
              },
            });
          }

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              customFields: { ...(customFields ?? {}), sla_75_notified: true } as any,
            },
          });

          console.log(`[sla-monitor] SLA 75% warning sent for ticket ${ticket.id}`);
        } else if (status === 'CRITICAL' && !customFields?.sla_90_notified) {
          // 90% threshold — notify assignee
          if (ticket.assignedToId) {
            await prisma.notification.create({
              data: {
                tenantId: ticket.tenantId,
                userId: ticket.assignedToId,
                type: 'SLA_WARNING',
                title: `SLA Critical: Ticket #${ticket.ticketNumber}`,
                body: `Ticket "${ticket.title}" has consumed 90% of its SLA time.`,
                resourceId: ticket.id,
                resource: 'ticket',
              },
            });
          }

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              customFields: { ...(customFields ?? {}), sla_90_notified: true } as any,
            },
          });

          console.log(`[sla-monitor] SLA 90% critical warning sent for ticket ${ticket.id}`);
        } else if (status === 'BREACHED' && !customFields?.sla_breached_notified) {
          // 100% threshold — notify assignee
          if (ticket.assignedToId) {
            await prisma.notification.create({
              data: {
                tenantId: ticket.tenantId,
                userId: ticket.assignedToId,
                type: 'SLA_BREACH',
                title: `SLA Breached: Ticket #${ticket.ticketNumber}`,
                body: `Ticket "${ticket.title}" has breached its SLA.`,
                resourceId: ticket.id,
                resource: 'ticket',
              },
            });
          }

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              customFields: { ...(customFields ?? {}), sla_breached_notified: true } as any,
            },
          });

          // Auto-escalation: if SLA has autoEscalate=true and escalateToQueueId is set
          if (ticket.sla?.autoEscalate && ticket.sla.escalateToQueueId) {
            await prisma.ticket.update({
              where: { id: ticket.id },
              data: { queueId: ticket.sla.escalateToQueueId },
            });

            await prisma.ticketActivity.create({
              data: {
                tenantId: ticket.tenantId,
                ticketId: ticket.id,
                actorId: null,
                activityType: 'ESCALATED',
                fieldName: 'queueId',
                oldValue: ticket.queueId ?? null,
                newValue: ticket.sla.escalateToQueueId,
                metadata: { reason: 'SLA breach auto-escalation' },
              },
            });

            console.log(`[sla-monitor] Auto-escalated ticket ${ticket.id} to queue ${ticket.sla.escalateToQueueId}`);
          }

          console.log(`[sla-monitor] SLA breach notification sent for ticket ${ticket.id}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[sla-monitor] Error processing ticket ${ticket.id}: ${message}`);
        // Continue processing remaining tickets — don't fail the whole job
      }
    }

    console.log(`[sla-monitor] SLA check complete`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Single-threaded: cross-tenant batch job, no parallelism needed
  },
);

slaMonitorWorker.on('failed', (job, err) => {
  console.error(`[sla-monitor] Job ${job?.id} failed:`, err.message);
});
