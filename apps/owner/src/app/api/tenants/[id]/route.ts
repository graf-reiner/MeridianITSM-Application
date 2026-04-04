import { prisma } from '@meridian/db';
import { NextResponse } from 'next/server';
import { serialize } from '../../../../lib/serialize';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const usage = await prisma.tenantUsageSnapshot.findFirst({
    where: { tenantId: id },
    orderBy: { snapshotDate: 'desc' },
  });

  const [userCount, noteCount] = await Promise.all([
    prisma.user.count({ where: { tenantId: id } }),
    prisma.ownerNote.count({ where: { tenantId: id } }),
  ]);

  return NextResponse.json(serialize({ tenant, subscription: tenant.subscription, usage, userCount, noteCount }));
}
