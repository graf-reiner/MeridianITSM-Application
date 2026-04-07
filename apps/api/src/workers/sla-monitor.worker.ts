// ─── SLA Breach Monitoring Worker ─────────────────────────────────────────────
// Runs every minute. Checks all open tickets with SLA policies for:
//   - WARNING: SLA elapsed >= 75% (first response or resolution)
//   - BREACH:  SLA elapsed >= 100%
// Dispatches notifications via the notification rules engine.
// Uses Redis to track which alerts have already been sent per ticket to avoid
// duplicate notifications.

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js';
import { getElapsedPercentage, getSlaStatus, type SlaStatusValue } from '../services/sla.service.js';
import { dispatchNotificationEvent } from '../services/notification-rules.service.js';

const QUEUE_NAME = 'sla-monitoring';

// Redis key prefix for tracking which alerts we've already sent
const ALERT_KEY_PREFIX = 'sla-alert:';

// How long to remember that we sent an alert (7 days)
const ALERT_TTL_SECONDS = 7 * 24 * 60 * 60;

interface EscalationLevel {
  level: number;
  afterMinutes: number;
  action: 'notify' | 'reassign' | 'escalate_queue';
  targetUserId?: string;
  targetQueueId?: string;
  notifyRoles?: string[];
}

/**
 * Execute escalation policy for a breached ticket.
 * Determines which escalation level applies based on how long the ticket
 * has been breached and executes the corresponding action.
 */
async function executeEscalation(
  ticket: { id: string; tenantId: string; ticketNumber: number; createdAt: Date; slaBreachAt: Date | null; sla: { escalationPolicy?: { id: string; levels: unknown; isActive: boolean } | null } | null },
  elapsedPct: number,
): Promise<void> {
  const policy = ticket.sla?.escalationPolicy;
  if (!policy || !policy.isActive) return;

  const levels = (policy.levels as EscalationLevel[]).sort((a, b) => a.afterMinutes - b.afterMinutes);
  if (levels.length === 0) return;

  // Calculate minutes since breach
  const breachAt = ticket.slaBreachAt;
  if (!breachAt) return;
  const minutesSinceBreach = Math.max(0, (Date.now() - breachAt.getTime()) / 60000);

  // Find the highest applicable escalation level
  let applicableLevel: EscalationLevel | null = null;
  for (const level of levels) {
    if (minutesSinceBreach >= level.afterMinutes) {
      applicableLevel = level;
    }
  }

  if (!applicableLevel) return;

  // Check if this escalation level was already executed
  const alertKey = `ESCALATION_L${applicableLevel.level}`;
  if (await hasAlertBeenSent(ticket.id, alertKey)) return;

  try {
    switch (applicableLevel.action) {
      case 'reassign':
        if (applicableLevel.targetUserId) {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { assignedToId: applicableLevel.targetUserId },
          });
          await prisma.ticketActivity.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              activityType: 'ESCALATED',
              metadata: { level: applicableLevel.level, action: 'reassign', targetUserId: applicableLevel.targetUserId },
            },
          });
        }
        break;

      case 'escalate_queue':
        if (applicableLevel.targetQueueId) {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { queueId: applicableLevel.targetQueueId },
          });
          await prisma.ticketActivity.create({
            data: {
              tenantId: ticket.tenantId,
              ticketId: ticket.id,
              activityType: 'ESCALATED',
              metadata: { level: applicableLevel.level, action: 'escalate_queue', targetQueueId: applicableLevel.targetQueueId },
            },
          });
        }
        break;

      case 'notify':
        // Notification is already handled by the SLA_BREACH dispatch above
        await prisma.ticketActivity.create({
          data: {
            tenantId: ticket.tenantId,
            ticketId: ticket.id,
            activityType: 'ESCALATED',
            metadata: { level: applicableLevel.level, action: 'notify' },
          },
        });
        break;
    }

    await markAlertSent(ticket.id, alertKey);
  } catch (err) {
    console.error(`[sla-monitor] Escalation failed for ticket ${ticket.ticketNumber}:`, err);
  }
}

