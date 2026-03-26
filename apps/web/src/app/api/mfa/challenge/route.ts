import { NextRequest, NextResponse } from 'next/server';
import { ssoPrisma as prisma } from '@/lib/sso/db';
import { getMfaUser } from '@/lib/mfa/auth-helper';
import { generateCode, createChallenge } from '@/lib/mfa/codes';
import { generateWebAuthnAuthenticationOpts } from '@/lib/mfa/webauthn';

/**
 * GET /api/mfa/challenge
 *
 * List the available MFA methods for the current user. Used by the MFA
 * challenge page to display the appropriate UI (TOTP input, WebAuthn button, etc.).
 */
export async function GET(request: NextRequest) {
  const user = await getMfaUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const devices = await prisma.mfaDevice.findMany({
    where: { userId: user.userId, status: 'active' },
    select: { id: true, type: true, name: true, lastUsedAt: true },
  });

  // Check if recovery codes exist
  const recoveryCodeCount = await prisma.recoveryCode.count({
    where: { userId: user.userId, usedAt: null },
  });

  return NextResponse.json({
    methods: devices,
    hasRecoveryCodes: recoveryCodeCount > 0,
  });
}

/**
 * POST /api/mfa/challenge
 *
 * Generate a challenge for a specific MFA method. For email/sms this sends
 * a code; for WebAuthn it returns authentication options.
 *
 * Body: { deviceId: string }
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

  const device = await prisma.mfaDevice.findFirst({
    where: { id: deviceId, userId: user.userId, status: 'active' },
  });

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found' },
      { status: 404 },
    );
  }

  try {
    // ── TOTP — no server action needed, client enters code directly ──────────
    if (device.type === 'totp') {
      return NextResponse.json({
        type: 'totp',
        deviceId: device.id,
        message: 'Enter your authenticator code',
      });
    }

    // ── WebAuthn — generate authentication options ───────────────────────────
    if (device.type === 'webauthn') {
      if (!device.webauthnCredentialId) {
        return NextResponse.json(
          { error: 'Device missing credential' },
          { status: 500 },
        );
      }

      const options = await generateWebAuthnAuthenticationOpts([
        {
          id: device.webauthnCredentialId,
          transports: device.webauthnTransports,
        },
      ]);

      // Store challenge for verification
      await prisma.mfaChallenge.create({
        data: {
          userId: user.userId,
          type: 'webauthn',
          webauthnChallenge: options.challenge,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return NextResponse.json({
        type: 'webauthn',
        deviceId: device.id,
        options,
      });
    }

    // ── Email / SMS — generate and send a code ───────────────────────────────
    if (device.type === 'email' || device.type === 'sms') {
      if (!device.contactValue) {
        return NextResponse.json(
          { error: 'Device missing contact value' },
          { status: 500 },
        );
      }

      const code = generateCode();
      const challengeId = await createChallenge(
        user.userId,
        device.type as 'email' | 'sms',
        code,
      );

      // TODO: Send code via email/SMS service
      console.log(
        `[MFA] ${device.type} challenge code for ${device.contactValue}: ${code}`,
      );

      // Mask the contact value for display
      const masked =
        device.type === 'email'
          ? maskEmail(device.contactValue)
          : maskPhone(device.contactValue);

      return NextResponse.json({
        type: device.type,
        deviceId: device.id,
        challengeId,
        maskedContact: masked,
      });
    }

    return NextResponse.json({ error: 'Unknown device type' }, { status: 400 });
  } catch (error) {
    console.error('MFA challenge error:', error);
    return NextResponse.json(
      { error: 'Challenge generation failed' },
      { status: 500 },
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return '****';
  return '***' + phone.slice(-4);
}
