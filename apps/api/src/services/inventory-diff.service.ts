import { prisma } from '@meridian/db';

// ─── Snapshot shape (structural — avoids direct @prisma/client dependency) ───

/**
 * Minimal structural type covering the fields accessed by the diff engine.
 * The actual Prisma-generated InventorySnapshot satisfies this shape.
 */
export type InventorySnapshotShape = {
  id: string;
  agentId: string;
  collectedAt: Date;
  ramGb?: number | null;
  cpuCores?: number | null;
  cpuThreads?: number | null;
  cpuSpeedMhz?: number | null;
  cpuModel?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  biosVersion?: string | null;
  tpmVersion?: string | null;
  secureBootEnabled?: boolean | null;
  serialNumber?: string | null;
  diskEncrypted?: boolean | null;
  antivirusProduct?: string | null;
  firewallEnabled?: boolean | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  osBuild?: string | null;
  installedSoftware?: unknown;
  services?: unknown;
  networkInterfaces?: unknown;
};

// ─── Diff Types ───────────────────────────────────────────────────────────────

export type SoftwareDiffEntry = {
  op: 'added' | 'removed' | 'updated';
  name: string;
  version?: string;
  from?: string; // old version (for 'updated')
  to?: string;   // new version (for 'updated')
};

export type ServiceDiffEntry = {
  op: 'added' | 'removed' | 'changed';
  name: string;
  status?: string;  // for 'added'
  from?: string;    // old status (for 'changed')
  to?: string;      // new status (for 'changed')
};

export type HardwareDiff = {
  [field: string]: { from: unknown; to: unknown };
};

export type NetworkDiffEntry = {
  op: 'added' | 'removed' | 'changed';
  mac: string;
  ip?: string;     // for 'added' or 'changed'
  fromIp?: string; // old IP (for 'changed')
};

export type InventoryDiffJson = {
  software?: SoftwareDiffEntry[];
  services?: ServiceDiffEntry[];
  hardware?: HardwareDiff;
  network?: NetworkDiffEntry[];
};

// ─── Hardware fields compared by diffHardware ─────────────────────────────────

const HARDWARE_FIELDS = [
  'ramGb',
  'cpuCores',
  'cpuThreads',
  'cpuSpeedMhz',
  'cpuModel',
  'manufacturer',
  'model',
  'biosVersion',
  'tpmVersion',
  'secureBootEnabled',
  'serialNumber',
  'diskEncrypted',
  'antivirusProduct',
  'firewallEnabled',
  'operatingSystem',
  'osVersion',
  'osBuild',
] as const satisfies ReadonlyArray<keyof InventorySnapshotShape>;

// ─── Pure Diff Functions ───────────────────────────────────────────────────────

/**
 * Diff installed software lists.
 * Keys by name (case-insensitive, trimmed). Same name + different version → 'updated'.
 */
export function diffSoftware(from: unknown, to: unknown): SoftwareDiffEntry[] {
  const fromArr = parseSoftwareArray(from);
  const toArr = parseSoftwareArray(to);

  // Build maps keyed by normalised name → { originalName, version }
  const fromMap = new Map<string, { name: string; version: string }>();
  for (const item of fromArr) {
    const key = item.name.trim().toLowerCase();
    fromMap.set(key, { name: item.name, version: item.version ?? '' });
  }

  const toMap = new Map<string, { name: string; version: string }>();
  for (const item of toArr) {
    const key = item.name.trim().toLowerCase();
    toMap.set(key, { name: item.name, version: item.version ?? '' });
  }

  const results: SoftwareDiffEntry[] = [];

  // added or updated
  for (const [key, toEntry] of toMap) {
    const fromEntry = fromMap.get(key);
    if (!fromEntry) {
      results.push({ op: 'added', name: toEntry.name, version: toEntry.version || undefined });
    } else if (fromEntry.version !== toEntry.version) {
      results.push({
        op: 'updated',
        name: toEntry.name,
        from: fromEntry.version || undefined,
        to: toEntry.version || undefined,
      });
    }
    // same version → no entry
  }

  // removed
  for (const [key, fromEntry] of fromMap) {
    if (!toMap.has(key)) {
      results.push({ op: 'removed', name: fromEntry.name, version: fromEntry.version || undefined });
    }
  }

  return results;
}

