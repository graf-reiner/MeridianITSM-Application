import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import { jsonResponse } from '../../../lib/serialize';

type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyOwnerToken(token);
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const subscriptions = await prisma.tenantSubscription.findMany({
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      plan: { select: { id: true, name: true, displayName: true, monthlyPriceUsd: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by status
  const byStatus: Record<SubscriptionStatus, number> = {
    ACTIVE: 0,
    TRIALING: 0,
    PAST_DUE: 0,
    CANCELED: 0,
    SUSPENDED: 0,
  };

  let totalMrr = 0;

  for (const sub of subscriptions) {
    byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1;
    if (sub.status === 'ACTIVE' || sub.status === 'TRIALING') {
      totalMrr += sub.plan.monthlyPriceUsd;
    }
  }

  return jsonResponse({
    overview: {
      totalMrr,
      totalArr: totalMrr * 12,
      byStatus,
      totalTenants: subscriptions.length,
    },
    tenants: subscriptions.map(sub => ({
      tenantId: sub.tenantId,
      tenantName: sub.tenant.name,
      tenantSlug: sub.tenant.slug,
      tenantStatus: sub.tenant.status,
      planName: sub.plan.displayName,
      subscriptionStatus: sub.status,
      mrr: sub.plan.monthlyPriceUsd,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    })),
  });
}
