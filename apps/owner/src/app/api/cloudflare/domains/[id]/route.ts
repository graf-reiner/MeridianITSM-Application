// PATCH  /api/cloudflare/domains/:id — flip isDefault / isEnabled
// DELETE /api/cloudflare/domains/:id — refuses if any tenant references it

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { authenticateRequest } from '../../../../../lib/owner-auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    isDefault?: boolean;
    isEnabled?: boolean;
    zoneId?: string;
  };

  const existing = await prisma.cloudflareDomain.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.cloudflareDomain.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.cloudflareDomain.update({
        where: { id },
        data: {
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
          ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
          ...(body.zoneId ? { zoneId: body.zoneId.trim() } : {}),
        },
      });
    });
    return NextResponse.json({ domain: { ...saved, createdAt: saved.createdAt.toISOString(), updatedAt: saved.updatedAt.toISOString() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const tenantsUsing = await prisma.tenant.findMany({
    where: { cloudflareDomainId: id },
    select: { id: true, slug: true, name: true },
    take: 10,
  });
  if (tenantsUsing.length > 0) {
    return NextResponse.json(
      {
        error: 'Domain is in use by one or more tenants. Reassign them before deleting.',
        tenants: tenantsUsing,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.cloudflareDomain.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
