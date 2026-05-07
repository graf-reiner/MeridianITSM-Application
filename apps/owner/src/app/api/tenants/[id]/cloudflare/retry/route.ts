// POST /api/tenants/:id/cloudflare/retry — re-enqueue Cloudflare provisioning
// Allowed when cfRouteStatus is FAILED or NONE (operator opt-in to retry).

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { authenticateRequest } from '../../../../../../lib/owner-auth';
import { enqueueTenantCfProvision } from '../../../../../../lib/cloudflare-queue';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      subdomain: true,
      cloudflareDomainId: true,
      cfRouteStatus: true,
      cloudflareDomain: { select: { apex: true, isEnabled: true } },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }
  if (!tenant.subdomain) {
    return NextResponse.json({ error: 'Tenant has no subdomain configured' }, { status: 400 });
  }
  if (!tenant.cloudflareDomainId || !tenant.cloudflareDomain) {
    return NextResponse.json({ error: 'Tenant is not bound to a Cloudflare domain' }, { status: 400 });
  }
  if (!tenant.cloudflareDomain.isEnabled) {
    return NextResponse.json({ error: 'The bound Cloudflare domain is disabled' }, { status: 400 });
  }
  if (tenant.cfRouteStatus === 'PROVISIONING' || tenant.cfRouteStatus === 'PENDING') {
    return NextResponse.json({ error: 'A provisioning job is already in flight for this tenant' }, { status: 409 });
  }

  const hostname = `${tenant.subdomain}.${tenant.cloudflareDomain.apex}`;
  await prisma.tenant.update({
    where: { id },
    data: { cfRouteStatus: 'PENDING', cfRouteError: null },
  });

  await enqueueTenantCfProvision({
    tenantId: id,
    hostname,
    cloudflareDomainId: tenant.cloudflareDomainId,
    retry: true,
  });

  return NextResponse.json({ ok: true, hostname });
}
