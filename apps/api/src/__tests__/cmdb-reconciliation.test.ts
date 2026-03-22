import { describe, it } from 'vitest';

/**
 * CMDB reconciliation worker unit test stubs.
 * Covers CMDB-13 (agent-driven reconciliation) and staleness detection behaviors.
 *
 * All tests are pending (it.todo) until implementation plans are executed.
 * Wave 0 scaffold — behavioral contract established before implementation.
 */

describe('CmdbReconciliation', () => {
  it.todo('creates new CI when agent submits data for unknown asset');

  it.todo('updates existing CI when agent data differs from CMDB');

  it.todo('logs changed fields in CmdbChangeRecord with changedBy=AGENT');

  it.todo('marks CI as INACTIVE when lastSeenAt > 24 hours ago');

  it.todo('does not mark manually-managed CI (no agentId) as stale');
});
