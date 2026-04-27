// ─── Connector Test — worker-side helpers ────────────────────────────────────
// The api orchestrates a test (POSTs to /api/v1/email-accounts/:id/test-roundtrip)
// by writing two Redis keys:
//   email-test:<tenantId>:<testId>             → JSON state with phases array
//   email-test-token:<tenantId>:<token>        → testId (lookup index)
// and sends a real email with subject "[MeridianITSM Connector Test #<token>]".
//
// When the inbound poll loop sees a message matching that subject, it calls
// markTestReceived() here to flip the test's roundtrip phase to OK so the
// frontend can render success. The message is then NOT turned into a ticket.

import type { ParsedMail } from 'mailparser';
import { redisConnection } from '../queues/connection.js';

export const CONNECTOR_TEST_SUBJECT_REGEX = /\[MeridianITSM Connector Test #([a-z0-9]{6,32})\]/;

const STATE_TTL_SECONDS = 600;

interface TestPhase {
  status: 'PENDING' | 'OK' | 'FAILED' | 'SKIPPED';
  detail?: string;
  durationMs?: number;
  messageId?: string;
}

interface TestState {
  testId: string;
  startedAt: string;
  to: string;
  token: string;
  phases: {
    smtpAuth: TestPhase;
    smtpSend: TestPhase;
    imapAuth: TestPhase;
    roundtrip: TestPhase;
  };
  finishedAt?: string;
  overall: 'RUNNING' | 'PASSED' | 'FAILED' | 'TIMEOUT';
}

function stateKey(tenantId: string, testId: string): string {
  return `email-test:${tenantId}:${testId}`;
}

function tokenKey(tenantId: string, token: string): string {
  return `email-test-token:${tenantId}:${token}`;
}

/**
 * Resolve a token from the inbound message subject to the test state, mark
 * roundtrip as OK with measured wall-clock duration, and refresh TTL so a
 * frontend that's still polling sees the final state.
 */
export async function markTestReceived(
  tenantId: string,
  token: string,
  parsed: ParsedMail,
): Promise<void> {
  try {
    const testId = await redisConnection.get(tokenKey(tenantId, token));
    if (!testId) {
      console.log(`[connector-test] No active test for token ${token} in tenant ${tenantId} (expired?)`);
      return;
    }

    const raw = await redisConnection.get(stateKey(tenantId, testId));
    if (!raw) {
      console.log(`[connector-test] State missing for testId ${testId} (TTL elapsed?)`);
      return;
    }

    const state = JSON.parse(raw) as TestState;
    const startedMs = new Date(state.startedAt).getTime();
    const durationMs = Date.now() - startedMs;

    state.phases.roundtrip = {
      status: 'OK',
      detail: `Received via ${parsed.messageId ?? 'unknown message-id'}`,
      durationMs,
      messageId: parsed.messageId,
    };
    state.finishedAt = new Date().toISOString();
    state.overall = 'PASSED';

    await redisConnection.set(stateKey(tenantId, testId), JSON.stringify(state), 'EX', STATE_TTL_SECONDS);
    console.log(`[connector-test] Test ${testId} round-trip RECEIVED in ${durationMs}ms`);
  } catch (err) {
    console.error('[connector-test] markTestReceived failed:', err);
  }
}
