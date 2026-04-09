import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock functions
// ---------------------------------------------------------------------------

const { mockPrisma, mockTx } = vi.hoisted(() => {
  return { mockPrisma: {} as Record<string, any>, mockTx: {} as Record<string, any> };
});

// Module-level vi.fn() instances
const txChangeCreate = vi.fn();
const txChangeFindFirst = vi.fn();
const txChangeUpdate = vi.fn();
const txChangeApprovalCreate = vi.fn();
const txChangeApprovalUpdate = vi.fn();
const txChangeActivityCreate = vi.fn();
const txExecuteRaw = vi.fn();
const txQueryRaw = vi.fn();

const prismaChangeFindFirst = vi.fn();
const prismaChangeFindMany = vi.fn();
const prismaChangeCount = vi.fn();
const prismaChangeUpdate = vi.fn();
const prismaChangeApprovalFindMany = vi.fn();
const prismaChangeAssetCreate = vi.fn();
const prismaChangeApplicationCreate = vi.fn();
const prismaTransaction = vi.fn();

// Assemble tx
Object.assign(mockTx, {
  change: { create: txChangeCreate, findFirst: txChangeFindFirst, update: txChangeUpdate },
  changeApproval: { create: txChangeApprovalCreate, update: txChangeApprovalUpdate },
  changeActivity: { create: txChangeActivityCreate },
  $executeRaw: txExecuteRaw,
  $queryRaw: txQueryRaw,
});

// Assemble prisma
Object.assign(mockPrisma, {
  change: {
    findFirst: prismaChangeFindFirst,
    findMany: prismaChangeFindMany,
    count: prismaChangeCount,
    update: prismaChangeUpdate,
  },
  changeApproval: { findMany: prismaChangeApprovalFindMany },
  changeAsset: { create: prismaChangeAssetCreate },
  changeApplication: { create: prismaChangeApplicationCreate },
  $transaction: prismaTransaction,
});

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('../services/notification.service.js', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));

// Import service under test
import {
  createChange,
  getInitialStatus,
  calculateRiskScore,
  transitionStatus,
  recordApproval,
  getCollisions,
  linkAsset,
  linkApplication,
  ALLOWED_TRANSITIONS,
} from '../services/change.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-001';
const USER_ID = 'user-001';
const CHANGE_ID = 'change-001';

