import { SignJWT, jwtVerify } from 'jose';
import type { OwnerJwtPayload } from '@meridian/types';

const OWNER_SECRET = () => {
  const secret = process.env.OWNER_JWT_SECRET;
  if (!secret) throw new Error('OWNER_JWT_SECRET not set');
  return new TextEncoder().encode(secret);
};

export async function signOwnerToken(
  payload: { ownerUserId: string; email: string },
  type: 'access' | 'refresh' = 'access'
): Promise<string> {
  const expiresIn = type === 'access' ? '15m' : '7d';
  return new SignJWT({ ...payload, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(OWNER_SECRET());
}

export async function verifyOwnerToken(token: string): Promise<OwnerJwtPayload> {
  const { payload } = await jwtVerify(token, OWNER_SECRET());
  return payload as unknown as OwnerJwtPayload;
}

/**
 * Verify the Bearer token on an incoming Request and return the access
 * payload, or null if the request is missing/has an invalid token. The
 * caller decides how to respond (typically NextResponse.json 401).
 */
export async function authenticateRequest(request: Request): Promise<OwnerJwtPayload | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}
