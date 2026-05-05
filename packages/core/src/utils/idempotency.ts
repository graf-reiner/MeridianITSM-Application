// ─── Action-Level Idempotency Helper ────────────────────────────────────────
// Thin wrapper around Redis SET-NX to suppress duplicate state-mutating
// actions inside a TTL window. Fails open: if Redis is unreachable, the
// helper allows execution and logs a warning — better to mutate twice than
// miss a legitimate first run.
//
// Usage:
//   const proceed = await checkIdempotencyKey(redis, key, 60);
//   if (!proceed) return { skipped: true };
//   ...do the mutation...

import crypto from 'node:crypto';

/**
 * Minimal subset of ioredis we depend on. Keeps this helper type-portable
 * across packages that already construct their own Redis client.
 */
export interface RedisLikeClient {
  set(
    key: string,
    value: string,
    secondsToken: 'EX',
    seconds: number,
    nxToken: 'NX',
  ): Promise<unknown>;
}

/**
 * Default dedupe window. Long enough to swallow rapid duplicate dispatches
 * (queue retries, double-clicks, overlapping rule + workflow firings) but
 * short enough that a *legitimate* second mutation 1+ minute later is never
 * incorrectly suppressed. Callers can override per-action.
 */
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 60;

export interface IdempotencyKeyParts {
  tenantId: string;
  resourceId?: string;     // ticket/change/cert id
  trigger?: string;        // dispatcher trigger literal
  actionType: string;      // e.g. 'action_change_status' or 'rule_escalate'
  fingerprint: string;     // hex digest distinguishing the planned mutation
}

/**
 * Build a Redis key with a stable layout:
 *   `automation:dedup:{tenant}:{resource}:{trigger}:{action}:{fingerprint}`
 */
export function buildIdempotencyKey(parts: IdempotencyKeyParts): string {
  return `automation:dedup:${parts.tenantId}:${parts.resourceId ?? 'none'}:${parts.trigger ?? 'none'}:${parts.actionType}:${parts.fingerprint}`;
}

/**
 * SHA-256 hex digest of arbitrary fingerprint inputs. Inputs are concatenated
 * by `` so distinct field combinations cannot collide. Use for action
 * fingerprints that need to distinguish planned mutations — e.g.
 *   `sha256Fingerprint(['status', 'RESOLVED', actorId, slaPercentage])`
 */
export function sha256Fingerprint(inputs: Array<string | number | undefined | null>): string {
  const joined = inputs.map(v => v == null ? '' : String(v)).join('');
  return crypto.createHash('sha256').update(joined).digest('hex').slice(0, 32);
}

/**
 * Returns `true` if this is the first time `key` was claimed within `ttlSeconds`.
 * Returns `false` if the key already existed (a duplicate inside the window).
 * Fails open: any Redis error returns `true` and emits a console warning.
 */
export async function checkIdempotencyKey(
  redis: RedisLikeClient,
  key: string,
  ttlSeconds: number = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
): Promise<boolean> {
  try {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result !== null;
  } catch (err) {
    console.warn('[idempotency] Redis check failed — failing open:', err);
    return true;
  }
}
