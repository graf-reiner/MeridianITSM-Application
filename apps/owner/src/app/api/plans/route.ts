import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import { serialize } from '../../../lib/serialize';

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

  const plans = await prisma.subscriptionPlan.findMany({
    include: {
      _count: {
        select: {
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          },
        },
      },
    },
    orderBy: { monthlyPriceUsd: 'asc' },
  });

  return NextResponse.json(serialize({
    plans: plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      monthlyPriceUsd: plan.monthlyPriceUsd,
      annualPriceUsd: plan.annualPriceUsd,
      limitsJson: plan.limitsJson,
      stripePriceIdMonthly: plan.stripePriceIdMonthly,
      stripePriceIdAnnual: plan.stripePriceIdAnnual,
      isPublic: plan.isPublic,
      activeCount: plan._count.subscriptions,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    })),
  }));
}
