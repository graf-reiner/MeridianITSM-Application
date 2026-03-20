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