/**
 * Diff services lists.
 * Keys by service name (case-sensitive). Only emits diffs — stable services produce no entry.
 */
export function diffServices(from: unknown, to: unknown): ServiceDiffEntry[] {
  const fromArr = parseServiceArray(from);
  const toArr = parseServiceArray(to);

  const fromMap = new Map<string, string>();
  for (const item of fromArr) {
    fromMap.set(item.name, item.status ?? '');
  }

  const toMap = new Map<string, string>();
  for (const item of toArr) {
    toMap.set(item.name, item.status ?? '');
  }

  const results: ServiceDiffEntry[] = [];

  // added or changed
  for (const [name, toStatus] of toMap) {
    const fromStatus = fromMap.get(name);
    if (fromStatus === undefined) {
      results.push({ op: 'added', name, status: toStatus || undefined });
    } else if (fromStatus !== toStatus) {
      results.push({ op: 'changed', name, from: fromStatus || undefined, to: toStatus || undefined });
    }
    // same status → no entry
  }

  // removed
  for (const [name] of fromMap) {
    if (!toMap.has(name)) {
      results.push({ op: 'removed', name });
    }
  }

  return results;
}

/**
 * Diff hardware scalar fields between two InventorySnapshot objects.
 * Returns an object keyed by field name, only for fields that actually changed.
 */
export function diffHardware(from: InventorySnapshotShape, to: InventorySnapshotShape): HardwareDiff {
  const result: HardwareDiff = {};

  for (const field of HARDWARE_FIELDS) {
    const fromVal = from[field] ?? null;
    const toVal = to[field] ?? null;

    // Skip null→null (no meaningful change)
    if (fromVal === null && toVal === null) continue;

    if (fromVal !== toVal) {
      result[field] = { from: fromVal, to: toVal };
    }
  }

  return result;
}

/**
 * Diff network interfaces.
 * Keys by MAC address (case-insensitive). IP check uses both `ip` and `ipAddress` fields.
 */
