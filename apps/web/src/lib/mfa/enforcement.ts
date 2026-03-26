import { ssoPrisma as prisma } from '@/lib/sso/db';

/**
 * Determine whether a user must complete MFA verification before
 * their session is fully authorized.
 *
 * Returns true when MFA verification is required.
 */
export async function requiresMfa(
  userId: string,
  tenantId: string,
  authMethod: string,
): Promise<boolean> {
  const authSettings = await prisma.tenantAuthSettings.findUnique({
    where: { tenantId },
  });

  // No auth settings or MFA disabled — skip
  if (!authSettings || authSettings.mfaPolicy === 'disabled') return false;

  // If the user authenticated via SSO and the connection doesn't force MFA, skip
  if (authMethod !== 'local-credentials' && authMethod !== 'local') {
    const ssoConnection = await prisma.ssoConnection.findFirst({
      where: { tenantId, status: 'active' },
    });
    if (ssoConnection && !ssoConnection.forceMfa) return false;
  }

  // Policy = "required" — everyone must MFA
  if (authSettings.mfaPolicy === 'required') return true;

  // Policy = "optional" — only users who have enrolled at least one device
  if (authSettings.mfaPolicy === 'optional') {
    const deviceCount = await prisma.mfaDevice.count({
      where: { userId, status: 'active' },
    });
    return deviceCount > 0;
  }

  return false;
}
