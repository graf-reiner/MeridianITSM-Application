import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../../../lib/owner-auth';
import { getFileSignedUrl } from '../../../../../lib/storage';

async function requireOwner(request: Request): Promise<Response | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauth = await requireOwner(request);
  if (unauth) return unauth;

  const { id } = await params;

  const update = await prisma.agentUpdate.findUnique({ where: { id } });
  if (!update) {
    return NextResponse.json({ error: 'Update package not found' }, { status: 404 });
  }

  if (!update.storageKey) {
    return NextResponse.json({ error: 'No storage key for this package' }, { status: 404 });
  }

  const signedUrl = await getFileSignedUrl(update.storageKey, 3600);
  return NextResponse.redirect(signedUrl, 302);
}
