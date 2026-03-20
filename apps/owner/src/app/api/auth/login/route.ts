import { prisma } from '@meridian/db';
import { ownerLoginSchema } from '@meridian/types';
import { verifySync } from '@node-rs/bcrypt';
import { signOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ownerLoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const owner = await prisma.ownerUser.findUnique({ where: { email } });

  if (!owner || !verifySync(password, owner.passwordHash)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const accessToken = await signOwnerToken(
    { ownerUserId: owner.id, email: owner.email },
    'access'
  );
  const refreshToken = await signOwnerToken(
    { ownerUserId: owner.id, email: owner.email },
    'refresh'
  );

  // Create OwnerSession record
  await prisma.ownerSession.create({
    data: {
      sessionToken: accessToken.slice(-32), // last 32 chars as session identifier
      ownerUserId: owner.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    },
  });

  // Update lastLoginAt
  await prisma.ownerUser.update({
    where: { id: owner.id },
    data: { lastLoginAt: new Date() },
  });

  return NextResponse.json({
    accessToken,
    refreshToken,
    user: { id: owner.id, email: owner.email },
  });
}
