'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { SkeletonTable } from '@/components/Skeleton';
import {
  mdiAlertCircleOutline,
  mdiPlus,
  mdiArrowLeft,
  mdiEyeOutline,
  mdiCalendarClock,
} from '@mdi/js';

interface DetectedPattern {
  id: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

interface DetectedResponse {
  data: DetectedPattern[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Parse the notification body into structured pattern entries.
 * Each line is a pattern like:
 *   Category "Network": 12 incidents in the last 30 days (category ID: ...)
 *   Assignee cluster: 5 similar tickets (e.g., "VPN not working", ...)
 */
function parsePatterns(body: string | null): Array<{ type: string; label: string; detail: string }> {
  if (!body) return [];
  return body.split('\n').filter(Boolean).map((line) => {
    if (line.startsWith('Category "')) {
      const match = line.match(/^Category "(.+?)": (\d+) incidents/);
      return {
        type: 'category',
        label: match?.[1] ?? 'Unknown',
        detail: match ? `${match[2]} incidents in the last 30 days` : line,
      };
    }
    if (line.startsWith('Assignee cluster:')) {
      const match = line.match(/^Assignee cluster: (\d+) similar tickets \(e\.g\., (.+)\)$/);
      return {
        type: 'assignee',
        label: `${match?.[1] ?? '?'} similar tickets`,
        detail: match?.[2] ?? line,
      };
    }
    return { type: 'other', label: 'Pattern', detail: line };
  });
}

export default function DetectedProblemsPage() {
  const { data, isLoading } = useQuery<DetectedResponse>({
    queryKey: ['problems-detected'],
    queryFn: async () => {
      const res = await fetch('/api/v1/problems/detected?pageSize=50', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load detected patterns');
      return res.json() as Promise<DetectedResponse>;
    },
    staleTime: 60_000,
  });

  const patterns = data?.data ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/dashboard/problems"
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <Icon path={mdiArrowLeft} size={0.85} />
          </Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={mdiAlertCircleOutline} size={1} color="var(--accent-primary)" />
            Detected Problem Patterns
            {data && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({data.total})</span>}
          </h1>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        The system automatically scans resolved incidents for recurring patterns. When a category accumulates 5+ incidents
        or an assignee receives 3+ similar tickets within 30 days, it is flagged here for review. Use these insights to create
        formal Problem tickets and investigate root causes.
      </p>

      {isLoading && <SkeletonTable rows={5} cols={3} />}

      {!isLoading && patterns.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 12,
          border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)',
        }}>
          <Icon path={mdiEyeOutline} size={2} color="var(--text-muted)" />
          <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 15 }}>
            No recurring patterns detected yet. The detection scan runs daily at 4:00 AM UTC.
          </p>
        </div>
      )}

      {!isLoading && patterns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {patterns.map((notification) => {
            const entries = parsePatterns(notification.body);
            return (
              <div
                key={notification.id}
                style={{
                  borderRadius: 12,
                  border: '1px solid var(--border-primary)',
                  backgroundColor: notification.isRead ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  padding: 20,
                }}
              >
                {/* Notification header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon path={mdiCalendarClock} size={0.7} color="var(--text-muted)" />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {new Date(notification.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {!notification.isRead && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px',
                        borderRadius: 999, backgroundColor: 'var(--accent-primary)',
                        color: '#fff',
                      }}>
                        NEW
                      </span>
                    )}
                  </div>
                </div>

                {/* Pattern cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {entries.map((entry, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', borderRadius: 8,
                        backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            backgroundColor: entry.type === 'category' ? '#eff6ff' : '#fef3c7',
                            color: entry.type === 'category' ? '#1d4ed8' : '#92400e',
                          }}>
                            {entry.type === 'category' ? 'CATEGORY' : entry.type === 'assignee' ? 'ASSIGNEE' : 'PATTERN'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {entry.label}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {entry.detail}
                        </span>
                      </div>
                      <Link
                        href="/dashboard/tickets/new?type=PROBLEM"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                          borderRadius: 6, border: '1px solid var(--border-primary)',
                          backgroundColor: 'var(--bg-primary)', color: 'var(--accent-primary)',
                          fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        <Icon path={mdiPlus} size={0.6} />
                        Create Problem
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
