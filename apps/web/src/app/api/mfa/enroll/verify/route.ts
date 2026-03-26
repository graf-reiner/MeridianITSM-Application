import { NextRequest, NextResponse } from 'next/server';
import { ssoPrisma as prisma } from '@/lib/sso/db';
import { getMfaUser } from '@/lib/mfa/auth-helper';
import { verifyTotpCode } from '@/lib/mfa/totp';
import { verifyWebAuthnRegistrationResponse } from '@/lib/mfa/webauthn';
import { verifyChallenge } from '@/lib/mfa/codes';
import { generateRecoveryCodes, hashRecoveryCode } from '@/lib/mfa/recovery';

/**
 * POST /api/mfa/enroll/verify
 *
 * Confirm MFA device enrollment by verifying the first valid code/response.
 * On success, activates the device and generates recovery codes (if this is
 * the user's first active MFA device).
 *
 * Body varies by device type:
 *   TOTP:     { deviceId, code }
 *   WebAuthn: { deviceId, response }  (WebAuthn RegistrationResponseJSON)
 *   Email/SMS: { deviceId, challengeId, code }
 */
export async function POST(request: NextRequest) {
  const user = await getMfaUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { deviceId } = body;

  if (!deviceId) {
    return NextResponse.json(
      { error: 'deviceId is required' },
      { status: 400 },
    );
  }

  // Load the pending device — must belong to this user
  const device = await prisma.mfaDevice.findFirst({
    where: {
      id: deviceId,
      userId: user.userId,
      status: 'pending_setup',
    },
  });

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found or already verified' },
      { status: 404 },
    );
  }

  try {
    // ── TOTP verification ────────────────────────────────────────────────────
    if (device.type === 'totp') {
      const { code } = body;
      if (!code || typeof code !== 'string') {
        return NextResponse.json(
          { error: 'code is required' },
          { status: 400 },
        );
      }

      if (!device.totpSecret) {
        return NextResponse.json(
          { error: 'Device has no TOTP secret' },
          { status: 500 },
        );
      }

      const valid = verifyTotpCode(device.totpSecret, code);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid TOTP code' },
          { status: 400 },
        );
      }

      await prisma.mfaDevice.update({
        where: { id: deviceId },
        data: { status: 'active', totpVerified: true },
      });
    }

    // ── WebAuthn verification ────────────────────────────────────────────────
    else if (device.type === 'webauthn') {
      const { response } = body;
      if (!response) {
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

      const verification = await verifyWebAuthnRegistrationResponse(
        response,
        challenge.webauthnChallenge,
      );

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json(
          { error: 'WebAuthn verification failed' },
          { status: 400 },
        );
      }

      const { credential, credentialDeviceType } = verification.registrationInfo;

      await prisma.mfaDevice.update({
        where: { id: deviceId },
        data: {
          status: 'active',
          webauthnCredentialId: credential.id,
          webauthnPublicKey: Buffer.from(credential.publicKey),
          webauthnCounter: BigInt(credential.counter),
          webauthnTransports: response.response?.transports ?? [],
          webauthnAaguid: credentialDeviceType ?? null,
        },
      });

      // Mark challenge as used
      await prisma.mfaChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });
    }

    // ── Email / SMS verification ─────────────────────────────────────────────
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

      await prisma.mfaDevice.update({
        where: { id: deviceId },
        data: { status: 'active' },
      });
    } else {
      return NextResponse.json(
        { error: 'Unknown device type' },
        { status: 400 },
      );
    }

    // ── Generate recovery codes if this is the first active device ──────────
    const activeDeviceCount = await prisma.mfaDevice.count({
      where: { userId: user.userId, status: 'active' },
    });

    let recoveryCodes: string[] | undefined;

    if (activeDeviceCount === 1) {
      // First device — generate and store recovery codes
      recoveryCodes = generateRecoveryCodes(10);

      // Delete any existing recovery codes for this user
      await prisma.recoveryCode.deleteMany({
        where: { userId: user.userId },
      });

      // Store hashed recovery codes
      await prisma.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.userId,
          codeHash: hashRecoveryCode(code),
        })),
      });
    }

    return NextResponse.json({
      success: true,
      deviceId,
      ...(recoveryCodes ? { recoveryCodes } : {}),
    });
  } catch (error) {
    console.error('MFA enroll/verify error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 },
    );
  }
}
