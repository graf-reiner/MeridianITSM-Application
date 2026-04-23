'use client';

import { useState } from 'react';
import Icon from '@mdi/react';
import { mdiHistory } from '@mdi/js';
import {
  useCITimeline,
  type CITimelineEntry,
  type FieldChangeEvent,
  type InventoryDiffEvent,
  type TimelineResponse,
} from '@/hooks/use-ci-timeline';

// ─── Props ────────────────────────────────────────────────────────────────────

interface CITimelineProps {
  ciId: string;
}

// ─── Field name display mapping ───────────────────────────────────────────────

const FIELD_DISPLAY_NAMES: Record<string, string> = {
  name: 'Name',
  displayName: 'Display Name',
  type: 'Type',
  status: 'Status',
  environment: 'Environment',
  hostname: 'Hostname',
  fqdn: 'FQDN',
  ipAddress: 'IP Address',
  serialNumber: 'Serial Number',
  assetTag: 'Asset Tag',
  externalId: 'External ID',
  model: 'Model',
  version: 'Version',
  edition: 'Edition',
  criticality: 'Criticality',
  confidentialityClass: 'Confidentiality Class',
  integrityClass: 'Integrity Class',
  availabilityClass: 'Availability Class',
  installDate: 'Install Date',
  firstDiscoveredAt: 'First Discovered At',
  lastVerifiedAt: 'Last Verified At',
  lastSeenAt: 'Last Seen At',
  sourceSystem: 'Source System',
  sourceRecordKey: 'Source Record Key',
  sourceOfTruth: 'Source of Truth',
  reconciliationRank: 'Reconciliation Rank',
  manufacturerId: 'Manufacturer',
  ciClassId: 'CI Class',
  lifecycleStatusId: 'Lifecycle Status',
  operationalStatusId: 'Operational Status',
  cmdbEnvironmentId: 'CMDB Environment',
  supportGroupId: 'Support Group',
  categoryId: 'Category',
  businessOwnerId: 'Business Owner',
  technicalOwnerId: 'Technical Owner',
  agentId: 'Agent',
  ramGb: 'RAM (GB)',
  cpuCount: 'CPU Count',
  storageGb: 'Storage (GB)',
  memoryGb: 'Memory (GB)',
  osVersion: 'OS Version',
  operatingSystem: 'Operating System',
};

function getFieldDisplayName(fieldName: string): string {
  return FIELD_DISPLAY_NAMES[fieldName] ?? fieldName;
}

// ─── Date formatting helpers ─────────────────────────────────────────────────