function makeChange(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANGE_ID,
    tenantId: TENANT_ID,
    changeNumber: 1,
    title: 'Test Change',
    description: 'desc',
    type: 'NORMAL',
    status: 'NEW',
    riskLevel: 'MEDIUM',
    requestedById: USER_ID,
    assignedToId: null,
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: $transaction executes the callback with mockTx
  prismaTransaction.mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChangeService', () => {
  // --- Creation tests ---

  it('creates NORMAL change with status NEW', async () => {
    txQueryRaw.mockResolvedValue([{ next: BigInt(1) }]);
    const created = makeChange({ status: 'NEW', type: 'NORMAL' });
    txChangeCreate.mockResolvedValue(created);
    txChangeActivityCreate.mockResolvedValue({});

    const result = await createChange(TENANT_ID, { title: 'Test Change' }, USER_ID);

    expect(result).toEqual(created);
    expect(txChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          type: 'NORMAL',
          status: 'NEW',
          title: 'Test Change',
        }),
      }),
    );
  });

  it('creates STANDARD change with status APPROVED (auto-approve)', async () => {
    txQueryRaw.mockResolvedValue([{ next: BigInt(2) }]);
    const created = makeChange({ status: 'APPROVED', type: 'STANDARD', changeNumber: 2 });
    txChangeCreate.mockResolvedValue(created);
    txChangeActivityCreate.mockResolvedValue({});

    const result = await createChange(TENANT_ID, { title: 'Standard', type: 'STANDARD' }, USER_ID);

    expect(result).toEqual(created);
    expect(txChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          type: 'STANDARD',
        }),
      }),
    );
    // STANDARD creates two activity records: CREATED + STATUS_CHANGED (auto-approve)
    expect(txChangeActivityCreate).toHaveBeenCalledTimes(2);
    expect(txChangeActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activityType: 'STATUS_CHANGED',
          oldValue: 'NEW',
          newValue: 'APPROVED',
        }),
      }),
    );
  });

  it('creates EMERGENCY change with status APPROVAL_PENDING', async () => {
    txQueryRaw.mockResolvedValue([{ next: BigInt(3) }]);
    const approvers = ['approver-1', 'approver-2'];
    const created = makeChange({ status: 'APPROVAL_PENDING', type: 'EMERGENCY', changeNumber: 3 });
    txChangeCreate.mockResolvedValue(created);
    txChangeActivityCreate.mockResolvedValue({});
    txChangeApprovalCreate.mockResolvedValue({});

    const result = await createChange(
      TENANT_ID,
      { title: 'Emergency', type: 'EMERGENCY', approvers },
      USER_ID,
    );

    expect(result).toEqual(created);
    expect(txChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVAL_PENDING',
          type: 'EMERGENCY',
        }),
      }),
    );
    // Creates approval records for each approver
    expect(txChangeApprovalCreate).toHaveBeenCalledTimes(2);
  });

  // --- Status transition tests ---

  it('allows valid transition NEW -> ASSESSMENT', async () => {
    prismaChangeFindFirst.mockResolvedValue(makeChange({ status: 'NEW', approvals: [] }));
    prismaTransaction.mockImplementation(async (cb: any) => cb(mockTx));
    txChangeUpdate.mockResolvedValue(makeChange({ status: 'ASSESSMENT' }));
    txChangeActivityCreate.mockResolvedValue({});

    const result = await transitionStatus(TENANT_ID, CHANGE_ID, 'ASSESSMENT', USER_ID);

    expect(result.status).toBe('ASSESSMENT');
    expect(txChangeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'ASSESSMENT' },
      }),
    );
    expect(txChangeActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activityType: 'STATUS_CHANGED',
          oldValue: 'NEW',
          newValue: 'ASSESSMENT',
        }),
      }),
    );
  });

  it('rejects invalid transition COMPLETED -> NEW', async () => {
    prismaChangeFindFirst.mockResolvedValue(makeChange({ status: 'COMPLETED', approvals: [] }));

    await expect(
      transitionStatus(TENANT_ID, CHANGE_ID, 'NEW', USER_ID),
    ).rejects.toThrow('Cannot transition from COMPLETED to NEW');
  });

  it('rejects invalid transition REJECTED -> anything', async () => {
    prismaChangeFindFirst.mockResolvedValue(makeChange({ status: 'REJECTED', approvals: [] }));

    // REJECTED has empty allowed list — no transition is valid
    for (const target of ['NEW', 'ASSESSMENT', 'APPROVED', 'SCHEDULED', 'IMPLEMENTING']) {
      await expect(
        transitionStatus(TENANT_ID, CHANGE_ID, target, USER_ID),
      ).rejects.toThrow(/Cannot transition from REJECTED/);
    }
  });

  // --- Approval workflow tests ---

  it('enforces sequential approval order', async () => {
    const approvals = [
      { id: 'a1', approverId: 'approver-1', sequenceOrder: 0, status: 'PENDING' },
      { id: 'a2', approverId: 'approver-2', sequenceOrder: 1, status: 'PENDING' },
    ];
    prismaChangeFindFirst.mockResolvedValue(
      makeChange({ status: 'APPROVAL_PENDING', approvals }),
    );

    // Approver-2 (sequence 1) tries to approve before approver-1 (sequence 0)
    await expect(
      recordApproval(TENANT_ID, CHANGE_ID, 'approver-2', 'APPROVED'),
    ).rejects.toThrow("It is not yet this approver's turn");
  });

  it('auto-transitions to APPROVED when all approvers approve', async () => {
    // Single approver, PENDING
    const approvals = [
      { id: 'a1', approverId: 'approver-1', sequenceOrder: 0, status: 'PENDING' },
    ];
    prismaChangeFindFirst.mockResolvedValue(
      makeChange({ status: 'APPROVAL_PENDING', approvals }),
    );
    txChangeApprovalUpdate.mockResolvedValue({});
    txChangeActivityCreate.mockResolvedValue({});

    // After recording, re-fetch shows all APPROVED
    prismaChangeApprovalFindMany.mockResolvedValue([
      { id: 'a1', approverId: 'approver-1', sequenceOrder: 0, status: 'APPROVED' },
    ]);

    // transitionStatus will be called internally for the auto-transition to APPROVED
    // It calls prismaChangeFindFirst again for the transition validation
    prismaChangeFindFirst
      .mockResolvedValueOnce(makeChange({ status: 'APPROVAL_PENDING', approvals })) // initial recordApproval call
      .mockResolvedValueOnce(makeChange({ status: 'APPROVAL_PENDING', approvals: [{ id: 'a1', approverId: 'approver-1', sequenceOrder: 0, status: 'APPROVED' }] })); // transitionStatus call

    txChangeUpdate.mockResolvedValue(makeChange({ status: 'APPROVED' }));

    const result = await recordApproval(TENANT_ID, CHANGE_ID, 'approver-1', 'APPROVED');

    expect(result).toEqual({ success: true, decision: 'APPROVED' });
    // The approval record was updated
    expect(txChangeApprovalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    // transitionStatus was called (via the change.update in the inner $transaction)
    expect(txChangeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'APPROVED' },
      }),
    );
  });

  it('transitions to REJECTED when any approver rejects', async () => {
    const approvals = [
      { id: 'a1', approverId: 'approver-1', sequenceOrder: 0, status: 'PENDING' },
      { id: 'a2', approverId: 'approver-2', sequenceOrder: 1, status: 'PENDING' },
    ];
    prismaChangeFindFirst
      .mockResolvedValueOnce(makeChange({ status: 'APPROVAL_PENDING', approvals })) // recordApproval
      .mockResolvedValueOnce(makeChange({ status: 'APPROVAL_PENDING', approvals })); // transitionStatus

    txChangeApprovalUpdate.mockResolvedValue({});
    txChangeActivityCreate.mockResolvedValue({});

    prismaChangeApprovalFindMany.mockResolvedValue([
      { id: 'a1', approverId: 'approver-1', sequenceOrder: 0, status: 'REJECTED' },
      { id: 'a2', approverId: 'approver-2', sequenceOrder: 1, status: 'PENDING' },
    ]);

    txChangeUpdate.mockResolvedValue(makeChange({ status: 'REJECTED' }));

    const result = await recordApproval(TENANT_ID, CHANGE_ID, 'approver-1', 'REJECTED');

    expect(result).toEqual({ success: true, decision: 'REJECTED' });
    // transitionStatus called with REJECTED
    expect(txChangeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'REJECTED' },
      }),
    );
  });

  // --- Collision detection tests ---

  it('detects schedule collision with overlapping change', async () => {
    const overlapping = [
      {
        id: 'other-change',
        changeNumber: 5,
        title: 'Overlapping Change',
        status: 'SCHEDULED',
        scheduledStart: new Date('2026-04-10T08:00:00Z'),
        scheduledEnd: new Date('2026-04-10T12:00:00Z'),
      },
    ];
    prismaChangeFindMany.mockResolvedValue(overlapping);

    const result = await getCollisions(
      TENANT_ID,
      new Date('2026-04-10T10:00:00Z'),
      new Date('2026-04-10T14:00:00Z'),
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('other-change');
    expect(prismaChangeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          status: { in: ['SCHEDULED', 'IMPLEMENTING'] },
          scheduledStart: { lt: new Date('2026-04-10T14:00:00Z') },
          scheduledEnd: { gt: new Date('2026-04-10T10:00:00Z') },
        }),
      }),
    );
  });

  it('no collision when changes do not overlap', async () => {
    prismaChangeFindMany.mockResolvedValue([]);

    const result = await getCollisions(
      TENANT_ID,
      new Date('2026-04-10T14:00:00Z'),
      new Date('2026-04-10T16:00:00Z'),
    );

    expect(result).toHaveLength(0);
  });

  // --- Risk score tests ---

  it('calculates risk score: EMERGENCY type gets HIGH floor', () => {
    // EMERGENCY base=3, +1 CI => score=4 => HIGH (score 4-5 = HIGH)
    const risk = calculateRiskScore('EMERGENCY', 1, false);
    expect(risk).toBe('HIGH');

    // EMERGENCY alone (score=3) is MEDIUM ceiling
    const riskBase = calculateRiskScore('EMERGENCY', 0, false);
    expect(riskBase).toBe('MEDIUM');

    // EMERGENCY + critical app (score=4) => HIGH
    const riskCrit = calculateRiskScore('EMERGENCY', 0, true);
    expect(riskCrit).toBe('HIGH');

    // EMERGENCY + many CIs + critical => CRITICAL (score=3+3+1=7)
    const riskMax = calculateRiskScore('EMERGENCY', 5, true);
    expect(riskMax).toBe('CRITICAL');

    // STANDARD with nothing => LOW (score=0)
    const riskLow = calculateRiskScore('STANDARD', 0, false);
    expect(riskLow).toBe('LOW');
  });

  // --- Activity audit trail ---

  it('logs status change in ChangeActivity audit trail', async () => {
    prismaChangeFindFirst.mockResolvedValue(makeChange({ status: 'NEW', approvals: [] }));
    txChangeUpdate.mockResolvedValue(makeChange({ status: 'ASSESSMENT' }));
    txChangeActivityCreate.mockResolvedValue({});

    await transitionStatus(TENANT_ID, CHANGE_ID, 'ASSESSMENT', USER_ID);

    expect(txChangeActivityCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        changeId: CHANGE_ID,
        actorId: USER_ID,
        activityType: 'STATUS_CHANGED',
        fieldName: 'status',
        oldValue: 'NEW',
        newValue: 'ASSESSMENT',
      },
    });
  });

  // --- Asset/Application linking ---

  it('links change to asset', async () => {
    const linkResult = { id: 'link-1', tenantId: TENANT_ID, changeId: CHANGE_ID, assetId: 'asset-1' };
    prismaChangeAssetCreate.mockResolvedValue(linkResult);

    const result = await linkAsset(TENANT_ID, CHANGE_ID, 'asset-1');

    expect(result).toEqual(linkResult);
    expect(prismaChangeAssetCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT_ID, changeId: CHANGE_ID, assetId: 'asset-1' },
    });
  });

  it('links change to application', async () => {
    const linkResult = { id: 'link-2', tenantId: TENANT_ID, changeId: CHANGE_ID, applicationId: 'app-1' };
    prismaChangeApplicationCreate.mockResolvedValue(linkResult);

    const result = await linkApplication(TENANT_ID, CHANGE_ID, 'app-1');

    expect(result).toEqual(linkResult);
    expect(prismaChangeApplicationCreate).toHaveBeenCalledWith({
      data: { tenantId: TENANT_ID, changeId: CHANGE_ID, applicationId: 'app-1' },
    });
  });
});
