import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import { jsonResponse } from '../../../lib/serialize';

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

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? '';
  const plan = url.searchParams.get('plan') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    deletedAt: null,
  };

  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (plan) {
    where.plan = plan;
  }

  if (status) {
    where.status = status;
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        plan: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            trialEnd: true,
            currentPeriodEnd: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.tenant.count({ where }),
  ]);

  const pageCount = Math.ceil(total / limit);

  return jsonResponse({ tenants, total, page, pageCount });
}