export const slaMonitorQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

/**
 * Check if we've already sent a specific alert level for a ticket.
 * Returns true if already sent.
 */
async function hasAlertBeenSent(ticketId: string, alertType: string): Promise<boolean> {
  const key = `${ALERT_KEY_PREFIX}${ticketId}:${alertType}`;
  const exists = await redis.get(key);
  return exists !== null;
}

/**
 * Mark an alert as sent so we don't send it again.
 */
async function markAlertSent(ticketId: string, alertType: string): Promise<void> {
  const key = `${ALERT_KEY_PREFIX}${ticketId}:${alertType}`;
  await redis.set(key, '1', 'EX', ALERT_TTL_SECONDS);
}

/**
 * Clear alert tracking for a ticket (called when ticket is resolved/closed
 * so alerts can re-fire if it's reopened).
 */
export async function clearSlaAlerts(ticketId: string): Promise<void> {
  const keys = await redis.keys(`${ALERT_KEY_PREFIX}${ticketId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export const slaMonitorWorker = new Worker(
  QUEUE_NAME,
  async (_job: Job) => {
    // Find all open tickets that have an SLA policy and a breach timestamp
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING'] },
        slaId: { not: null },
        slaBreachAt: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        ticketNumber: true,
        title: true,
        type: true,
        priority: true,
        status: true,
        queueId: true,
        categoryId: true,
        assignedToId: true,
        assignedGroupId: true,
        requestedById: true,
        slaId: true,
        slaBreachAt: true,
        slaResponseAt: true,
        firstResponseAt: true,
        createdAt: true,
        customFields: true,
        sla: {
          select: {
            id: true,
            name: true,
            escalationPolicyId: true,
            escalationPolicy: { select: { id: true, levels: true, isActive: true } },
          },
        },
      },
    });

    let warnings = 0;
    let breaches = 0;

    for (const ticket of tickets) {
      // Skip PENDING tickets — SLA is paused
      if (ticket.status === 'PENDING') continue;

      try {
        // --- Check Resolution SLA ---
        const resolutionPct = getElapsedPercentage(ticket.createdAt, ticket.slaBreachAt!);
        const resolutionStatus = getSlaStatus(resolutionPct);

        if (resolutionStatus === 'BREACHED') {
          if (!(await hasAlertBeenSent(ticket.id, 'RESOLUTION_BREACH'))) {
            await dispatchNotificationEvent(ticket.tenantId, 'SLA_BREACH', {
              ticket: {
                id: ticket.id,
                ticketNumber: ticket.ticketNumber,
                title: ticket.title,
                type: ticket.type,
                priority: ticket.priority,
                status: ticket.status,
                queueId: ticket.queueId,
                categoryId: ticket.categoryId,
                assignedToId: ticket.assignedToId,
                assignedGroupId: ticket.assignedGroupId,
                requestedById: ticket.requestedById,
                slaId: ticket.slaId,
                slaBreachAt: ticket.slaBreachAt?.toISOString() ?? null,
              },
              slaPercentage: resolutionPct,
              slaPolicy: ticket.sla?.name ?? 'Unknown',
              breachType: 'RESOLUTION',
              actorId: 'system',
            });
            await markAlertSent(ticket.id, 'RESOLUTION_BREACH');
            breaches++;

            // Execute escalation policy if configured
            await executeEscalation(ticket, resolutionPct);
          }
        } else if (resolutionStatus === 'WARNING' || resolutionStatus === 'CRITICAL') {
          if (!(await hasAlertBeenSent(ticket.id, 'RESOLUTION_WARNING'))) {
            await dispatchNotificationEvent(ticket.tenantId, 'SLA_WARNING', {
              ticket: {
                id: ticket.id,
                ticketNumber: ticket.ticketNumber,
                title: ticket.title,
                type: ticket.type,
                priority: ticket.priority,
                status: ticket.status,
                queueId: ticket.queueId,
                categoryId: ticket.categoryId,
                assignedToId: ticket.assignedToId,
                assignedGroupId: ticket.assignedGroupId,
                requestedById: ticket.requestedById,
                slaId: ticket.slaId,
                slaBreachAt: ticket.slaBreachAt?.toISOString() ?? null,
              },
              slaPercentage: resolutionPct,
              slaPolicy: ticket.sla?.name ?? 'Unknown',
              breachType: 'RESOLUTION',
              actorId: 'system',
            });
            await markAlertSent(ticket.id, 'RESOLUTION_WARNING');
            warnings++;
          }
        }

        // --- Check Response SLA ---
        // Only check response SLA if no first response has been recorded yet
        if (!ticket.firstResponseAt && ticket.slaResponseAt) {
          const responsePct = getElapsedPercentage(ticket.createdAt, ticket.slaResponseAt);
          const responseStatus = getSlaStatus(responsePct);

          if (responseStatus === 'BREACHED') {
            if (!(await hasAlertBeenSent(ticket.id, 'RESPONSE_BREACH'))) {
              await dispatchNotificationEvent(ticket.tenantId, 'SLA_BREACH', {
                ticket: {
                  id: ticket.id,
                  ticketNumber: ticket.ticketNumber,
                  title: ticket.title,
                  type: ticket.type,
                  priority: ticket.priority,
                  status: ticket.status,
                  queueId: ticket.queueId,
                  categoryId: ticket.categoryId,
                  assignedToId: ticket.assignedToId,
                  assignedGroupId: ticket.assignedGroupId,
                  requestedById: ticket.requestedById,
                  slaId: ticket.slaId,
                  slaBreachAt: ticket.slaBreachAt?.toISOString() ?? null,
                },
                slaPercentage: responsePct,
                slaPolicy: ticket.sla?.name ?? 'Unknown',
                breachType: 'RESPONSE',
                actorId: 'system',
              });
              await markAlertSent(ticket.id, 'RESPONSE_BREACH');
              breaches++;
            }
          } else if (responseStatus === 'WARNING' || responseStatus === 'CRITICAL') {
            if (!(await hasAlertBeenSent(ticket.id, 'RESPONSE_WARNING'))) {
              await dispatchNotificationEvent(ticket.tenantId, 'SLA_WARNING', {
                ticket: {
                  id: ticket.id,
                  ticketNumber: ticket.ticketNumber,
                  title: ticket.title,
                  type: ticket.type,
                  priority: ticket.priority,
                  status: ticket.status,
                  queueId: ticket.queueId,
                  categoryId: ticket.categoryId,
                  assignedToId: ticket.assignedToId,
                  assignedGroupId: ticket.assignedGroupId,
                  requestedById: ticket.requestedById,
                  slaId: ticket.slaId,
                  slaBreachAt: ticket.slaBreachAt?.toISOString() ?? null,
                },
                slaPercentage: responsePct,
                slaPolicy: ticket.sla?.name ?? 'Unknown',
                breachType: 'RESPONSE',
                actorId: 'system',
              });
              await markAlertSent(ticket.id, 'RESPONSE_WARNING');
              warnings++;
            }
          }
        }
      } catch (err) {
        console.error(`[sla-monitor] Error checking ticket ${ticket.ticketNumber}:`, err);
      }
    }

    return { ticketsChecked: tickets.length, warnings, breaches };
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

slaMonitorWorker.on('completed', (job) => {
  const result = job?.returnvalue;
  if (result && (result.warnings > 0 || result.breaches > 0)) {
    console.log(`[sla-monitor] Cycle completed:`, result);
  }
});

slaMonitorWorker.on('failed', (job, err) => {
  console.error(`[sla-monitor] Cycle failed:`, err.message);
});

/**
 * Start the repeating SLA monitoring job. Runs every 60 seconds.
 */
export async function startSlaMonitoring(): Promise<void> {
  const existing = await slaMonitorQueue.getRepeatableJobs();
  for (const job of existing) {
    await slaMonitorQueue.removeRepeatableByKey(job.key);
  }

  await slaMonitorQueue.add('sla-check', {}, {
    repeat: { every: 60 * 1000 },
  });

  console.log('[sla-monitor] SLA monitoring started (checking every 1 minute)');
}
