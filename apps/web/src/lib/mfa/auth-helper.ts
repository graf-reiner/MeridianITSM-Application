import { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'meridian-dev-jwt-secret-change-in-production';

export interface MfaUser {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  mfaVerified?: boolean;
}

/**
 * Extract and verify the `meridian_session` JWT from the request cookie.
 * Returns the decoded user payload or null if invalid/missing.
 */
export async function getMfaUser(
  request: NextRequest,
): Promise<MfaUser | null> {
  const token = request.cookies.get('meridian_session')?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      tenantId: payload.tenantId as string,
      email: payload.email as string,
      roles: (payload.roles as string[]) ?? [],
      mfaVerified: (payload.mfaVerified as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

/**
 * Issue a new JWT with `mfaVerified: true` and all existing claims preserved.
 */
export async function issueSessionToken(
  user: MfaUser,
  mfaVerified: boolean,
): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({
    userId: user.userId,
    tenantId: user.tenantId,
    email: user.email,
    roles: user.roles,
    type: 'access',
    mfaVerified,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}
