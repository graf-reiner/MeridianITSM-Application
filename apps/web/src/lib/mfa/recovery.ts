import crypto from 'crypto';

/**
 * Generate a set of one-time recovery codes.
 * Each code is an 8-character uppercase hex string (e.g. "A3F2B1C9").
 */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase(),
  );
}

/**
 * Hash a recovery code for safe storage (SHA-256).
 */
export function hashRecoveryCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code.toUpperCase())
    .digest('hex');
}

/**
 * Verify a user-supplied code against a stored hash.
 */
export function verifyRecoveryCode(code: string, hash: string): boolean {
  const computed = crypto
    .createHash('sha256')
    .update(code.toUpperCase())
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(hash, 'hex'),
  );
}
