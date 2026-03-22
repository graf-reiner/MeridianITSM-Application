import { describe, it } from 'vitest';

/**
 * Change management service unit test stubs.
 * Covers CHNG-02 (state machine), CHNG-03 (approval workflow), CHNG-05 (collision detection),
 * and change lifecycle behaviors.
 *
 * All tests are pending (it.todo) until implementation plans are executed.
 * Wave 0 scaffold — behavioral contract established before implementation.
 */

describe('ChangeService', () => {
  it.todo('creates NORMAL change with status NEW');

  it.todo('creates STANDARD change with status APPROVED (auto-approve)');

  it.todo('creates EMERGENCY change with status APPROVAL_PENDING');

  it.todo('allows valid transition NEW -> ASSESSMENT');

  it.todo('rejects invalid transition COMPLETED -> NEW');

  it.todo('rejects invalid transition REJECTED -> anything');

  it.todo('enforces sequential approval order');

  it.todo('auto-transitions to APPROVED when all approvers approve');

  it.todo('transitions to REJECTED when any approver rejects');

  it.todo('detects schedule collision with overlapping change');

  it.todo('no collision when changes do not overlap');

  it.todo('calculates risk score: EMERGENCY type gets HIGH floor');

  it.todo('logs status change in ChangeActivity audit trail');

  it.todo('links change to asset');

  it.todo('links change to application');
});
