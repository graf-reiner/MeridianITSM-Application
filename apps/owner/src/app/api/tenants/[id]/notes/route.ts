import { prisma } from '@meridian/db';
import { NextResponse } from 'next/server';
import { verifyOwnerToken } from '../../../../../lib/owner-auth';

/**
 * GET /api/tenants/[id]/notes — list notes for tenant (newest first)
 * POST /api/tenants/[id]/notes — create a new note
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const notes = await prisma.ownerNote.findMany({
    where: { tenantId: id },
    include: {
      ownerUser: {
        select: { id: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ notes });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Extract owner identity
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let ownerUserId: string;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
    ownerUserId = payload.ownerUserId;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  let body: { content?: string; isPrivate?: boolean };
  try {
    body = (await request.json()) as { content?: string; isPrivate?: boolean };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { content, isPrivate = false } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const note = await prisma.ownerNote.create({
    data: {
      tenantId: id,
      ownerUserId,
      content: content.trim(),
      isPrivate,
    },
    include: {
      ownerUser: {
        select: { id: true, email: true },
      },
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
