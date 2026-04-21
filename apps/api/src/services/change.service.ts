import { prisma } from '@meridian/db';
import { notifyUser } from './notification.service.js';

// ─── State Machine ────────────────────────────────────────────────────────────

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW: ['ASSESSMENT', 'CANCELLED'],
  ASSESSMENT: ['APPROVAL_PENDING', 'CANCELLED'],
  APPROVAL_PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  REJECTED: [],
  SCHEDULED: ['IMPLEMENTING', 'CANCELLED'],
  IMPLEMENTING: ['REVIEW'],
  REVIEW: ['COMPLETED', 'IMPLEMENTING'],
  COMPLETED: [],
  CANCELLED: [],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChangeType = 'STANDARD' | 'NORMAL' | 'EMERGENCY';
export type ChangeStatus = keyof typeof ALLOWED_TRANSITIONS;
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CreateChangeData {
  title: string;
  description?: string;
  type?: ChangeType;
  implementationPlan?: string;
  backoutPlan?: string;
  testingPlan?: string;
  riskLevel?: RiskLevel;
  assignedToId?: string;
  scheduledStart?: Date | string;
  scheduledEnd?: Date | string;
  approvers?: string[];
}

export interface UpdateChangeData {
  title?: string;
  description?: string;
  implementationPlan?: string;
  backoutPlan?: string;
  testingPlan?: string;
  riskLevel?: RiskLevel;
  assignedToId?: string;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
}

