import { prisma } from '@meridian/db';
import { ownerLoginSchema } from '@meridian/types';
import { verifySync } from '@node-rs/bcrypt';
import { SignJWT } from 'jose';
import { signOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';

const OWNER_SECRET = () => {
  const secret = process.env.OWNER_JWT_SECRET;
  if (!secret) throw new Error('OWNER_JWT_SECRET not set');
  return new TextEncoder().encode(secret);
};

/**
 * Signs a short-lived temp token for the TOTP pending step.
 * This token cannot be used for API access — it only permits calling /api/auth/totp-verify.
 */
async function signTotpPendingToken(ownerUserId: string, email: string): Promise<string> {
  return new SignJWT({ ownerUserId, email, type: 'totp-pending' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(OWNER_SECRET());
}

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

  // TOTP MFA step: if totpEnabled, return a short-lived temp token instead of full session
  if (owner.totpEnabled) {
    const tempToken = await signTotpPendingToken(owner.id, owner.email);
    return NextResponse.json({
      requiresTotp: true,
      tempToken,
    });
  }

  // No TOTP — issue full session tokens immediately
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
