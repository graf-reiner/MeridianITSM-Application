import { prisma } from '@meridian/db';
import { NextResponse } from 'next/server';

type LifecycleAction = 'suspend' | 'unsuspend' | 'delete' | 'extend_trial' | 'apply_grace_period';

interface LifecycleBody {
  action: LifecycleAction;
  params?: { days?: number };
}

/**
 * POST /api/tenants/[id]/lifecycle
 * Performs lifecycle actions on a tenant:
 * - suspend: suspends the tenant
 * - unsuspend: reactivates a suspended tenant
 * - delete: soft-deletes (30-day recovery window)
 * - extend_trial: extends the trial by N days (default 7)
 * - apply_grace_period: extends current period by 3 days, sets ACTIVE if PAST_DUE
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: LifecycleBody;
  try {
    body = (await request.json()) as LifecycleBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, params: actionParams } = body;

  const validActions: LifecycleAction[] = ['suspend', 'unsuspend', 'delete', 'extend_trial', 'apply_grace_period'];
  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
      { status: 400 },
    );
  }

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { subscription: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const now = new Date();

  switch (action) {
    case 'suspend': {
      await prisma.$transaction([
        prisma.tenant.update({
          where: { id },
          data: { status: 'SUSPENDED', suspendedAt: now },
        }),
        ...(tenant.subscription
          ? [
              prisma.tenantSubscription.update({
                where: { tenantId: id },
                data: { status: 'SUSPENDED' },
              }),
            ]
          : []),
      ]);
      break;
    }

    case 'unsuspend': {
      await prisma.$transaction([
        prisma.tenant.update({
          where: { id },
          data: { status: 'ACTIVE', suspendedAt: null },
        }),
        ...(tenant.subscription
          ? [
              prisma.tenantSubscription.update({
                where: { tenantId: id },
                data: { status: 'ACTIVE' },
              }),
            ]
          : []),
      ]);
      break;
    }

    case 'delete': {
      // Soft delete with 30-day recovery window
      await prisma.tenant.update({
        where: { id },
        data: { status: 'DELETED', deletedAt: now },
      });
      break;
    }

    case 'extend_trial': {
      const days = actionParams?.days ?? 7;
      if (!tenant.subscription) {
        return NextResponse.json({ error: 'Tenant has no subscription to extend' }, { status: 400 });
      }
      const currentTrialEnd = tenant.subscription.trialEnd ?? now;
      const newTrialEnd = new Date(currentTrialEnd.getTime() + days * 24 * 60 * 60 * 1000);

      await prisma.tenantSubscription.update({
        where: { tenantId: id },
        data: {
          trialEnd: newTrialEnd,
          status: 'TRIALING',
        },
      });
      break;
    }

    case 'apply_grace_period': {
      if (!tenant.subscription) {
        return NextResponse.json({ error: 'Tenant has no subscription' }, { status: 400 });
      }
      const currentEnd = tenant.subscription.currentPeriodEnd ?? now;
      const newEnd = new Date(currentEnd.getTime() + 3 * 24 * 60 * 60 * 1000);

      await prisma.tenantSubscription.update({
        where: { tenantId: id },
        data: {
          currentPeriodEnd: newEnd,
          status: 'ACTIVE',
        },
      });
      break;
    }
  }

  return NextResponse.json({ success: true, action, tenantId: id });
}
