'use client';

import { useQuery } from '@tanstack/react-query';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldChangeEvent {
  type: 'field_change';
  id: string;
  ciId: string;
  changeType: 'CREATED' | 'UPDATED' | 'DELETED';
  changedBy: 'AGENT' | 'USER' | 'IMPORT';
  actorName: string | null;
  actorId: string | null;
  changes: Array<{
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
  timestamp: string;
}

export interface HardwareDiff {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

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

export interface NetworkDiffEntry {
  action: 'added' | 'removed';
  ipAddress: string | null;
  macAddress: string | null;
}

export interface InventoryDiffJson {
  hardware?: HardwareDiff[];
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
  diffJson: InventoryDiffJson;
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
