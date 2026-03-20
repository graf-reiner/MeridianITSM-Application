import { refreshTokenSchema } from '@meridian/types';
import { signOwnerToken, verifyOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = refreshTokenSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { refreshToken } = parsed.data;

  try {
    const payload = await verifyOwnerToken(refreshToken);

    if (payload.type !== 'refresh') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    const accessToken = await signOwnerToken(
      { ownerUserId: payload.ownerUserId, email: payload.email },
      'access'
    );
    const newRefreshToken = await signOwnerToken(
      { ownerUserId: payload.ownerUserId, email: payload.email },
      'refresh'
    );

    return NextResponse.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: payload.ownerUserId, email: payload.email },
    });
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}
