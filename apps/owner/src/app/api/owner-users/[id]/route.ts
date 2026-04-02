import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { id } = await params;

  if (payload.ownerUserId === id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  const user = await prisma.ownerUser.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
  }

  await prisma.ownerUser.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
