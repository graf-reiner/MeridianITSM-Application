'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { SkeletonTable } from '@/components/Skeleton';
import {
  mdiAlertOctagram,
  mdiArrowLeft,
  mdiCalendarClock,
  mdiEyeOutline,
} from '@mdi/js';

interface DetectedSignal {
  id: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

interface DetectedResponse {
  data: DetectedSignal[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Render each newline of the notification body as a separate "signal" row.
 * Worker emits one line per detection rule it matched.
 */
function splitSignals(body: string | null): string[] {
  if (!body) return [];
  return body.split('\n').filter((line) => line.trim().length > 0);
}

export default function DetectedMajorIncidentsPage() {
  const { data, isLoading } = useQuery<DetectedResponse>({
    queryKey: ['major-incidents-detected'],
    queryFn: async () => {
      const res = await fetch('/api/v1/major-incidents/detected?pageSize=50', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load detected major incidents');
      return res.json() as Promise<DetectedResponse>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = data?.data ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/dashboard/major-incidents"
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <Icon path={mdiArrowLeft} size={0.85} />
          </Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={mdiAlertOctagram} size={1} color="#dc2626" />
            Detected Major Incident Signals
            {data && (
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                ({data.total})
              </span>
            )}
          </h1>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
        The system scans incoming incidents every minute and surfaces patterns that may warrant a Major
        Incident: rapid clustering by category or affected CI, or any incident reported against a
        critical production CI. Review the signals and promote the appropriate ticket if the situation
        calls for coordinated response.
      </p>

      {isLoading && <SkeletonTable rows={5} cols={2} />}

      {!isLoading && items.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 12,
          border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)',
        }}>
          <Icon path={mdiEyeOutline} size={2} color="var(--text-muted)" />
          <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 15 }}>
            No active signals. The detection scan runs every minute against incidents created in the
            last 10 minutes.
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {items.map((notification) => {
            const signals = splitSignals(notification.body);
            return (
              <div
                key={notification.id}
                style={{
                  borderRadius: 12,
                  border: '1px solid var(--border-primary)',
                  backgroundColor: notification.isRead ? 'var(--bg-primary)' : '#fef2f2',
                  padding: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon path={mdiCalendarClock} size={0.7} color="var(--text-muted)" />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {new Date(notification.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {!notification.isRead && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 999, backgroundColor: '#dc2626', color: '#fff',
                      }}>
                        NEW
                      </span>
                    )}
                  </div>
                  <Link
                    href="/dashboard/tickets?type=INCIDENT&status=OPEN"
                    style={{
                      padding: '6px 12px', borderRadius: 6,
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-primary)', color: 'var(--accent-primary)',
                      fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    Review incidents →
                  </Link>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {signals.map((signal, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px', borderRadius: 8,
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-secondary)',
                        fontSize: 13, color: 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <Icon path={mdiAlertOctagram} size={0.6} color="#dc2626" />
                      <span>{signal}</span>
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
