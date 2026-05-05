import { describe, it, expect, vi } from 'vitest';
import {
  buildIdempotencyKey,
  checkIdempotencyKey,
  sha256Fingerprint,
  DEFAULT_IDEMPOTENCY_TTL_SECONDS,
  type RedisLikeClient,
} from '../utils/idempotency.js';

function makeRedis(behavior: 'first' | 'duplicate' | 'error'): RedisLikeClient {
  return {
    set: vi.fn(async () => {
      if (behavior === 'error') throw new Error('redis offline');
      return behavior === 'first' ? 'OK' : null;
    }),
  };
}

describe('buildIdempotencyKey', () => {
  it('produces a stable layout', () => {
    expect(
      buildIdempotencyKey({
        tenantId: 't1', resourceId: 'tk1', trigger: 'TICKET_CREATED',
        actionType: 'action_change_status', fingerprint: 'abcd',
      }),
    ).toBe('automation:dedup:t1:tk1:TICKET_CREATED:action_change_status:abcd');
  });

  it('substitutes "none" for missing resource/trigger', () => {
    expect(
      buildIdempotencyKey({ tenantId: 't1', actionType: 'rule_escalate', fingerprint: 'xx' }),
    ).toBe('automation:dedup:t1:none:none:rule_escalate:xx');
  });
});

describe('sha256Fingerprint', () => {
  it('is stable across calls with the same inputs', () => {
    expect(sha256Fingerprint(['status', 'RESOLVED', 'u1'])).toBe(
      sha256Fingerprint(['status', 'RESOLVED', 'u1']),
    );
  });

  it('produces different digests for different inputs', () => {
    expect(sha256Fingerprint(['status', 'RESOLVED']))
      .not.toBe(sha256Fingerprint(['status', 'OPEN']));
  });

  it('treats null/undefined as empty strings deterministically', () => {
    expect(sha256Fingerprint(['x', null, 'y'])).toBe(sha256Fingerprint(['x', undefined, 'y']));
  });
});

describe('checkIdempotencyKey', () => {
  it('returns true on the first claim of a key', async () => {
    const redis = makeRedis('first');
    expect(await checkIdempotencyKey(redis, 'k1', 60)).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('k1', '1', 'EX', 60, 'NX');
  });

  it('returns false when the key already existed (duplicate in TTL window)', async () => {
    const redis = makeRedis('duplicate');
    expect(await checkIdempotencyKey(redis, 'k1', 60)).toBe(false);
  });

  it('fails open on Redis error — caller proceeds, no throw', async () => {
    const redis = makeRedis('error');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await checkIdempotencyKey(redis, 'k1', 60)).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('uses DEFAULT_IDEMPOTENCY_TTL_SECONDS when ttl is omitted', async () => {
    const redis = makeRedis('first');
    await checkIdempotencyKey(redis, 'k1');
    expect(redis.set).toHaveBeenCalledWith('k1', '1', 'EX', DEFAULT_IDEMPOTENCY_TTL_SECONDS, 'NX');
  });
});
