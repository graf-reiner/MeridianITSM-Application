import { prisma } from '@meridian/db';
import { jwtVerify } from 'jose';
import { generateTotpSecret, generateQrCode, verifyTotp } from '../../../../lib/totp';
import { NextResponse } from 'next/server';

const OWNER_SECRET = () => {
  const secret = process.env.OWNER_JWT_SECRET;
  if (!secret) throw new Error('OWNER_JWT_SECRET not set');
  return new TextEncoder().encode(secret);
};

/**
 * POST /api/auth/totp-setup
 *
 * Two-step TOTP enrollment flow for logged-in owner users.
 * Requires a valid owner access token in the Authorization header.
 *
 * Step 1 — generate:
 *   Body: { action: 'generate' }
 *   Response: { otpauthUrl, qrCode } — display QR code to user for authenticator app
 *   Saves totpSecret to DB (not enabled yet)
 *
 * Step 2 — enable:
 *   Body: { action: 'enable', totpCode: string }
 *   Verifies the TOTP code against the stored secret (confirms app is configured)
 *   Sets totpEnabled = true on success
 *   Response: { success: true }
 */
export async function POST(request: Request) {
  // Require auth — owner must be logged in
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let ownerUserId: string;
  let ownerEmail: string;

  try {
    const { payload } = await jwtVerify(authHeader.slice(7), OWNER_SECRET());

    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    ownerUserId = payload.ownerUserId as string;
    ownerEmail = payload.email as string;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  let body: { action?: string; totpCode?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, totpCode } = body;

  if (!action || !['generate', 'enable'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "generate" or "enable"' },
      { status: 400 }
    );
  }

  if (action === 'generate') {
    // Generate new TOTP secret and save to DB (totpEnabled stays false until confirmed)
    const { secret, otpauthUrl } = generateTotpSecret(ownerEmail);
    const qrCode = await generateQrCode(otpauthUrl);

    await prisma.ownerUser.update({
      where: { id: ownerUserId },
      data: { totpSecret: secret },
    });

    return NextResponse.json({ otpauthUrl, qrCode });
  }

  // action === 'enable'
  if (!totpCode) {
    return NextResponse.json({ error: 'totpCode is required for enable action' }, { status: 400 });
  }

  const owner = await prisma.ownerUser.findUnique({ where: { id: ownerUserId } });

  if (!owner?.totpSecret) {
    return NextResponse.json(
      { error: 'TOTP secret not generated yet. Call generate first.' },
      { status: 400 }
    );
  }

  const isValid = verifyTotp(owner.totpSecret, totpCode);

  if (!isValid) {
    return NextResponse.json(
      { error: 'Invalid TOTP code. Ensure your authenticator app is correctly configured.' },
      { status: 401 }
    );
  }

  // Confirmed — enable TOTP
  await prisma.ownerUser.update({
    where: { id: ownerUserId },
    data: { totpEnabled: true },
  });

  return NextResponse.json({ success: true });
}