export interface ChangeListFilters {
  status?: string;
  type?: string;
  riskLevel?: string;
  assignedToId?: string;
  requestedById?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  calendarStart?: string;
  calendarEnd?: string;
  page?: number;
  pageSize?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine initial status based on change type.
 * STANDARD changes are pre-approved; EMERGENCY goes straight to approval; NORMAL starts at NEW.
 */
export function getInitialStatus(type: ChangeType): ChangeStatus {
  switch (type) {
    case 'STANDARD':
      return 'APPROVED';
    case 'EMERGENCY':
      return 'APPROVAL_PENDING';
    case 'NORMAL':
    default:
      return 'NEW';
  }
}

/**
 * Calculate a risk score based on change attributes.
 * Returns a suggested RiskLevel.
 */
export function calculateRiskScore(
  type: ChangeType,
  affectedCICount = 0,
  hasCriticalApp = false,
): RiskLevel {
  // Base score: EMERGENCY=3, NORMAL=1, STANDARD=0
  let score = 0;
  if (type === 'EMERGENCY') score += 3;
  else if (type === 'NORMAL') score += 1;

  // +1 per affected CI (capped at 3)
  score += Math.min(affectedCICount, 3);

  // +1 if any affected app is CRITICAL criticality
  if (hasCriticalApp) score += 1;

  // Map total to RiskLevel
  if (score <= 1) return 'LOW';
  if (score <= 3) return 'MEDIUM';
  if (score <= 5) return 'HIGH';
  return 'CRITICAL';
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new change request with type-dependent initial status.
 * Uses FOR UPDATE lock for sequential changeNumber generation.
 */
export async function createChange(
  tenantId: string,
  data: CreateChangeData,
  userId: string,
) {
  const changeType: ChangeType = data.type ?? 'NORMAL';
  const initialStatus = getInitialStatus(changeType);

  return prisma.$transaction(async (tx) => {
    // Get next changeNumber atomically with advisory lock
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_change_seq'))`;
    const result = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX("changeNumber"), 0) + 1 AS next
      FROM changes
      WHERE "tenantId" = ${tenantId}::uuid
    `;

    const changeNumber = Number(result[0].next);

    // Create the change record
    const change = await tx.change.create({
      data: {
        tenantId,
        changeNumber,
        title: data.title,
        description: data.description,
        type: changeType,
        implementationPlan: data.implementationPlan,
        backoutPlan: data.backoutPlan,
        testingPlan: data.testingPlan,
        riskLevel: data.riskLevel ?? 'MEDIUM',
        status: initialStatus as any,
        requestedById: userId,
        assignedToId: data.assignedToId,
        scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : undefined,
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : undefined,
      },
    });

    // Log creation activity
    await tx.changeActivity.create({
      data: {
        tenantId,
        changeId: change.id,
        actorId: userId,
        activityType: 'CREATED',
        metadata: {
          title: change.title,
          type: change.type,
          riskLevel: change.riskLevel,
        },
      },
    });

    // For STANDARD: log STATUS_CHANGED from NEW to APPROVED (auto-approved)
    if (changeType === 'STANDARD') {
      await tx.changeActivity.create({
        data: {
          tenantId,
          changeId: change.id,
          actorId: userId,
          activityType: 'STATUS_CHANGED',
          fieldName: 'status',
          oldValue: 'NEW',
          newValue: 'APPROVED',
          metadata: { reason: 'Standard change auto-approved' },
        },
      });
    }

    // For NORMAL: create approval records if approvers provided (do not notify yet)
    if (changeType === 'NORMAL' && data.approvers && data.approvers.length > 0) {
      for (let i = 0; i < data.approvers.length; i++) {
        await tx.changeApproval.create({
          data: {
            tenantId,
            changeId: change.id,
            approverId: data.approvers[i],
            sequenceOrder: i,
            status: 'PENDING',
          },
        });
      }
    }

    // For EMERGENCY: create approvals and fire notifications immediately
    if (changeType === 'EMERGENCY' && data.approvers && data.approvers.length > 0) {
      for (let i = 0; i < data.approvers.length; i++) {
        await tx.changeApproval.create({
          data: {
            tenantId,
            changeId: change.id,
            approverId: data.approvers[i],
            sequenceOrder: i,
            status: 'PENDING',
          },
        });
      }
    }

    return change;
  }).then((createdChange) => {
    // Fire-and-forget: notify EMERGENCY approvers immediately
    if (changeType === 'EMERGENCY' && data.approvers && data.approvers.length > 0) {
      void (async () => {
        try {
          for (const approverId of data.approvers!) {
            await notifyUser({
              tenantId,
              userId: approverId,
              type: 'CHANGE_APPROVAL',
              title: `EMERGENCY: Change CHG-${createdChange.changeNumber} requires your approval`,
              body: createdChange.title,
              resourceId: createdChange.id,
              resource: 'change',
            });
          }
        } catch (err) {
          console.error('[change.service] emergency approval notification failed:', err);
        }
      })();
    }

    // Fire-and-forget: notify assignee if set
    if (data.assignedToId && data.assignedToId !== userId) {
      void (async () => {
        try {
          await notifyUser({
            tenantId,
            userId: data.assignedToId!,
            type: 'CHANGE_UPDATED',
            title: `Change CHG-${createdChange.changeNumber} assigned to you`,
            body: createdChange.title,
            resourceId: createdChange.id,
            resource: 'change',
          });
        } catch (err) {
          console.error('[change.service] assignee notification failed:', err);
        }
      })();
    }

    return createdChange;
  });
}

/**
 * Get a change by ID with full relations included.
 * Renames Prisma relation names (changeAssets, changeApplications) to frontend-friendly names.
 */
export async function getChange(tenantId: string, changeId: string) {
  const change = await prisma.change.findFirst({
    where: { id: changeId, tenantId },
    include: {
      approvals: {
        include: {
          approver: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { sequenceOrder: 'asc' },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      changeAssets: {
        include: {
          asset: {
            select: { id: true, assetTag: true, model: true, status: true },
          },
        },
      },
      changeApplications: {
        include: {
          application: {
            select: { id: true, name: true, criticality: true },
          },
        },
      },
      cabMeetingChanges: {
        include: {
          meeting: {
            select: { id: true, title: true, scheduledFor: true, status: true },
          },
        },
      },
    },
  });

  if (!change) return null;

  // Transform to frontend-friendly shape: assets, applications, meetings
  const { changeAssets, changeApplications, cabMeetingChanges, ...rest } = change;
  return {
    ...rest,
    assets: changeAssets,
    applications: changeApplications,
    meetings: cabMeetingChanges,
  };
}

/**
 * List changes for a tenant with filters and pagination.
 * Supports calendar range query for calendar view data.
 */
export async function listChanges(tenantId: string, filters: ChangeListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId };

  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.riskLevel) where.riskLevel = filters.riskLevel;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.requestedById) where.requestedById = filters.requestedById;

  if (filters.dateFrom || filters.dateTo) {
    where.scheduledStart = {};
    if (filters.dateFrom) (where.scheduledStart as Record<string, unknown>).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.scheduledStart as Record<string, unknown>).lte = new Date(filters.dateTo);
  }

  // Calendar range: find changes with scheduled dates overlapping the range
  if (filters.calendarStart && filters.calendarEnd) {
    const calStart = new Date(filters.calendarStart);
    const calEnd = new Date(filters.calendarEnd);
    where.AND = [
      { scheduledStart: { lt: calEnd } },
      { scheduledEnd: { gt: calStart } },
    ];
  }

  if (filters.search) {
    const searchNum = parseInt(filters.search, 10);
    const searchConditions: unknown[] = [
      { title: { contains: filters.search, mode: 'insensitive' } },
    ];
    if (!isNaN(searchNum)) {
      searchConditions.push({ changeNumber: searchNum });
    }
    where.OR = searchConditions;
  }

  const [data, total] = await Promise.all([
    prisma.change.findMany({
      where,
      include: {
        approvals: {
          select: { id: true, approverId: true, status: true, sequenceOrder: true },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.change.count({ where }),
  ]);

  return { data, total, page, pageSize };
}

/**
 * Update a change's mutable fields.
 */
export async function updateChange(
  tenantId: string,
  changeId: string,
  data: UpdateChangeData,
  userId: string,
) {
  const existing = await prisma.change.findFirst({ where: { id: changeId, tenantId } });
  if (!existing) {
    const err = new Error('Change not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // ITIL: what can be edited depends on lifecycle state. Approvers vote on a
  // specific proposal; silently editing plan/backout after approval would
  // invalidate the audit trail.
  //   NEW, ASSESSMENT        → full edit (draft)
  //   APPROVAL_PENDING, APPROVED, SCHEDULED → locked; must be recalled first
  //   IMPLEMENTING, REVIEW   → only actualStart/actualEnd/assignedToId
  //   COMPLETED, REJECTED, CANCELLED → fully locked
  const status = existing.status as string;
  const isDraft = status === 'NEW' || status === 'ASSESSMENT';
  const isImplementing = status === 'IMPLEMENTING' || status === 'REVIEW';
  const isLocked = !isDraft && !isImplementing;
  if (isLocked) {
    const err = new Error(
      `Change is ${status} and cannot be edited directly. Recall it to ASSESSMENT to make changes.`,
    ) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }
  if (isImplementing) {
    const allowedInImplementing = new Set(['assignedToId', 'actualStart', 'actualEnd']);
    for (const key of Object.keys(data) as (keyof UpdateChangeData)[]) {
      if (data[key] === undefined) continue;
      if (!allowedInImplementing.has(key)) {
        const err = new Error(
          `Field '${key}' cannot be edited after approval. Only implementation timing and assignee are editable in ${status}.`,
        ) as Error & { statusCode: number };
        err.statusCode = 409;
        throw err;
      }
    }
  }

  const updates: Record<string, unknown> = {};
  const changedFields: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

  const track = (field: string, oldVal: unknown, newVal: unknown) => {
    if (newVal !== undefined && String(newVal ?? '') !== String(oldVal ?? '')) {
      updates[field] = newVal;
      changedFields.push({
        fieldName: field,
        oldValue: String(oldVal ?? ''),
        newValue: String(newVal ?? ''),
      });
    }
  };

  track('title', existing.title, data.title);
  track('description', existing.description, data.description);
  track('implementationPlan', existing.implementationPlan, data.implementationPlan);
  track('backoutPlan', existing.backoutPlan, data.backoutPlan);
  track('testingPlan', existing.testingPlan, data.testingPlan);
  track('riskLevel', existing.riskLevel, data.riskLevel);
  track('assignedToId', existing.assignedToId, data.assignedToId);

  if (data.scheduledStart !== undefined) {
    const newVal = data.scheduledStart ? new Date(data.scheduledStart) : null;
    track('scheduledStart', existing.scheduledStart?.toISOString(), newVal?.toISOString());
    if (data.scheduledStart !== undefined) updates.scheduledStart = newVal;
  }
  if (data.scheduledEnd !== undefined) {
    const newVal = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
    track('scheduledEnd', existing.scheduledEnd?.toISOString(), newVal?.toISOString());
    if (data.scheduledEnd !== undefined) updates.scheduledEnd = newVal;
  }
  if (data.actualStart !== undefined) {
    const newVal = data.actualStart ? new Date(data.actualStart) : null;
    updates.actualStart = newVal;
  }
  if (data.actualEnd !== undefined) {
    const newVal = data.actualEnd ? new Date(data.actualEnd) : null;
    updates.actualEnd = newVal;
  }

  return prisma.$transaction(async (tx) => {
    const change = await tx.change.update({
      where: { id: changeId },
      data: updates,
    });

    for (const changed of changedFields) {
      await tx.changeActivity.create({
        data: {
          tenantId,
          changeId,
          actorId: userId,
          activityType: 'FIELD_CHANGED',
          fieldName: changed.fieldName,
          oldValue: changed.oldValue,
          newValue: changed.newValue,
        },
      });
    }

    return change;
  }).then((updatedChange) => {
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      void (async () => {
        try {
          await notifyUser({
            tenantId,
            userId: data.assignedToId!,
            type: 'CHANGE_UPDATED',
            title: `Change CHG-${updatedChange.changeNumber} assigned to you`,
            body: updatedChange.title,
            resourceId: updatedChange.id,
            resource: 'change',
          });
        } catch (err) {
          console.error('[change.service] update assignment notification failed:', err);
        }
      })();
    }
    return updatedChange;
  });
}

/**
 * Transition a change from its current status to newStatus.
 * Validates against ALLOWED_TRANSITIONS and throws a 409 if invalid.
 */
export async function transitionStatus(
  tenantId: string,
  changeId: string,
  newStatus: string,
  userId: string,
) {
  const change = await prisma.change.findFirst({
    where: { id: changeId, tenantId },
    include: {
      approvals: true,
    },
  });

  if (!change) {
    const err = new Error('Change not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const currentStatus = change.status as string;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    const err = new Error(
      `Cannot transition from ${currentStatus} to ${newStatus}`,
    ) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  // Validate: must have at least one approver before transitioning to APPROVAL_PENDING
  if (newStatus === 'APPROVAL_PENDING') {
    if (change.approvals.length === 0) {
      const err = new Error(
        'Cannot transition to APPROVAL_PENDING without at least one approver',
      ) as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
  }

  // Validate: all NORMAL type approvals must be APPROVED before transitioning to APPROVED
  if (newStatus === 'APPROVED' && change.type === 'NORMAL') {
    const pendingOrRejected = change.approvals.filter(
      (a) => a.status === 'PENDING' || a.status === 'REJECTED',
    );
    if (pendingOrRejected.length > 0) {
      const err = new Error(
        'Cannot transition to APPROVED — not all approvers have approved',
      ) as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
  }

  const updatedChange = await prisma.$transaction(async (tx) => {
    const updated = await tx.change.update({
      where: { id: changeId },
      data: { status: newStatus as any },
    });

    await tx.changeActivity.create({
      data: {
        tenantId,
        changeId,
        actorId: userId,
        activityType: 'STATUS_CHANGED',
        fieldName: 'status',
        oldValue: currentStatus,
        newValue: newStatus,
      },
    });

    return updated;
  });

  // Fire-and-forget notifications to requestedBy and assignedTo
  const notifyIds = new Set<string>();
  if (change.requestedById && change.requestedById !== userId) notifyIds.add(change.requestedById);
  if (change.assignedToId && change.assignedToId !== userId) notifyIds.add(change.assignedToId);

  if (notifyIds.size > 0) {
    void (async () => {
      try {
        for (const notifyUserId of notifyIds) {
          await notifyUser({
            tenantId,
            userId: notifyUserId,
            type: 'CHANGE_UPDATED',
            title: `Change CHG-${updatedChange.changeNumber} status changed to ${newStatus}`,
            body: updatedChange.title,
            resourceId: updatedChange.id,
            resource: 'change',
          });
        }
      } catch (err) {
        console.error('[change.service] status transition notification failed:', err);
      }
    })();
  }

  // If this Change is linked to an agent-deploy, propagate the transition.
  if (newStatus === 'APPROVED' || newStatus === 'REJECTED' || newStatus === 'CANCELLED') {
    try {
      await applyAgentDeployChangeTransition(tenantId, changeId, newStatus);
    } catch (err) {
      console.error('[change.service] agent-deploy change hook failed:', err);
    }
  }

  return updatedChange;
}

/**
 * ITIL recall: pull a change back to ASSESSMENT so the requester can correct
 * it. Allowed from APPROVAL_PENDING / APPROVED / SCHEDULED. Clears all approval
 * decisions so a corrected change can't inherit a stale "approved" vote.
 *
 * Reason is required and captured in the activity trail for audit.
 */
export async function recallChange(
  tenantId: string,
  changeId: string,
  userId: string,
  reason: string,
) {
  if (!reason || reason.trim().length < 3) {
    const err = new Error('Recall requires a reason (3+ characters)') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.change.findFirst({
    where: { id: changeId, tenantId },
    select: { id: true, status: true, changeNumber: true, title: true, requestedById: true, assignedToId: true },
  });
  if (!existing) {
    const err = new Error('Change not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const recallable = new Set(['APPROVAL_PENDING', 'APPROVED', 'SCHEDULED']);
  if (!recallable.has(existing.status as string)) {
    const err = new Error(
      `Change is ${existing.status} and cannot be recalled. Recall is only valid from APPROVAL_PENDING, APPROVED, or SCHEDULED.`,
    ) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Wipe approval decisions — a recalled change must be fully re-voted on
    await tx.changeApproval.deleteMany({ where: { tenantId, changeId } });

    const change = await tx.change.update({
      where: { id: changeId },
      data: { status: 'ASSESSMENT' as any },
    });

    await tx.changeActivity.create({
      data: {
        tenantId,
        changeId,
        actorId: userId,
        activityType: 'RECALLED',
        fieldName: 'status',
        oldValue: existing.status as string,
        newValue: 'ASSESSMENT',
        metadata: { reason: reason.trim() },
      },
    });

    return change;
  });

  // Notify requester + assignee (if different from the recaller) so they know
  // the change was pulled back and needs attention.
  const notifyIds = new Set<string>();
  if (existing.requestedById && existing.requestedById !== userId) notifyIds.add(existing.requestedById);
  if (existing.assignedToId && existing.assignedToId !== userId) notifyIds.add(existing.assignedToId);
  if (notifyIds.size > 0) {
    void (async () => {
      try {
        for (const nid of notifyIds) {
          await notifyUser({
            tenantId,
            userId: nid,
            type: 'CHANGE_UPDATED',
            title: `Change CHG-${updated.changeNumber} recalled to ASSESSMENT`,
            body: `Reason: ${reason.trim()}`,
            resourceId: updated.id,
            resource: 'change',
          });
        }
      } catch (err) {
        console.error('[change.service] recall notification failed:', err);
      }
    })();
  }

  return updated;
}

/**
 * When a Change that gates an agent deployment transitions, propagate it to the
 * deployment. APPROVED → push forceUpdateUrl to all PENDING targets so agents
 * pick up the update on next heartbeat. REJECTED/CANCELLED → mark targets
 * CANCELLED; the agents were never told to update in the first place.
 */
async function applyAgentDeployChangeTransition(
  tenantId: string,
  changeId: string,
  newStatus: 'APPROVED' | 'REJECTED' | 'CANCELLED',
) {
  const deployment = await prisma.agentUpdateDeployment.findFirst({
    where: { tenantId, changeId },
    include: { targets: true },
  });
  if (!deployment || !deployment.awaitingApproval) return;

  if (newStatus === 'APPROVED') {
    const forceUpdateUrl = `api/v1/agents/updates/${deployment.platform.toLowerCase()}`;
    const pendingTargets = deployment.targets.filter((t) => t.status === 'PENDING');
    const agentIds = pendingTargets.map((t) => t.agentId);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (agentIds.length > 0) {
        await tx.agent.updateMany({
          where: { tenantId, id: { in: agentIds } },
          data: { forceUpdateUrl, updateStartedAt: now, updateInProgress: true },
        });
      }
      await tx.agentUpdateDeployment.update({
        where: { id: deployment.id },
        data: { awaitingApproval: false },
      });
    });
  } else {
    // REJECTED or CANCELLED
    await prisma.$transaction(async (tx) => {
      await tx.agentUpdateDeploymentTarget.updateMany({
        where: { tenantId, deploymentId: deployment.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.agentUpdateDeployment.update({
        where: { id: deployment.id },
        data: { awaitingApproval: false },
      });
    });
  }
}

/**
 * Add an approver to a change.
 */
export async function addApprover(
  tenantId: string,
  changeId: string,
  approverId: string,
  sequenceOrder: number,
  actorId: string,
) {
  const change = await prisma.change.findFirst({
    where: { id: changeId, tenantId },
    select: { id: true, changeNumber: true, title: true },
  });

  if (!change) {
    const err = new Error('Change not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const approval = await prisma.$transaction(async (tx) => {
    const newApproval = await tx.changeApproval.create({
      data: {
        tenantId,
        changeId,
        approverId,
        sequenceOrder,
        status: 'PENDING',
      },
    });

    await tx.changeActivity.create({
      data: {
        tenantId,
        changeId,
        actorId,
        activityType: 'APPROVER_ADDED',
        metadata: { approverId, sequenceOrder },
      },
    });

    return newApproval;
  });

  // Fire-and-forget: notify the approver
  void (async () => {
    try {
      await notifyUser({
        tenantId,
        userId: approverId,
        type: 'CHANGE_APPROVAL',
        title: `Change CHG-${change.changeNumber} requires your approval`,
        body: change.title,
        resourceId: changeId,
        resource: 'change',
      });
    } catch (err) {
      console.error('[change.service] add approver notification failed:', err);
    }
  })();

  return approval;
}

/**
 * Record an approval decision from an approver.
 * Enforces sequential ordering — only the current minimum-sequenceOrder PENDING approver can decide.
 */
export async function recordApproval(
  tenantId: string,
  changeId: string,
  approverId: string,
  decision: 'APPROVED' | 'REJECTED',
  comments?: string,
  actorId?: string,
) {
  const change = await prisma.change.findFirst({
    where: { id: changeId, tenantId },
    include: { approvals: { orderBy: { sequenceOrder: 'asc' } } },
  });

  if (!change) {
    const err = new Error('Change not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Find this approver's record
  const approval = change.approvals.find((a) => a.approverId === approverId);
  if (!approval) {
    const err = new Error('Approver not found on this change') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (approval.status !== 'PENDING') {
    const err = new Error('This approver has already made a decision') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  // Enforce sequential order: approver must be current minimum-sequenceOrder PENDING
  const pendingApprovals = change.approvals.filter((a) => a.status === 'PENDING');
  const minSequenceOrder = Math.min(...pendingApprovals.map((a) => a.sequenceOrder));
  if (approval.sequenceOrder !== minSequenceOrder) {
    const err = new Error(
      'It is not yet this approver\'s turn — earlier approvers must decide first',
    ) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  // Update the approval record
  await prisma.$transaction(async (tx) => {
    await tx.changeApproval.update({
      where: { id: approval.id },
      data: { status: decision, decidedAt: new Date(), comments },
    });

    await tx.changeActivity.create({
      data: {
        tenantId,
        changeId,
        actorId: actorId ?? approverId,
        activityType: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        metadata: { approverId, decision, comments },
      },
    });
  });

  // Re-fetch approvals to determine next state
  const updatedApprovals = await prisma.changeApproval.findMany({
    where: { changeId, tenantId },
    orderBy: { sequenceOrder: 'asc' },
  });

  if (decision === 'REJECTED') {
    // Reject the whole change
    await transitionStatus(tenantId, changeId, 'REJECTED', actorId ?? approverId);
  } else {
    // Check if all approvers have approved
    const allApproved = updatedApprovals.every((a) => a.status === 'APPROVED');
    if (allApproved) {
      await transitionStatus(tenantId, changeId, 'APPROVED', actorId ?? approverId);
    } else {
      // Notify the next approver (next minimum PENDING)
      const remainingPending = updatedApprovals.filter((a) => a.status === 'PENDING');
      if (remainingPending.length > 0) {
        const nextApprover = remainingPending.reduce((min, a) =>
          a.sequenceOrder < min.sequenceOrder ? a : min,
        );
        void (async () => {
          try {
            await notifyUser({
              tenantId,
              userId: nextApprover.approverId,
              type: 'CHANGE_APPROVAL',
              title: `Change CHG-${change.changeNumber} requires your approval`,
              body: change.title,
              resourceId: changeId,
              resource: 'change',
            });
          } catch (err) {
            console.error('[change.service] next approver notification failed:', err);
          }
        })();
      }
    }
  }

  return { success: true, decision };
}

/**
 * Detect scheduling collisions with existing SCHEDULED or IMPLEMENTING changes.
 * Uses a date overlap query (start < end AND end > start).
 */
export async function getCollisions(
  tenantId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeChangeId?: string,
) {
  return prisma.change.findMany({
    where: {
      tenantId,
      status: { in: ['SCHEDULED', 'IMPLEMENTING'] },
      scheduledStart: { lt: scheduledEnd },
      scheduledEnd: { gt: scheduledStart },
      ...(excludeChangeId ? { id: { not: excludeChangeId } } : {}),
    },
    select: {
      id: true,
      changeNumber: true,
      title: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });
}

/**
 * Link an asset to a change.
 */
export async function linkAsset(
  tenantId: string,
  changeId: string,
  assetId: string,
) {
  return prisma.changeAsset.create({
    data: { tenantId, changeId, assetId },
  });
}

/**
 * Link an application to a change.
 */
export async function linkApplication(
  tenantId: string,
  changeId: string,
  applicationId: string,
) {
  return prisma.changeApplication.create({
    data: { tenantId, changeId, applicationId },
  });
}
