import { describe, it } from 'vitest';

/**
 * Agent Routes Test Scaffolds
 *
 * Wave 0 stubs — behavioral contracts before implementation.
 * Requirements: AGNT-03, AGNT-04, AGNT-05, AGNT-06, AGNT-08
 */
describe('Agent Routes', () => {
  // ─── Enrollment (AGNT-03) ────────────────────────────────────────────────────

  it.todo('POST /enroll with valid token returns 201 + agentKey (AGNT-03)');
  it.todo('POST /enroll with expired token returns 401 (AGNT-03)');
  it.todo('POST /enroll with maxEnrollments reached returns 409 (AGNT-03)');
  it.todo('POST /enroll increments enrollCount on token (AGNT-03)');

  // ─── Heartbeat (AGNT-04) ─────────────────────────────────────────────────────

  it.todo('POST /heartbeat updates lastHeartbeatAt (AGNT-04)');
  it.todo('POST /heartbeat with invalid agentKey returns 401 (AGNT-04)');
  it.todo('POST /heartbeat with metrics creates MetricSample (AGNT-04)');

  // ─── Inventory (AGNT-05) ─────────────────────────────────────────────────────

  it.todo('POST /inventory stores InventorySnapshot tenant-scoped (AGNT-05)');
  it.todo('POST /inventory returns 201 with snapshotId (AGNT-05)');

  // ─── CMDB Sync (AGNT-06) ─────────────────────────────────────────────────────

  it.todo('POST /cmdb-sync enqueues reconciliation job (AGNT-06)');
  it.todo('POST /cmdb-sync returns 202 with status queued (AGNT-06)');

  // ─── Admin Agent Management (AGNT-08) ────────────────────────────────────────

  it.todo('GET /settings/agents lists agents for tenant (AGNT-08)');
  it.todo('GET /settings/agents/tokens lists enrollment tokens (AGNT-08)');
  it.todo('POST /settings/agents/tokens generates enrollment token (AGNT-08)');
  it.todo('POST /settings/agents/tokens returns raw token once (AGNT-08)');
  it.todo('DELETE /settings/agents/tokens/:id revokes token (AGNT-08)');
  it.todo('DELETE /settings/agents/:id removes agent (AGNT-08)');
});
