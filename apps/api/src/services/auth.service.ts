import { createHash, randomBytes } from 'node:crypto';
import { verifySync } from '@node-rs/bcrypt';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Validate user credentials against the DB.
 * Returns the user record if credentials are valid, null otherwise.
 */
export async function validateCredentials(
  email: string,
  password: string,
  tenantId: string,
) {
  const user = await prisma.user.findFirst({
    where: { email, tenantId, status: 'ACTIVE' },
  });

  if (!user) return null;

  const isValid = verifySync(password, user.passwordHash);
  if (!isValid) return null;

  return user;
}

/**
 * Get all role slugs for a user within a tenant.
 */
export async function getUserRoles(userId: string, tenantId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: {
      role: true,
    },
  });

  return userRoles.map((ur) => ur.role.slug);
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
}

/**
 * Generate access and refresh JWT tokens.
 */
export function generateTokens(
  payload: TokenPayload,
  fastify: FastifyInstance,
  options?: { mfaVerified?: boolean },
): TokenPair {
  const accessToken = fastify.jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      roles: payload.roles,
      type: 'access',
      mfaVerified: options?.mfaVerified ?? false,
    },
    { expiresIn: '15m' },
  );

  const refreshToken = fastify.jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      roles: payload.roles,
      type: 'refresh',
      mfaVerified: options?.mfaVerified ?? false,
    },
    { expiresIn: '7d' },
  );

  return { accessToken, refreshToken };
}

/**
 * Check if a user requires MFA based on tenant settings and enrolled devices.
 */
export async function checkMfaRequired(
  userId: string,
  tenantId: string,
  trustToken?: string,
): Promise<boolean> {
  const authSettings = await prisma.tenantAuthSettings.findUnique({
    where: { tenantId },
  });

  if (!authSettings || authSettings.mfaPolicy === 'disabled') return false;

  // Check for a valid trusted device token before requiring MFA
  if (trustToken) {
    const tokenHash = createHash('sha256').update(trustToken).digest('hex');
    const trustedDevice = await prisma.mfaTrustedDevice.findFirst({
      where: {
        tokenHash,
        userId,
        expiresAt: { gt: new Date() },
      },
    });

    if (trustedDevice) {
      // Update lastUsedAt timestamp
      await prisma.mfaTrustedDevice.update({
        where: { id: trustedDevice.id },
        data: { lastUsedAt: new Date() },
      });
      return false;
    }
  }

  if (authSettings.mfaPolicy === 'required') return true;

  if (authSettings.mfaPolicy === 'optional') {
    // Only require if user has active MFA devices
    const deviceCount = await prisma.mfaDevice.count({
      where: { userId, status: 'active' },
    });
    return deviceCount > 0;
  }

  return false;
}

/**
 * Create a password reset token for a user.
 * Returns the unhashed token (to be sent via email link).
 * The hashed version is stored in the DB.
 */
export async function createPasswordResetToken(
  userId: string,
  tenantId: string,
): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

  // Invalidate any existing unused tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId, tenantId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tenantId,
      token: tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Validate a password reset token.
 * Returns the token record if valid, null if invalid/expired/used.
 */
export async function validatePasswordResetToken(token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      token: tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  return resetToken;
}

/**
 * Reset a user's password using a valid reset token.
 * Validates the token, hashes the new password, updates the user, marks token as used.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const resetToken = await validatePasswordResetToken(token);
  if (!resetToken) return false;

  const { hashSync } = await import('@node-rs/bcrypt');
  const passwordHash = hashSync(newPassword, 10);

  // Update user password and mark token as used in a transaction
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return true;
}
