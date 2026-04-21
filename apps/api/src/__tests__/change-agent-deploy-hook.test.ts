import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockTx } = vi.hoisted(() => ({
  mockPrisma: {} as Record<string, any>,
  mockTx: {} as Record<string, any>,
}));

const txAgentUpdateMany = vi.fn();
const txAgentUpdateDeploymentUpdate = vi.fn();
const txAgentUpdateDeploymentTargetUpdateMany = vi.fn();
const txChangeUpdate = vi.fn();
const txChangeActivityCreate = vi.fn();

Object.assign(mockTx, {
  agent: { updateMany: txAgentUpdateMany },
  agentUpdateDeployment: { update: txAgentUpdateDeploymentUpdate },
  agentUpdateDeploymentTarget: { updateMany: txAgentUpdateDeploymentTargetUpdateMany },
  change: { update: txChangeUpdate },
  changeActivity: { create: txChangeActivityCreate },
});

const prismaChangeFindFirst = vi.fn();
const prismaAgentUpdateDeploymentFindFirst = vi.fn();
const prismaTransaction = vi.fn(async (cb: any) => cb(mockTx));

Object.assign(mockPrisma, {
  change: { findFirst: prismaChangeFindFirst },
  agentUpdateDeployment: { findFirst: prismaAgentUpdateDeploymentFindFirst },
  $transaction: prismaTransaction,
});

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));
vi.mock('../services/notification.service.js', () => ({
  notifyUser: vi.fn().mockResolvedValue(undefined),
}));

import { transitionStatus } from '../services/change.service.js';

const TENANT_ID = 'tenant-001';
const CHANGE_ID = 'change-001';
const USER_ID = 'user-001';
const DEPLOYMENT_ID = 'dep-001';
const AGENT_ID_A = 'agent-a';
const AGENT_ID_B = 'agent-b';

function mockApprovalPendingChange() {
  return {
    id: CHANGE_ID,
    tenantId: TENANT_ID,
    status: 'APPROVAL_PENDING',
    type: 'NORMAL',
    changeNumber: 42,
    title: 'Agent update change',
    requestedById: USER_ID,
    assignedToId: null,
    approvals: [{ id: 'a1', approverId: USER_ID, sequenceOrder: 0, status: 'APPROVED' }],
  };
}

function mockGatedDeployment() {
  return {
    id: DEPLOYMENT_ID,
    tenantId: TENANT_ID,
    platform: 'WINDOWS',
    awaitingApproval: true,
    changeId: CHANGE_ID,
    targets: [
      { id: 't-a', agentId: AGENT_ID_A, status: 'PENDING' },
      { id: 't-b', agentId: AGENT_ID_B, status: 'PENDING' },
    ],
  };
}

describe('Change → agent-deploy propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaTransaction.mockImplementation(async (cb: any) => cb(mockTx));
    txChangeUpdate.mockResolvedValue({ id: CHANGE_ID, changeNumber: 42, title: 'Agent update change', status: 'APPROVED' });
    txChangeActivityCreate.mockResolvedValue({});
  });

  it('APPROVED transition pushes forceUpdateUrl to all PENDING targets', async () => {
    prismaChangeFindFirst.mockResolvedValue(mockApprovalPendingChange());
    prismaAgentUpdateDeploymentFindFirst.mockResolvedValue(mockGatedDeployment());

    await transitionStatus(TENANT_ID, CHANGE_ID, 'APPROVED', USER_ID);

    expect(prismaAgentUpdateDeploymentFindFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, changeId: CHANGE_ID },
      include: { targets: true },
    });
    expect(txAgentUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, id: { in: [AGENT_ID_A, AGENT_ID_B] } },
      data: expect.objectContaining({
        forceUpdateUrl: 'api/v1/agents/updates/windows',
        updateInProgress: true,
      }),
    });
    expect(txAgentUpdateDeploymentUpdate).toHaveBeenCalledWith({
      where: { id: DEPLOYMENT_ID },
      data: { awaitingApproval: false },
    });
  });

  it('REJECTED transition cancels targets and does not push forceUpdateUrl', async () => {
    const rejectableChange = {
      ...mockApprovalPendingChange(),
      approvals: [{ id: 'a1', approverId: USER_ID, sequenceOrder: 0, status: 'REJECTED' }],
    };
    prismaChangeFindFirst.mockResolvedValue(rejectableChange);
    prismaAgentUpdateDeploymentFindFirst.mockResolvedValue(mockGatedDeployment());

    // REJECTED is allowed from APPROVAL_PENDING; we bypass the NORMAL "must approve" check by routing through a direct transition.
    await transitionStatus(TENANT_ID, CHANGE_ID, 'REJECTED', USER_ID);

    expect(txAgentUpdateMany).not.toHaveBeenCalled();
    expect(txAgentUpdateDeploymentTargetUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, deploymentId: DEPLOYMENT_ID, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    expect(txAgentUpdateDeploymentUpdate).toHaveBeenCalledWith({
      where: { id: DEPLOYMENT_ID },
      data: { awaitingApproval: false },
    });
  });

  it('APPROVED with no linked deployment is a no-op', async () => {
    prismaChangeFindFirst.mockResolvedValue(mockApprovalPendingChange());
    prismaAgentUpdateDeploymentFindFirst.mockResolvedValue(null);

    await transitionStatus(TENANT_ID, CHANGE_ID, 'APPROVED', USER_ID);

    expect(txAgentUpdateMany).not.toHaveBeenCalled();
    expect(txAgentUpdateDeploymentUpdate).not.toHaveBeenCalled();
  });

  it('APPROVED when deployment is no longer awaitingApproval is a no-op (idempotency guard)', async () => {
    prismaChangeFindFirst.mockResolvedValue(mockApprovalPendingChange());
    prismaAgentUpdateDeploymentFindFirst.mockResolvedValue({
      ...mockGatedDeployment(),
      awaitingApproval: false,
    });

    await transitionStatus(TENANT_ID, CHANGE_ID, 'APPROVED', USER_ID);

    expect(txAgentUpdateMany).not.toHaveBeenCalled();
  });
});
