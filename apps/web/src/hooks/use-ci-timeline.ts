'use client';

import { useQuery } from '@tanstack/react-query';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldChangeEvent {
  type: 'field_change';
  id: string;
  ciId: string;
  changeType: 'CREATED' | 'UPDATED' | 'DELETED';
  changedBy: 'AGENT' | 'USER' | 'IMPORT';
  userName: string | null;
  actorId: string | null;
  fields: Array<{
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
  timestamp: string;
}

// Fix 3: hardware is a Record keyed by field name, not an array
export type HardwareDiff = Record<string, { from: unknown; to: unknown }>;

export interface SoftwareDiffEntry {
  action: 'added' | 'removed' | 'updated';
  name: string;
  oldVersion: string | null;
  newVersion: string | null;
}

export interface ServiceDiffEntry {
  action: 'added' | 'removed' | 'updated';
  name: string;
  oldStatus: string | null;
  newStatus: string | null;
}

// Fix 6: include 'changed' op type
export interface NetworkDiffEntry {
  op: 'added' | 'removed' | 'changed';
  mac: string;
  ip?: string;
  fromIp?: string;
}

export interface InventoryDiffJson {
  hardware?: HardwareDiff;
  software?: SoftwareDiffEntry[];
  services?: ServiceDiffEntry[];
  network?: NetworkDiffEntry[];
}

export interface InventoryDiffEvent {
  type: 'inventory_diff';
  id: string;
  ciId: string;
  agentId: string;
  agentHostname: string | null;
  diff: InventoryDiffJson;
  timestamp: string;
}

export type CITimelineEntry = FieldChangeEvent | InventoryDiffEvent;

export interface TimelineResponse {
  data: CITimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
  capped: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCITimeline(ciId: string, page: number = 1, pageSize: number = 25) {
  return useQuery<TimelineResponse>({
    queryKey: ['ci-timeline', ciId, page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/cmdb/cis/${ciId}/timeline?page=${page}&pageSize=${pageSize}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Failed to fetch timeline');
      return res.json() as Promise<TimelineResponse>;
    },
    enabled: !!ciId,
  });
}
