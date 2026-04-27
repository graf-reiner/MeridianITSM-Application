// ─── Connector Test — api-side state ─────────────────────────────────────────
// Round-trip mail-connector test orchestration. The route file
// apps/api/src/routes/v1/email-accounts/test-roundtrip.ts walks the phases:
//   1. SMTP auth     - testSmtpConnection (no body)
//   2. SMTP send     - real send with subject "[MeridianITSM Connector Test #<token>]"
//   3. IMAP auth     - testImapConnection
//   4. Roundtrip     - flipped to OK by the worker when the test message is
//                      seen by the inbound poll loop (apps/worker/src/services/connector-test.service.ts)
//
// State lives in Redis (ephemeral) under two keys per test:
//   email-test:<tenantId>:<testId>          - JSON state with phases array
//   email-test-token:<tenantId>:<token>     - testId (lookup index used by the worker)
//
// 600s TTL on both keys; the worker bumps it when it writes the roundtrip phase.

import crypto from 'node:crypto';
import { redis } from '../lib/redis.js';

export const STATE_TTL_SECONDS = 600;
export const ROUNDTRIP_TIMEOUT_MS = 5 * 60 * 1000;

export type PhaseStatus = 'PENDING' | 'OK' | 'FAILED' | 'SKIPPED';

export interface TestPhase {
  status: PhaseStatus;
  detail?: string;
  durationMs?: number;
  messageId?: string;
}

export interface TestState {
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

export function generateTestId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function generateToken(): string {
  // 12 hex chars — short enough for the subject, long enough to avoid collision.
  return crypto.randomBytes(6).toString('hex');
}

export function buildTestSubject(token: string): string {
  return `[MeridianITSM Connector Test #${token}]`;
}

export async function saveState(tenantId: string, state: TestState): Promise<void> {
  await redis.set(stateKey(tenantId, state.testId), JSON.stringify(state), 'EX', STATE_TTL_SECONDS);
  await redis.set(tokenKey(tenantId, state.token), state.testId, 'EX', STATE_TTL_SECONDS);
}

export async function loadState(tenantId: string, testId: string): Promise<TestState | null> {
  const raw = await redis.get(stateKey(tenantId, testId));
  return raw ? (JSON.parse(raw) as TestState) : null;
}

export async function patchState(
  tenantId: string,
  testId: string,
  patch: (s: TestState) => TestState,
): Promise<TestState | null> {
  const current = await loadState(tenantId, testId);
  if (!current) return null;
  const next = patch(current);
  await redis.set(stateKey(tenantId, testId), JSON.stringify(next), 'EX', STATE_TTL_SECONDS);
  return next;
}

export function rollupOverall(state: TestState): TestState['overall'] {
  const ps = state.phases;
  const allTerminal = (Object.values(ps) as TestPhase[]).every(p => p.status !== 'PENDING');
  if (!allTerminal) {
    // If we're past the roundtrip wait window with roundtrip still pending, surface TIMEOUT.
    if (
      ps.smtpAuth.status !== 'PENDING' && ps.smtpSend.status !== 'PENDING' && ps.imapAuth.status !== 'PENDING' &&
      ps.roundtrip.status === 'PENDING'
    ) {
      const startedMs = new Date(state.startedAt).getTime();
      if (Date.now() - startedMs >= ROUNDTRIP_TIMEOUT_MS) return 'TIMEOUT';
    }
    return 'RUNNING';
  }
  const anyFailed = (Object.values(ps) as TestPhase[]).some(p => p.status === 'FAILED');
  return anyFailed ? 'FAILED' : 'PASSED';
}
