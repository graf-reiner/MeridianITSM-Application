import { prisma } from '@meridian/db';
import { NextResponse } from 'next/server';
import { verifyOwnerToken } from '../../../../../lib/owner-auth';
import { generateImpersonationToken } from '../../../../../lib/impersonation';

/**
 * POST /api/tenants/[id]/impersonate
 * Generates a 15-minute impersonation token for a tenant.
 * The frontend uses this token to construct an impersonation URL:
 *   https://{slug}.domain.com?impersonation_token={token}
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Extract owner identity from the JWT
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let ownerUserId: string;
  let ownerEmail: string;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
    ownerUserId = payload.ownerUserId;
    ownerEmail = payload.email;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // Verify tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  if (tenant.status === 'DELETED') {
    return NextResponse.json({ error: 'Cannot impersonate a deleted tenant' }, { status: 400 });
  }

  const impersonationToken = await generateImpersonationToken(ownerUserId, id, ownerEmail);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return NextResponse.json({
    impersonationToken,
    expiresAt,
    tenantSlug: tenant.slug,
  });
}
