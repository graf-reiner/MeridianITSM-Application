import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { ssoPrisma as prisma } from '@/lib/sso/db';
import { getMfaUser, issueSessionToken } from '@/lib/mfa/auth-helper';
import { verifyTotpCode } from '@/lib/mfa/totp';
import { verifyWebAuthnAuthenticationResponse } from '@/lib/mfa/webauthn';
import { verifyChallenge } from '@/lib/mfa/codes';
import { verifyRecoveryCode } from '@/lib/mfa/recovery';

/**
 * POST /api/mfa/verify
 *
 * Verify an MFA challenge and, on success, re-issue the session JWT with
 * `mfaVerified: true`. This is the final step in the login flow when MFA
 * is required.
 *
 * Body variants:
 *   TOTP:       { deviceId, code }
 *   WebAuthn:   { deviceId, response }
 *   Email/SMS:  { deviceId, challengeId, code }
 *   Recovery:   { type: "recovery", code }
 */
export async function POST(request: NextRequest) {
  const user = await getMfaUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  try {
    // ── Recovery code path ─────────────────────────────────────────────────
    if (body.type === 'recovery') {
      const { code } = body;
      if (!code || typeof code !== 'string') {
        return NextResponse.json(
          { error: 'code is required' },
          { status: 400 },
        );
      }

      const recoveryCodes = await prisma.recoveryCode.findMany({
        where: { userId: user.userId, usedAt: null },
      });

      let matched = false;
      for (const rc of recoveryCodes) {
        if (verifyRecoveryCode(code, rc.codeHash)) {
          await prisma.recoveryCode.update({
            where: { id: rc.id },
            data: { usedAt: new Date() },
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        return NextResponse.json(
          { error: 'Invalid recovery code' },
          { status: 400 },
        );
      }

      // Count remaining codes
      const remaining = await prisma.recoveryCode.count({
        where: { userId: user.userId, usedAt: null },
      });

      return await successResponse(user, request, body, { remainingRecoveryCodes: remaining });
    }

    // ── Device-based verification ──────────────────────────────────────────
    const { deviceId } = body;
    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required' },
        { status: 400 },
      );
    }

    const device = await prisma.mfaDevice.findFirst({
      where: { id: deviceId, userId: user.userId, status: 'active' },
    });

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 },
      );
    }

    // ── TOTP ──────────────────────────────────────────────────────────────
    if (device.type === 'totp') {
      const { code } = body;
      if (!code || !device.totpSecret) {
        return NextResponse.json(
          { error: 'code is required' },
          { status: 400 },
        );
      }

      if (!verifyTotpCode(device.totpSecret, code)) {
        return NextResponse.json(
          { error: 'Invalid TOTP code' },
          { status: 400 },
        );
      }
    }

    // ── WebAuthn ──────────────────────────────────────────────────────────
    else if (device.type === 'webauthn') {
      const { response } = body;
      if (!response || !device.webauthnPublicKey || !device.webauthnCredentialId) {
        return NextResponse.json(
          { error: 'WebAuthn response is required' },
          { status: 400 },
        );
      }

      // Find the stored challenge
      const challenge = await prisma.mfaChallenge.findFirst({
        where: {
          userId: user.userId,
          type: 'webauthn',
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!challenge?.webauthnChallenge) {
        return NextResponse.json(
          { error: 'No pending WebAuthn challenge' },
          { status: 400 },
        );
      }

      const verification = await verifyWebAuthnAuthenticationResponse(
        response,
        challenge.webauthnChallenge,
        new Uint8Array(device.webauthnPublicKey),
        device.webauthnCounter,
      );

      if (!verification.verified) {
        return NextResponse.json(
          { error: 'WebAuthn verification failed' },
          { status: 400 },
        );
      }

      // Update counter
      await prisma.mfaDevice.update({
        where: { id: deviceId },
        data: {
          webauthnCounter: BigInt(
            verification.authenticationInfo.newCounter,
          ),
        },
      });

      // Mark challenge as used
      await prisma.mfaChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });
    }

    // ── Email / SMS ───────────────────────────────────────────────────────
    else if (device.type === 'email' || device.type === 'sms') {
      const { challengeId, code } = body;
      if (!challengeId || !code) {
        return NextResponse.json(
          { error: 'challengeId and code are required' },
          { status: 400 },
        );
      }

      const valid = await verifyChallenge(challengeId, code);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid or expired code' },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unknown device type' },
        { status: 400 },
      );
    }

    // Update lastUsedAt
    await prisma.mfaDevice.update({
      where: { id: deviceId },
      data: { lastUsedAt: new Date() },
    });

    return await successResponse(user, request, body);
  } catch (error) {
    console.error('MFA verify error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 },
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function successResponse(
  user: { userId: string; tenantId: string; email: string; roles: string[] },
  request: NextRequest,
  body: Record<string, unknown>,
  extra?: Record<string, unknown>,
) {
  const token = await issueSessionToken(
    { ...user, mfaVerified: true },
    true,
  );

  const response = NextResponse.json({
    success: true,
    redirectTo: '/dashboard/tickets',
    ...extra,
  });

  response.cookies.set('meridian_session', token, {
    path: '/',
    maxAge: 15 * 60,
    sameSite: 'lax',
    httpOnly: false,
  });

  // Set trusted device cookie if requested
  if (body.trustDevice === true) {
    try {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const thirtyDays = 30 * 24 * 60 * 60; // seconds
      const expiresAt = new Date(Date.now() + thirtyDays * 1000);

      const userAgent = request.headers.get('user-agent') ?? undefined;
      const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        undefined;

      await prisma.mfaTrustedDevice.create({
        data: {
          userId: user.userId,
          tenantId: user.tenantId,
          tokenHash,
          userAgent,
          ipAddress,
          expiresAt,
        },
      });

      response.cookies.set('meridian_mfa_trust', rawToken, {
        path: '/',
        maxAge: thirtyDays,
        sameSite: 'lax',
        httpOnly: true,
        secure: true,
      });
    } catch (err) {
      // Trust cookie is non-critical — log but don't fail the MFA verification
      console.error('Failed to create trusted device:', err);
    }
  }

  return response;
}
