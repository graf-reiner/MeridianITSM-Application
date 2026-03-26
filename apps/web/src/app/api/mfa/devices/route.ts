import { NextRequest, NextResponse } from 'next/server';
import { ssoPrisma as prisma } from '@/lib/sso/db';
import { getMfaUser } from '@/lib/mfa/auth-helper';

/**
 * GET /api/mfa/devices
 *
 * List the current user's MFA devices.
 */
export async function GET(request: NextRequest) {
  const user = await getMfaUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const devices = await prisma.mfaDevice.findMany({
    where: { userId: user.userId },
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count remaining recovery codes
  const recoveryCodeCount = await prisma.recoveryCode.count({
    where: { userId: user.userId, usedAt: null },
  });

  return NextResponse.json({ devices, recoveryCodeCount });
}

/**
 * DELETE /api/mfa/devices
 *
 * Remove an MFA device. If this is the user's last active device, also
 * delete all recovery codes.
 *
 * Body: { deviceId: string }
 */
export async function DELETE(request: NextRequest) {
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

  // Verify the device belongs to this user
  const device = await prisma.mfaDevice.findFirst({
    where: { id: deviceId, userId: user.userId },
  });

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found' },
      { status: 404 },
    );
  }

  // Check if tenant requires MFA — prevent removing the last device
  const authSettings = await prisma.tenantAuthSettings.findUnique({
    where: { tenantId: user.tenantId },
  });

  if (authSettings?.mfaPolicy === 'required' && device.status === 'active') {
    const activeCount = await prisma.mfaDevice.count({
      where: { userId: user.userId, status: 'active' },
    });

    if (activeCount <= 1) {
      return NextResponse.json(
        {
          error:
            'Cannot remove your last MFA device — your organization requires MFA',
        },
        { status: 400 },
      );
    }
  }

  await prisma.mfaDevice.delete({ where: { id: deviceId } });

  // If no active devices remain, clean up recovery codes
  const remainingActive = await prisma.mfaDevice.count({
    where: { userId: user.userId, status: 'active' },
  });

  if (remainingActive === 0) {
    await prisma.recoveryCode.deleteMany({
      where: { userId: user.userId },
    });
  }

  return NextResponse.json({ success: true, remainingDevices: remainingActive });
}
