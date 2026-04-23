import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock (must hoist before service import) ───────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    inventorySnapshot: { findFirst: vi.fn() },
    inventoryDiff: { create: vi.fn() },
  },
}));

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

import {
  diffSoftware,
  diffServices,
  diffHardware,
  diffNetwork,
  computeAndStoreInventoryDiff,
  type InventorySnapshotShape,
} from './inventory-diff.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TENANT = '00000000-0000-0000-0000-000000000001';
const AGENT  = '00000000-0000-0000-0000-000000000002';

function makeSnapshot(overrides: Partial<InventorySnapshotShape> = {}): InventorySnapshotShape {
  return {
    id:               '00000000-0000-0000-0000-000000000010',
    agentId:          AGENT,
    collectedAt:      new Date('2024-01-01T00:00:00Z'),
    ramGb:            null,
    cpuCores:         null,
    cpuThreads:       null,
    cpuSpeedMhz:      null,
    cpuModel:         null,
    manufacturer:     null,
    model:            null,
    biosVersion:      null,
    tpmVersion:       null,
    secureBootEnabled: null,
    serialNumber:     null,
    diskEncrypted:    null,
    antivirusProduct: null,
    firewallEnabled:  null,
    operatingSystem:  null,
    osVersion:        null,
    osBuild:          null,
    installedSoftware: null,
    services:         null,
    networkInterfaces: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── diffSoftware ─────────────────────────────────────────────────────────────

describe('diffSoftware', () => {
  it('returns empty array when both inputs are null/undefined', () => {
    expect(diffSoftware(null, null)).toEqual([]);
    expect(diffSoftware(undefined, undefined)).toEqual([]);
  });

  it('emits added for items in to but not from', () => {
    const from: unknown[] = [];
    const to = [{ name: 'Chrome', version: '120.0' }];
    const result = diffSoftware(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'added', name: 'Chrome', version: '120.0' });
  });

  it('emits removed for items in from but not to', () => {
    const from = [{ name: 'Notepad++', version: '8.5' }];
    const to: unknown[] = [];
    const result = diffSoftware(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'removed', name: 'Notepad++', version: '8.5' });
  });

  it('emits updated when version changes', () => {
    const from = [{ name: 'Firefox', version: '118.0' }];
    const to   = [{ name: 'Firefox', version: '119.0' }];
    const result = diffSoftware(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'updated', name: 'Firefox', from: '118.0', to: '119.0' });
  });

  it('emits nothing when name and version both match', () => {
    const same = [{ name: 'Git', version: '2.43.0' }];
    expect(diffSoftware(same, same)).toHaveLength(0);
  });

  it('matches names case-insensitively', () => {
    const from = [{ name: 'FIREFOX', version: '118.0' }];
    const to   = [{ name: 'firefox', version: '119.0' }];
    const result = diffSoftware(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe('updated');
  });

  it('matches names with surrounding whitespace', () => {
    const from = [{ name: '  Git  ', version: '2.43.0' }];
    const to   = [{ name: 'Git',     version: '2.43.0' }];
    expect(diffSoftware(from, to)).toHaveLength(0);
  });

  it('handles the { apps: [...] } blob shape', () => {
    const from = { apps: [{ name: 'Chrome', version: '120.0' }] };
    const to   = { apps: [{ name: 'Chrome', version: '121.0' }] };
    const result = diffSoftware(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe('updated');
  });

  it('handles added version being empty string', () => {
    const from: unknown[] = [];
    const to = [{ name: 'UnversionedApp' }];
    const result = diffSoftware(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe('added');
    expect(result[0]!.version).toBeUndefined();
  });

  it('handles multiple adds, removes, and updates in one call', () => {
    const from = [
      { name: 'App-A', version: '1.0' },
      { name: 'App-B', version: '2.0' },
      { name: 'App-C', version: '3.0' },
    ];
    const to = [
      { name: 'App-A', version: '1.1' }, // updated
      { name: 'App-C', version: '3.0' }, // unchanged
      { name: 'App-D', version: '4.0' }, // added
    ];
    const result = diffSoftware(from, to);
    const ops = new Map(result.map((r) => [r.name, r.op]));
    expect(ops.get('App-A')).toBe('updated');
    expect(ops.get('App-B')).toBe('removed');
    expect(ops.has('App-C')).toBe(false); // no change
    expect(ops.get('App-D')).toBe('added');
  });
});

// ─── diffServices ─────────────────────────────────────────────────────────────

describe('diffServices', () => {
  it('returns empty array for null inputs', () => {
    expect(diffServices(null, null)).toHaveLength(0);
  });

  it('emits added for new services', () => {
    const result = diffServices(
      [],
      [{ name: 'wuauserv', status: 'running' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'added', name: 'wuauserv', status: 'running' });
  });

  it('emits removed for disappeared services', () => {
    const result = diffServices(
      [{ name: 'spooler', status: 'running' }],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'removed', name: 'spooler' });
  });

  it('emits changed when status changes', () => {
    const from = [{ name: 'wuauserv', status: 'running' }];
    const to   = [{ name: 'wuauserv', status: 'stopped' }];
    const result = diffServices(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'changed', name: 'wuauserv', from: 'running', to: 'stopped' });
  });

  it('does NOT emit entry for stable services (running in both)', () => {
    const stable = [{ name: 'svchost', status: 'running' }];
    expect(diffServices(stable, stable)).toHaveLength(0);
  });

  it('is case-sensitive for service names', () => {
    // 'Wuauserv' and 'wuauserv' should be treated as different services
    const from = [{ name: 'Wuauserv', status: 'running' }];
    const to   = [{ name: 'wuauserv', status: 'running' }];
    const result = diffServices(from, to);
    // 'Wuauserv' removed, 'wuauserv' added
    const ops = new Set(result.map((r) => r.op));
    expect(ops.has('removed')).toBe(true);
    expect(ops.has('added')).toBe(true);
  });

  it('handles multiple changes in one call', () => {
    const from = [
      { name: 'A', status: 'running' },
      { name: 'B', status: 'stopped' },
      { name: 'C', status: 'running' },
    ];
    const to = [
      { name: 'A', status: 'stopped' }, // changed
      { name: 'C', status: 'running' }, // stable
      { name: 'D', status: 'running' }, // added
    ];
    const result = diffServices(from, to);
    const map = new Map(result.map((r) => [r.name, r]));
    expect(map.get('A')!.op).toBe('changed');
    expect(map.get('B')!.op).toBe('removed');
    expect(map.has('C')).toBe(false); // stable
    expect(map.get('D')!.op).toBe('added');
  });
});

// ─── diffHardware ─────────────────────────────────────────────────────────────

describe('diffHardware', () => {
  it('returns empty object when nothing changes', () => {
    const snap = makeSnapshot({ ramGb: 16, cpuCores: 8, cpuModel: 'Intel i7' });
    expect(diffHardware(snap, snap)).toEqual({});
  });

  it('returns empty object when all values are null in both snapshots', () => {
    const snap = makeSnapshot();
    expect(diffHardware(snap, snap)).toEqual({});
  });

  it('detects a single field change', () => {
    const from = makeSnapshot({ ramGb: 8 });
    const to   = makeSnapshot({ ramGb: 16 });
    const result = diffHardware(from, to);
    expect(result).toEqual({ ramGb: { from: 8, to: 16 } });
  });

  it('detects multiple field changes', () => {
    const from = makeSnapshot({ ramGb: 8,  cpuCores: 4, cpuModel: 'Intel i5' });
    const to   = makeSnapshot({ ramGb: 16, cpuCores: 8, cpuModel: 'Intel i7' });
    const result = diffHardware(from, to);
    expect(Object.keys(result).sort()).toEqual(['cpuCores', 'cpuModel', 'ramGb']);
    expect(result.ramGb).toEqual({ from: 8, to: 16 });
    expect(result.cpuCores).toEqual({ from: 4, to: 8 });
    expect(result.cpuModel).toEqual({ from: 'Intel i5', to: 'Intel i7' });
  });

  it('reports null→value transitions', () => {
    const from = makeSnapshot({ operatingSystem: null });
    const to   = makeSnapshot({ operatingSystem: 'Windows 11' });
    const result = diffHardware(from, to);
    expect(result.operatingSystem).toEqual({ from: null, to: 'Windows 11' });
  });

  it('reports value→null transitions', () => {
    const from = makeSnapshot({ biosVersion: '1.5.0' });
    const to   = makeSnapshot({ biosVersion: null });
    const result = diffHardware(from, to);
    expect(result.biosVersion).toEqual({ from: '1.5.0', to: null });
  });

  it('does NOT report null→null as a change', () => {
    const from = makeSnapshot({ tpmVersion: null });
    const to   = makeSnapshot({ tpmVersion: null });
    expect(diffHardware(from, to)).toEqual({});
  });

  it('detects boolean field changes (secureBootEnabled)', () => {
    const from = makeSnapshot({ secureBootEnabled: false });
    const to   = makeSnapshot({ secureBootEnabled: true });
    const result = diffHardware(from, to);
    expect(result.secureBootEnabled).toEqual({ from: false, to: true });
  });
});

// ─── diffNetwork ──────────────────────────────────────────────────────────────

describe('diffNetwork', () => {
  it('returns empty array for null inputs', () => {
    expect(diffNetwork(null, null)).toHaveLength(0);
  });

  it('emits added for new interfaces', () => {
    const result = diffNetwork(
      [],
      [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.10' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'added', mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.10' });
  });

  it('emits removed for disappeared interfaces', () => {
    const result = diffNetwork(
      [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.1' }],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ op: 'removed', mac: 'AA:BB:CC:DD:EE:FF' });
  });

  it('emits changed when IP changes', () => {
    const from = [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.1' }];
    const to   = [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.2' }];
    const result = diffNetwork(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      op: 'changed',
      mac: 'AA:BB:CC:DD:EE:FF',
      ip: '10.0.0.2',
      fromIp: '10.0.0.1',
    });
  });

  it('emits no entry when MAC and IP are both unchanged', () => {
    const iface = [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '192.168.1.1' }];
    expect(diffNetwork(iface, iface)).toHaveLength(0);
  });

  it('matches MACs case-insensitively', () => {
    const from = [{ mac: 'aa:bb:cc:dd:ee:ff', ip: '10.0.0.1' }];
    const to   = [{ mac: 'AA:BB:CC:DD:EE:FF', ip: '10.0.0.2' }];
    const result = diffNetwork(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe('changed');
  });

  it('skips entries without a MAC', () => {
    const iface = [{ ip: '10.0.0.1' }]; // no mac
    expect(diffNetwork([], iface)).toHaveLength(0);
    expect(diffNetwork(iface, [])).toHaveLength(0);
  });

  it('checks ipAddress field as fallback', () => {
    const from = [{ mac: 'AA:BB:CC:DD:EE:FF', ipAddress: '10.0.0.1' }];
    const to   = [{ mac: 'AA:BB:CC:DD:EE:FF', ipAddress: '10.0.0.2' }];
    const result = diffNetwork(from, to);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe('changed');
  });
});

// ─── computeAndStoreInventoryDiff (integration-ish) ──────────────────────────

describe('computeAndStoreInventoryDiff', () => {
  it('returns early without writing when there is no prior snapshot', async () => {
    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);

    const snap = makeSnapshot({ id: 'snap-1' });
    await computeAndStoreInventoryDiff(TENANT, AGENT, snap);

    expect(mockPrisma.inventoryDiff.create).not.toHaveBeenCalled();
  });

  it('returns early without writing when nothing changed between snapshots', async () => {
    const prev = makeSnapshot({ id: 'snap-0', ramGb: 16 });
    const curr = makeSnapshot({ id: 'snap-1', ramGb: 16 });

    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(prev);

    await computeAndStoreInventoryDiff(TENANT, AGENT, curr);

    expect(mockPrisma.inventoryDiff.create).not.toHaveBeenCalled();
  });

  it('writes an InventoryDiff row when hardware changed', async () => {
    const prev = makeSnapshot({ id: 'snap-0', ramGb: 8  });
    const curr = makeSnapshot({ id: 'snap-1', ramGb: 16 });

    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(prev);
    mockPrisma.inventoryDiff.create.mockResolvedValue({});

    await computeAndStoreInventoryDiff(TENANT, AGENT, curr);

    expect(mockPrisma.inventoryDiff.create).toHaveBeenCalledOnce();
    const callArg = mockPrisma.inventoryDiff.create.mock.calls[0][0];
    expect(callArg.data.tenantId).toBe(TENANT);
    expect(callArg.data.agentId).toBe(AGENT);
    expect(callArg.data.fromSnapshotId).toBe('snap-0');
    expect(callArg.data.toSnapshotId).toBe('snap-1');
    expect(callArg.data.diffJson.hardware?.ramGb).toEqual({ from: 8, to: 16 });
  });

  it('writes an InventoryDiff row when software changed', async () => {
    const prev = makeSnapshot({
      id: 'snap-0',
      installedSoftware: [{ name: 'Chrome', version: '120.0' }],
    });
    const curr = makeSnapshot({
      id: 'snap-1',
      installedSoftware: [{ name: 'Chrome', version: '121.0' }],
    });

    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(prev);
    mockPrisma.inventoryDiff.create.mockResolvedValue({});

    await computeAndStoreInventoryDiff(TENANT, AGENT, curr);

    expect(mockPrisma.inventoryDiff.create).toHaveBeenCalledOnce();
    const callArg = mockPrisma.inventoryDiff.create.mock.calls[0][0];
    expect(callArg.data.diffJson.software).toHaveLength(1);
    expect(callArg.data.diffJson.software[0].op).toBe('updated');
  });

  it('queries previous snapshot with correct agentId and excludes current id', async () => {
    const curr = makeSnapshot({ id: 'snap-1' });
    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);

    await computeAndStoreInventoryDiff(TENANT, AGENT, curr);

    expect(mockPrisma.inventorySnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: AGENT,
          id: { not: 'snap-1' },
        }),
      }),
    );
  });

  it('only writes populated sections to diffJson', async () => {
    const prev = makeSnapshot({ id: 'snap-0', ramGb: 8 });
    const curr = makeSnapshot({ id: 'snap-1', ramGb: 16 });

    mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(prev);
    mockPrisma.inventoryDiff.create.mockResolvedValue({});

    await computeAndStoreInventoryDiff(TENANT, AGENT, curr);

    const callArg = mockPrisma.inventoryDiff.create.mock.calls[0][0];
    const diffJson = callArg.data.diffJson;
    // Only hardware changed — software/services/network should not be in the object
    expect(diffJson.hardware).toBeDefined();
    expect(diffJson.software).toBeUndefined();
    expect(diffJson.services).toBeUndefined();
    expect(diffJson.network).toBeUndefined();
  });
});
