import { SignJWT, jwtVerify } from 'jose';

const IMPERSONATION_SECRET = () => {
  const secret = process.env.IMPERSONATION_JWT_SECRET;
  if (!secret) throw new Error('IMPERSONATION_JWT_SECRET not set');
  return new TextEncoder().encode(secret);
};

/**
 * Generates a 15-minute read-only impersonation JWT.
 * The token contains the tenantId to impersonate, the ownerUserId who initiated
 * the impersonation, and readOnly: true to signal write-blocking to the API.
 *
 * Uses IMPERSONATION_JWT_SECRET (separate from OWNER_JWT_SECRET) so the main API
 * can verify impersonation tokens without access to the full owner auth secret.
 */
export async function generateImpersonationToken(
  ownerUserId: string,
  tenantId: string,
  ownerEmail: string,
): Promise<string> {
  return new SignJWT({
    tenantId,
    impersonatedBy: ownerUserId,
    impersonatedByEmail: ownerEmail,
    readOnly: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(IMPERSONATION_SECRET());
}

/**
 * Verifies an impersonation token and returns its payload.
 * Used by the main API to decode impersonation sessions.
 */
export async function verifyImpersonationToken(token: string): Promise<{
  tenantId: string;
  impersonatedBy: string;
  impersonatedByEmail: string;
  readOnly: boolean;
}> {
  const { payload } = await jwtVerify(token, IMPERSONATION_SECRET());
  return payload as {
    tenantId: string;
    impersonatedBy: string;
    impersonatedByEmail: string;
    readOnly: boolean;
  };
}
