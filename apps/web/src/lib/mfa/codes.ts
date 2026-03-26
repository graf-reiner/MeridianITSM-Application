import crypto from 'crypto';
import { ssoPrisma as prisma } from '@/lib/sso/db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 6-digit numeric code.
 */
export function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Create an MfaChallenge record with a hashed code.
 * Returns the challenge ID (used as a reference when verifying).
 */
export async function createChallenge(
  userId: string,
  type: 'email' | 'sms',
  code: string,
): Promise<string> {
  const codeHash = hashCode(code);
  const challenge = await prisma.mfaChallenge.create({
    data: {
      userId,
      type,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      maxAttempts: 5,
    },
  });
  return challenge.id;
}

/**
 * Verify a 6-digit code against a stored challenge.
 * Enforces expiry, max attempts, and single-use semantics.
 */
export async function verifyChallenge(
  challengeId: string,
  code: string,
): Promise<boolean> {
  const challenge = await prisma.mfaChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) return false;
  if (challenge.usedAt) return false;
  if (challenge.expiresAt < new Date()) return false;
  if (challenge.attempts >= challenge.maxAttempts) return false;

  // Increment attempt counter
  await prisma.mfaChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
  });

  const valid = hashCode(code) === challenge.codeHash;

  if (valid) {
    await prisma.mfaChallenge.update({
      where: { id: challengeId },
      data: { usedAt: new Date() },
    });
  }

  return valid;
}
