/**
 * In-memory brute-force protection for login attempts.
 *
 * Tracks failed login attempts per email+tenantId and locks accounts
 * after a configurable number of failures for a cooldown period.
 *
 * Note: In a multi-process / multi-instance deployment, replace this
 * Map with Redis-backed counters for consistency across instances.
 */

const MAX_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  lockedUntil: Date | null;
}

const failedAttempts = new Map<string, AttemptRecord>();

function key(email: string, tenantId: string): string {
  return `${tenantId}:${email}`;
}

export function checkBruteForce(
  email: string,
  tenantId: string,
): { locked: boolean; attemptsRemaining: number } {
  const k = key(email, tenantId);
  const record = failedAttempts.get(k);

  if (!record) {
    return { locked: false, attemptsRemaining: MAX_ATTEMPTS };
  }

  // If currently locked, check whether the lockout has expired
  if (record.lockedUntil) {
    if (record.lockedUntil > new Date()) {
      return { locked: true, attemptsRemaining: 0 };
    }
    // Lock expired — reset
    failedAttempts.delete(k);
    return { locked: false, attemptsRemaining: MAX_ATTEMPTS };
  }

  return {
    locked: false,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - record.count),
  };
}

export function recordFailedAttempt(email: string, tenantId: string): void {
  const k = key(email, tenantId);
  const record = failedAttempts.get(k) ?? { count: 0, lockedUntil: null };
  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  }

  failedAttempts.set(k, record);
}

export function clearFailedAttempts(email: string, tenantId: string): void {
  failedAttempts.delete(key(email, tenantId));
}
