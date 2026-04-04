import { prisma } from '@meridian/db';
import { NextResponse } from 'next/server';
import { jsonResponse } from '../../../lib/serialize';

/**
 * GET /api/dashboard
 * Returns owner-level dashboard metrics:
 * - Tenant counts by status
 * - MRR and ARR from active subscriptions
 * - Recent activity (last 10 tenants created)
 * - MRR history for last 12 months
 */
export async function GET() {
  const [
    totalTenants,
    activeTenants,
    trialingTenants,
    suspendedTenants,
    recentActivity,
    activeSubscriptions,
  ] = await Promise.all([
    // Total (excluding deleted)
    prisma.tenant.count({
      where: { status: { not: 'DELETED' } },
    }),
    // Active
    prisma.tenant.count({
      where: { status: 'ACTIVE' },
    }),
    // Trialing
    prisma.tenantSubscription.count({
      where: { status: 'TRIALING' },
    }),
    // Suspended
    prisma.tenant.count({
      where: { status: 'SUSPENDED' },
    }),
    // Recent activity: last 10 tenants created
    prisma.tenant.findMany({
      where: { status: { not: 'DELETED' } },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // Active subscriptions for MRR calculation
    prisma.tenantSubscription.findMany({
      where: { status: 'ACTIVE' },
      include: {
        plan: {
          select: { monthlyPriceUsd: true },
        },
      },
    }),
  ]);

  // Calculate MRR from active subscriptions
  const mrr = activeSubscriptions.reduce((sum, sub) => sum + (sub.plan?.monthlyPriceUsd ?? 0), 0);
  const arr = mrr * 12;

  // MRR history: aggregate by month for the last 12 months
  // We derive this from TenantSubscription creation dates as a best approximation
  // (production would use TenantUsageSnapshot or dedicated billing events)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const historicalSubs = await prisma.tenantSubscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIALING'] },
      createdAt: { gte: twelveMonthsAgo },
    },
    include: {
      plan: { select: { monthlyPriceUsd: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Build monthly MRR buckets
  const mrrByMonth: Record<string, number> = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    mrrByMonth[key] = 0;
  }

  for (const sub of historicalSubs) {
    const d = sub.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in mrrByMonth) {
      mrrByMonth[key] += sub.plan?.monthlyPriceUsd ?? 0;
    }
  }

  const mrrHistory = Object.entries(mrrByMonth).map(([date, mrrVal]) => ({
    date,
    mrr: Math.round(mrrVal * 100) / 100,
    arr: Math.round(mrrVal * 12 * 100) / 100,
  }));

  const conversionRate =
    totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 10000) / 100 : 0;

  return jsonResponse({
    totalTenants,
    activeTenants,
    trialingTenants,
    suspendedTenants,
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(arr * 100) / 100,
    conversionRate,
    recentActivity,
    mrrHistory,
  });
}