function formatDateGroup(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

type ChangedBy = 'AGENT' | 'USER' | 'IMPORT';

function getBorderColor(changedBy: ChangedBy, isDeleted?: boolean): string {
  if (isDeleted) return '#ef4444'; // red-500
  switch (changedBy) {
    case 'AGENT':  return '#3b82f6'; // blue-500
    case 'USER':   return '#22c55e'; // green-500
    case 'IMPORT': return '#a855f7'; // purple-500
    default:       return '#3b82f6';
  }
}

function getBadgeStyle(changedBy: ChangedBy): React.CSSProperties {
  switch (changedBy) {
    case 'AGENT':
      return { backgroundColor: '#dbeafe', color: '#1e40af' };
    case 'USER':
      return { backgroundColor: '#dcfce7', color: '#166534' };
    case 'IMPORT':
      return { backgroundColor: '#f3e8ff', color: '#6b21a8' };
    default:
      return { backgroundColor: '#dbeafe', color: '#1e40af' };
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActorBadge({ changedBy, label }: { changedBy: ChangedBy; label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        ...getBadgeStyle(changedBy),
      }}
    >
      {changedBy}
    </span>
  );
}

function NullValue() {
  return <em style={{ color: 'var(--text-placeholder)', fontSize: 12 }}>empty</em>;
}

function FieldChangeCard({ event }: { event: FieldChangeEvent }) {
  const isCreated = event.changeType === 'CREATED';
  const isDeleted = event.changeType === 'DELETED';
  const borderColor = getBorderColor(event.changedBy as ChangedBy, isDeleted);

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 6,
        backgroundColor: 'var(--bg-card)',
        border: `1px solid var(--border-primary)`,
        borderLeftColor: borderColor,
        borderLeftWidth: 3,
        padding: '12px 16px',
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isCreated || isDeleted ? 0 : 10 }}>
        <ActorBadge changedBy={event.changedBy as ChangedBy} label={event.changedBy} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {event.actorName ?? '—'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {formatTime(event.timestamp)}
        </span>
      </div>

      {/* Created */}
      {isCreated && (
        <div style={{ marginTop: 6, fontSize: 13, color: '#1e40af', fontWeight: 500 }}>
          ★ Configuration Item Created
        </div>
      )}

      {/* Deleted */}
      {isDeleted && (
        <div style={{ marginTop: 6, fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
          ✕ Configuration Item Deleted
        </div>
      )}

      {/* Updated — field changes */}
      {!isCreated && !isDeleted && event.changes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {event.changes.map((ch, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)', minWidth: 140 }}>
                {getFieldDisplayName(ch.fieldName)}
              </span>
              <span style={{ color: '#991b1b', textDecoration: 'line-through', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ch.oldValue !== null && ch.oldValue !== '' ? ch.oldValue : <NullValue />}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
              <span style={{ color: '#065f46', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ch.newValue !== null && ch.newValue !== '' ? ch.newValue : <NullValue />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      <span style={{ flex: '0 0 auto' }}>{label}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-secondary)' }} />
    </div>
  );
}

function InventoryDiffCard({ event }: { event: InventoryDiffEvent }) {
  const diff = event.diffJson;
  const hasHardware = Array.isArray(diff.hardware) && diff.hardware.length > 0;
  const hasSoftware = Array.isArray(diff.software) && diff.software.length > 0;
  const hasServices = Array.isArray(diff.services) && diff.services.length > 0;
  const hasNetwork = Array.isArray(diff.network) && diff.network.length > 0;

  return (
    <div
      style={{
        borderLeft: '3px solid #3b82f6',
        borderRadius: 6,
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderLeftColor: '#3b82f6',
        borderLeftWidth: 3,
        padding: '12px 16px',
        marginBottom: 8,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ActorBadge changedBy="AGENT" label="AGENT" />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {event.agentHostname ?? '—'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {formatTime(event.timestamp)}
        </span>
      </div>

      {/* Hardware section */}
      {hasHardware && (
        <>
          <SectionDivider label="Hardware" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
            {diff.hardware!.map((h, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)', minWidth: 140 }}>
                  {getFieldDisplayName(h.field)}
                </span>
                <span style={{ color: '#991b1b', textDecoration: 'line-through' }}>
                  {h.oldValue ?? <NullValue />}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                <span style={{ color: '#065f46' }}>
                  {h.newValue ?? <NullValue />}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Software section */}
      {hasSoftware && (
        <>
          <SectionDivider label="Software" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
            {diff.software!.map((s, idx) => {
              if (s.action === 'added') {
                return (
                  <div key={idx} style={{ fontSize: 13, color: '#065f46' }}>
                    <span style={{ fontWeight: 700, marginRight: 4 }}>+</span>
                    {s.name}{s.newVersion ? ` ${s.newVersion}` : ''}
                  </div>
                );
              }
              if (s.action === 'removed') {
                return (
                  <div key={idx} style={{ fontSize: 13, color: '#991b1b' }}>
                    <span style={{ fontWeight: 700, marginRight: 4 }}>-</span>
                    {s.name}{s.oldVersion ? ` ${s.oldVersion}` : ''}
                  </div>
                );
              }
              // updated
              return (
                <div key={idx} style={{ fontSize: 13, color: '#92400e' }}>
                  <span style={{ fontWeight: 700, marginRight: 4 }}>~</span>
                  {s.name}
                  {(s.oldVersion || s.newVersion) && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      {s.oldVersion ?? '—'} → {s.newVersion ?? '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Services section */}
      {hasServices && (
        <>
          <SectionDivider label="Services" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
            {diff.services!.map((svc, idx) => {
              if (svc.action === 'added') {
                return (
                  <div key={idx} style={{ fontSize: 13, color: '#065f46' }}>
                    <span style={{ fontWeight: 700, marginRight: 4 }}>+</span>
                    {svc.name}{svc.newStatus ? ` (${svc.newStatus})` : ''}
                  </div>
                );
              }
              if (svc.action === 'removed') {
                return (
                  <div key={idx} style={{ fontSize: 13, color: '#991b1b' }}>
                    <span style={{ fontWeight: 700, marginRight: 4 }}>-</span>
                    {svc.name}{svc.oldStatus ? ` (${svc.oldStatus})` : ''}
                  </div>
                );
              }
              return (
                <div key={idx} style={{ fontSize: 13, color: '#92400e' }}>
                  <span style={{ fontWeight: 700, marginRight: 4 }}>~</span>
                  {svc.name}
                  {(svc.oldStatus || svc.newStatus) && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      {svc.oldStatus ?? '—'} → {svc.newStatus ?? '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Network section */}
      {hasNetwork && (
        <>
          <SectionDivider label="Network" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {diff.network!.map((n, idx) => (
              <div key={idx} style={{ fontSize: 13, color: n.action === 'added' ? '#065f46' : '#991b1b' }}>
                <span style={{ fontWeight: 700, marginRight: 4 }}>{n.action === 'added' ? '+' : '-'}</span>
                {n.ipAddress ?? '—'}
                {n.macAddress && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({n.macAddress})</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 72,
            borderRadius: 6,
            backgroundColor: 'var(--bg-tertiary)',
            animation: 'pulse 1.5s ease-in-out infinite',
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: 'var(--text-placeholder)',
        fontSize: 14,
      }}
    >
      <Icon path={mdiHistory} size={2} color="var(--text-placeholder)" />
      <div style={{ marginTop: 12 }}>No history events found for this CI.</div>
    </div>
  );
}

// ─── Group events by date ─────────────────────────────────────────────────────

function groupByDate(events: CITimelineEntry[]): Array<{ dateKey: string; label: string; events: CITimelineEntry[] }> {
  const map = new Map<string, { label: string; events: CITimelineEntry[] }>();
  for (const event of events) {
    const key = getDateKey(event.timestamp);
    if (!map.has(key)) {
      map.set(key, { label: formatDateGroup(event.timestamp), events: [] });
    }
    map.get(key)!.events.push(event);
  }
  return Array.from(map.entries()).map(([dateKey, v]) => ({ dateKey, ...v }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CITimeline({ ciId }: CITimelineProps) {
  const [page, setPage] = useState(1);
  const [accumulatedData, setAccumulatedData] = useState<CITimelineEntry[]>([]);
  const [totalFromServer, setTotalFromServer] = useState<number>(0);
  const [cappedFromServer, setCappedFromServer] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const { data, isLoading, error } = useCITimeline(ciId, page);

  // Accumulate pages as they arrive
  if (data && !isLoading) {
    const incomingIds = new Set(data.data.map((e) => e.id));
    const existingIds = new Set(accumulatedData.map((e) => e.id));
    const hasNew = data.data.some((e) => !existingIds.has(e.id));

    if (hasNew || !hasLoadedOnce) {
      // Merge: replace any existing entries from this page, append new ones
      const filtered = accumulatedData.filter((e) => !incomingIds.has(e.id));
      const merged = [...filtered, ...data.data];
      if (merged.length !== accumulatedData.length || !hasLoadedOnce) {
        setAccumulatedData(merged);
        setTotalFromServer(data.total);
        setCappedFromServer(data.capped);
        if (!hasLoadedOnce) setHasLoadedOnce(true);
      }
    }
  }

  const grouped = groupByDate(accumulatedData);
  const hasMore = accumulatedData.length < totalFromServer;

  if (isLoading && !hasLoadedOnce) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--accent-danger)', fontSize: 14 }}>
        Failed to load timeline. Please try again.
      </div>
    );
  }

  if (hasLoadedOnce && accumulatedData.length === 0) {
    return <EmptyState />;
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Capped notice */}
      {cappedFromServer && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 14px',
            borderRadius: 6,
            backgroundColor: '#fefce8',
            border: '1px solid #fde68a',
            fontSize: 13,
            color: '#92400e',
          }}
        >
          Showing the most recent 1,000 changes. Older history may exist.
        </div>
      )}

      {/* Timeline groups */}
      {grouped.map(({ dateKey, label, events }) => (
        <div key={dateKey} style={{ marginBottom: 24 }}>
          {/* Date header */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>{label}</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-primary)' }} />
          </div>

          {/* Events for this date */}
          {events.map((event) => {
            if (event.type === 'field_change') {
              return <FieldChangeCard key={event.id} event={event} />;
            }
            if (event.type === 'inventory_diff') {
              return <InventoryDiffCard key={event.id} event={event as InventoryDiffEvent} />;
            }
            return null;
          })}
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={isLoading}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Loading...' : 'Load older changes'}
          </button>
        </div>
      )}
    </div>
  );
}
