import { prisma } from '@meridian/db';
import { jwtVerify } from 'jose';
import { signOwnerToken } from '../../../../lib/owner-auth';
import { verifyTotp } from '../../../../lib/totp';
import { NextResponse } from 'next/server';

const OWNER_SECRET = () => {
  const secret = process.env.OWNER_JWT_SECRET;
  if (!secret) throw new Error('OWNER_JWT_SECRET not set');
  return new TextEncoder().encode(secret);
};

/**
 * POST /api/auth/totp-verify
 *
 * Second step of the MFA login flow. Accepts a temp token (from /api/auth/login)
 * and a TOTP code from the authenticator app. If both are valid, issues full
 * access and refresh tokens.
 *
 * Body: { tempToken: string, totpCode: string }
 */
export async function POST(request: Request) {
  let body: { tempToken?: string; totpCode?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tempToken, totpCode } = body;

  if (!tempToken || !totpCode) {
    return NextResponse.json(
      { error: 'tempToken and totpCode are required' },
      { status: 400 }
    );
  }

  // Verify temp token — must be type: 'totp-pending' and not expired
  let ownerUserId: string;
  try {
    const { payload } = await jwtVerify(tempToken, OWNER_SECRET());

    if (payload.type !== 'totp-pending') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    ownerUserId = payload.ownerUserId as string;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired temp token' }, { status: 401 });
  }

  // Load the owner user and verify TOTP secret
  const owner = await prisma.ownerUser.findUnique({ where: { id: ownerUserId } });

  if (!owner || !owner.totpSecret || !owner.totpEnabled) {
    return NextResponse.json({ error: 'TOTP not configured' }, { status: 401 });
  }

  const isValid = verifyTotp(owner.totpSecret, totpCode);

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 401 });
  }

  // TOTP valid — issue full session tokens
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
      sessionToken: accessToken.slice(-32),
      ownerUserId: owner.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
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