export function diffNetwork(from: unknown, to: unknown): NetworkDiffEntry[] {
  const fromArr = parseNetworkArray(from);
  const toArr = parseNetworkArray(to);

  const fromMap = new Map<string, string>();
  for (const iface of fromArr) {
    if (!iface.mac) continue;
    const key = iface.mac.toLowerCase();
    const ip = iface.ip ?? iface.ipAddress ?? '';
    fromMap.set(key, ip);
  }

  const toMap = new Map<string, { mac: string; ip: string }>();
  for (const iface of toArr) {
    if (!iface.mac) continue;
    const key = iface.mac.toLowerCase();
    const ip = iface.ip ?? iface.ipAddress ?? '';
    toMap.set(key, { mac: iface.mac, ip });
  }

  const results: NetworkDiffEntry[] = [];

  // added or changed
  for (const [key, toEntry] of toMap) {
    const fromIp = fromMap.get(key);
    if (fromIp === undefined) {
      results.push({ op: 'added', mac: toEntry.mac, ip: toEntry.ip || undefined });
    } else if (fromIp !== toEntry.ip) {
      results.push({ op: 'changed', mac: toEntry.mac, ip: toEntry.ip || undefined, fromIp: fromIp || undefined });
    }
    // same MAC + same IP → no entry
  }

  // removed
  for (const [key] of fromMap) {
    if (!toMap.has(key)) {
      // find original mac casing from fromArr
      const original = fromArr.find((i) => i.mac?.toLowerCase() === key);
      if (original?.mac) {
        results.push({ op: 'removed', mac: original.mac });
      }
    }
  }

  return results;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Compute the diff between the previous snapshot and `toSnapshot` for this
 * agent, then store the result in the `InventoryDiff` table.
 *
 * - Returns early (no-op) if there is no prior snapshot.
 * - Returns early (no-op) if all diff sections are empty (no changes).
 * - Multi-tenancy: tenantId is passed explicitly and written to every row.
 */
export async function computeAndStoreInventoryDiff(
  tenantId: string,
  agentId: string,
  toSnapshot: InventorySnapshotShape,
): Promise<void> {
  const fromSnapshot = await prisma.inventorySnapshot.findFirst({
    where: { tenantId, agentId, id: { not: toSnapshot.id } },
    orderBy: { collectedAt: 'desc' },
  });

  // No prior snapshot — first check-in; nothing to diff
  if (!fromSnapshot) return;

  const software = diffSoftware(fromSnapshot.installedSoftware, toSnapshot.installedSoftware);
  const services = diffServices(fromSnapshot.services, toSnapshot.services);
  const hardware = diffHardware(fromSnapshot, toSnapshot);
  const network = diffNetwork(fromSnapshot.networkInterfaces, toSnapshot.networkInterfaces);

  // Skip write if nothing changed
  const hasChanges =
    software.length > 0 ||
    services.length > 0 ||
    Object.keys(hardware).length > 0 ||
    network.length > 0;

  if (!hasChanges) return;

  const diffJson: InventoryDiffJson = {};
  if (software.length > 0) diffJson.software = software;
  if (services.length > 0) diffJson.services = services;
  if (Object.keys(hardware).length > 0) diffJson.hardware = hardware;
  if (network.length > 0) diffJson.network = network;

  // ciId is not a column on InventorySnapshot; the reconciliation worker
  // links the diff to a CI via the agentId→CI lookup. We store null here
  // and let the CI lookup in the timeline API resolve the CI by agentId.
  await prisma.inventoryDiff.create({
    data: {
      tenantId,
      agentId,
      ciId: null,
      fromSnapshotId: fromSnapshot.id,
      toSnapshotId: toSnapshot.id,
      diffJson: diffJson as never,
      collectedAt: toSnapshot.collectedAt,
    },
  });
}

// ─── Internal Parsers ─────────────────────────────────────────────────────────

function parseSoftwareArray(
  blob: unknown,
): Array<{ name: string; version?: string }> {
  if (!blob) return [];
  const arr = Array.isArray(blob)
    ? blob
    : typeof blob === 'object' &&
        blob !== null &&
        'apps' in blob &&
        Array.isArray((blob as { apps: unknown[] }).apps)
      ? (blob as { apps: unknown[] }).apps
      : [];
  return arr
    .filter(
      (item): item is { name: string; version?: string } =>
        item != null &&
        typeof item === 'object' &&
        'name' in item &&
        typeof (item as { name: unknown }).name === 'string',
    )
    .map((item) => ({
      name: item.name,
      version: typeof item.version === 'string' ? item.version : undefined,
    }));
}

function parseServiceArray(
  blob: unknown,
): Array<{ name: string; status?: string }> {
  if (!blob) return [];
  const arr = Array.isArray(blob) ? blob : [];
  return arr
    .filter(
      (item): item is { name: string; status?: string } =>
        item != null &&
        typeof item === 'object' &&
        'name' in item &&
        typeof (item as { name: unknown }).name === 'string',
    )
    .map((item) => ({
      name: item.name,
      status: typeof item.status === 'string' ? item.status : undefined,
    }));
}

function parseNetworkArray(
  blob: unknown,
): Array<{ mac?: string; ip?: string; ipAddress?: string }> {
  if (!blob) return [];
  const arr = Array.isArray(blob) ? blob : [];
  return arr
    .filter(
      (item): item is { mac?: string; ip?: string; ipAddress?: string } =>
        item != null && typeof item === 'object',
    )
    .map((item) => ({
      mac:
        typeof item.mac === 'string'
          ? item.mac
          : undefined,
      ip: typeof item.ip === 'string' ? item.ip : undefined,
      ipAddress: typeof item.ipAddress === 'string' ? item.ipAddress : undefined,
    }));
}
