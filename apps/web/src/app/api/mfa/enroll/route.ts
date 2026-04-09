import { NextRequest, NextResponse } from 'next/server';
import { ssoPrisma as prisma } from '@/lib/sso/db';
import { getMfaUser } from '@/lib/mfa/auth-helper';
import { generateTotpSecret, generateTotpQrCode } from '@/lib/mfa/totp';
import { generateWebAuthnRegistration } from '@/lib/mfa/webauthn';
import { generateCode, createChallenge } from '@/lib/mfa/codes';
import { sendMfaCodeEmail } from '@/lib/mfa/send-code-email';

/**
 * POST /api/mfa/enroll
 *
 * Initiate MFA device enrollment. Creates a pending MfaDevice and returns
 * the data the client needs to complete setup (QR code, WebAuthn options, etc.).
 *
 * Body: { type: "totp" | "webauthn" | "email" | "sms", name: string, contactValue?: string }
 */
export async function POST(request: NextRequest) {
  const user = await getMfaUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { type, name } = body;

  if (!type || !name) {
    return NextResponse.json(
      { error: 'type and name are required' },
      { status: 400 },
    );
  }

  const validTypes = ['totp', 'webauthn', 'email', 'sms'];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  try {
    // ── TOTP enrollment ──────────────────────────────────────────────────────
    if (type === 'totp') {
      const { secret, encrypted } = generateTotpSecret();
      const qrCode = await generateTotpQrCode(user.email, secret);

      const device = await prisma.mfaDevice.create({
        data: {
          userId: user.userId,
          type: 'totp',
          name,
          status: 'pending_setup',
          totpSecret: encrypted,
        },
      });

      return NextResponse.json({
        deviceId: device.id,
        qrCode,
        secret, // Shown once for manual entry
      });
    }

    // ── WebAuthn enrollment ──────────────────────────────────────────────────
    if (type === 'webauthn') {
      const existingCreds = await prisma.mfaDevice.findMany({
        where: { userId: user.userId, type: 'webauthn', status: 'active' },
        select: { webauthnCredentialId: true, webauthnTransports: true },
      });

      const options = await generateWebAuthnRegistration(
        user.userId,
        user.email,
        existingCreds
          .filter((c) => c.webauthnCredentialId)
          .map((c) => ({
            id: c.webauthnCredentialId!,
            transports: c.webauthnTransports,
          })),
      );

      const device = await prisma.mfaDevice.create({
        data: {
          userId: user.userId,
          type: 'webauthn',
          name,
          status: 'pending_setup',
        },
      });

      // Store the challenge for later verification
      await prisma.mfaChallenge.create({
        data: {
          userId: user.userId,
          type: 'webauthn',
          webauthnChallenge: options.challenge,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      return NextResponse.json({ deviceId: device.id, options });
    }

    // ── Email / SMS enrollment ───────────────────────────────────────────────
    if (type === 'email' || type === 'sms') {
      const contactValue = body.contactValue as string | undefined;
      if (!contactValue) {
        return NextResponse.json(
          { error: 'contactValue is required for email/sms' },
          { status: 400 },
        );
      }

      const device = await prisma.mfaDevice.create({
        data: {
          userId: user.userId,
          type,
          name,
          status: 'pending_setup',
          contactValue,
        },
      });

      const code = generateCode();
      const challengeId = await createChallenge(user.userId, type, code);

      if (type === 'email') {
        await sendMfaCodeEmail(contactValue, code);
      } else {
        // SMS delivery not yet implemented — log for development
        console.log(`[MFA] SMS verification code for ${contactValue}: ${code}`);
      }

      return NextResponse.json({ deviceId: device.id, challengeId });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('MFA enroll error:', error);
    return NextResponse.json(
      { error: 'Enrollment failed' },
      { status: 500 },
    );
  }
}
