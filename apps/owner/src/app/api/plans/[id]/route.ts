import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonResponse } from '../../../../lib/serialize';

const limitsJsonSchema = z.object({
  maxUsers: z.number().int().nonnegative(),
  maxAgents: z.number().int().nonnegative(),
  maxSites: z.number().int().nonnegative(),
  features: z.array(z.string()),
});

const updatePlanSchema = z.object({
  displayName: z.string().min(1).optional(),
  monthlyPriceUsd: z.number().nonnegative().optional(),
  annualPriceUsd: z.number().nonnegative().optional(),
  limitsJson: limitsJsonSchema.optional(),
  stripePriceIdMonthly: z.string().nullable().optional(),
  stripePriceIdAnnual: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
});

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] } } },
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  return jsonResponse({
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
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updatePlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { limitsJson, ...rest } = parsed.data;

  const updated = await prisma.subscriptionPlan.update({
    where: { id },
    data: {
      ...rest,
      ...(limitsJson !== undefined ? { limitsJson } : {}),
    },
  });

  return jsonResponse({
    id: updated.id,
    name: updated.name,
    displayName: updated.displayName,
    monthlyPriceUsd: updated.monthlyPriceUsd,
    annualPriceUsd: updated.annualPriceUsd,
    limitsJson: updated.limitsJson,
    stripePriceIdMonthly: updated.stripePriceIdMonthly,
    stripePriceIdAnnual: updated.stripePriceIdAnnual,
    isPublic: updated.isPublic,
    updatedAt: updated.updatedAt,
  });
}
