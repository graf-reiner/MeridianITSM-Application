// ─── Workflow Mutation Idempotency Guard ────────────────────────────────────
// Wraps mutation workflow nodes (change-status, update-field, add-comment,
// webhook-wait, etc.) so the same logical mutation cannot fire twice within
// a TTL window — protects against:
//   • queue retries re-firing the same execution (relevant once Phase 3
//     queue-backed execution lands)
//   • the dispatcher being invoked twice for the same originating event
//   • workflow + rule both targeting the same trigger
//
// Fingerprint is built from: workflowId + currentNodeId + actorId +
// slaPercentage + caller-supplied action inputs. SLA percentage is included
// so 75%, 90%, and breach are NOT incorrectly coalesced into one mutation.

import {
  buildIdempotencyKey,
  sha256Fingerprint,
  checkIdempotencyKey,
  DEFAULT_IDEMPOTENCY_TTL_SECONDS,
} from '@meridian/core';
import { redis } from '../redis.js';
import type { ExecutionContext, NodeResult } from './types.js';

/**
 * Returns `null` when the node should proceed; returns a short-circuit
 * `NodeResult` (with `output.deduped: true`) when the mutation has already
 * fired inside the TTL window.
 *
 * Callers pass `actionType` (their own node `type` literal, e.g.
 * `'action_change_status'`) and `actionInputs` — fields that distinguish
 * one planned mutation from another (e.g. for `change_status` pass the new
 * status; for `update_field` pass `[field, value, mode]`).
 *
 * Fails open on Redis errors (logs a warning, returns null).
 */
export async function guardMutation(
  actionType: string,
  context: ExecutionContext,
  actionInputs: Array<string | number | undefined | null>,
  ttlSeconds: number = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
): Promise<NodeResult | null> {
  const fingerprint = sha256Fingerprint([
    context.workflowId,
    context.currentNodeId,
    context.eventContext.actorId,
    context.eventContext.slaPercentage,
    ...actionInputs,
  ]);
  const key = buildIdempotencyKey({
    tenantId: context.tenantId,
    resourceId: context.eventContext.ticket?.id ?? context.eventContext.change?.id,
    trigger: context.eventContext.trigger as string | undefined,
    actionType,
    fingerprint,
  });
  const proceed = await checkIdempotencyKey(redis, key, ttlSeconds);
  if (proceed) return null;
  return {
    success: true,
    output: { deduped: true, reason: 'duplicate within idempotency window', key },
  };
}
