import { prisma } from '@meridian/db';
import { NextResponse } from 'next/server';

/**
 * GET /api/resolve?subdomain=<subdomain>
 *
 * Resolves a tenant subdomain to tenantId and backendUrl.
 * Used by Cloudflare Workers (Phase 2+) and directly by dev tooling.
 *
 * In Phase 1, dev environment accesses the API directly via localhost:4000.
 * Cloudflare Worker routing is deferred to Phase 2.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subdomain = searchParams.get('subdomain');

  if (!subdomain) {
    return NextResponse.json(
      { error: 'subdomain parameter required' },
      { status: 400 },
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain, status: 'ACTIVE' },
    select: { id: true, name: true, subdomain: true, backendUrl: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  return NextResponse.json({
    tenantId: tenant.id,
    name: tenant.name,
    backendUrl: tenant.backendUrl ?? `http://localhost:4000`,
  });
}
