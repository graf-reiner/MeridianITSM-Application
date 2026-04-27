'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@mdi/react';
import { mdiClose, mdiArrowDown, mdiArrowUp, mdiRefresh } from '@mdi/js';

interface Props {
  account: { id: string; emailAddress: string };
  onClose: () => void;
}

interface ActivityEntry {
  id: string;
  tenantId: string;
  emailAccountId: string;
  direction: string;
  status: string;
  subject: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  messageId: string | null;
  ticketId: string | null;
  attemptNumber: number;
  errorCode: string | null;
  errorMessage: string | null;
  rawMeta: unknown;
  occurredAt: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  SENT:               { bg: '#dcfce7', fg: '#166534' },
  RECEIVED:           { bg: '#dbeafe', fg: '#1e40af' },
  POLL_STARTED:       { bg: '#f1f5f9', fg: '#475569' },
  POLL_COMPLETE:      { bg: '#e0e7ff', fg: '#4338ca' },
  POLL_FAILED:        { bg: '#fef2f2', fg: '#991b1b' },
  FAILED:             { bg: '#fef2f2', fg: '#991b1b' },
  PERMANENT_FAILURE:  { bg: '#fee2e2', fg: '#7f1d1d' },
  RETRYING:           { bg: '#fef3c7', fg: '#92400e' },
  QUEUED:             { bg: '#f1f5f9', fg: '#475569' },
  SENDING:            { bg: '#e0e7ff', fg: '#4338ca' },
};

function statusBadge(status: string) {
  const c = STATUS_COLORS[status] ?? { bg: '#f1f5f9', fg: '#475569' };
  return { background: c.bg, color: c.fg, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
}

export default function EmailActivityLogModal({ account, onClose }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'INBOUND' | 'OUTBOUND'>('all');
  const [streamConnected, setStreamConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function loadHistory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/email-accounts/${account.id}/activity?limit=300`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { entries: ActivityEntry[] };
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }

  // Initial history fetch
  useEffect(() => { void loadHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [account.id]);

  // SSE live tail
  useEffect(() => {
    const url = `/api/v1/email-accounts/${account.id}/activity/stream`;
    const es = new EventSource(url, { withCredentials: true } as EventSourceInit);
    eventSourceRef.current = es;

    es.onopen = () => setStreamConnected(true);
    es.onerror = () => setStreamConnected(false);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as ActivityEntry & { type?: string };
        if (data.type === 'connected') return;
        // Prepend (newest first), dedup by id
        setEntries(prev => prev.some(e => e.id === data.id) ? prev : [data, ...prev]);
      } catch (parseErr) {
        console.error('SSE parse error', parseErr);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [account.id]);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.direction === filter);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 880, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0f172a' }}>Activity log</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>{account.emailAddress} &middot; last 48 hours, live updates {streamConnected ? <span style={{ color: '#16a34a' }}>● connected</span> : <span style={{ color: '#94a3b8' }}>● reconnecting</span>}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon path={mdiClose} size={0.8} color="#64748b" />
          </button>
        </div>

        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'INBOUND', 'OUTBOUND'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '4px 10px', background: filter === f ? '#4338ca' : '#fff', color: filter === f ? '#fff' : '#475569', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' }}>{f.toLowerCase()}</button>
            ))}
          </div>
          <button onClick={() => void loadHistory()} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, cursor: loading ? 'wait' : 'pointer' }}>
            <Icon path={mdiRefresh} size={0.6} color="currentColor" />
            {loading ? 'Loading…' : 'Reload 48h history'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>{error}</div>}
          {!error && filtered.length === 0 && !loading && (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No activity in the selected window.</div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {filtered.map(e => {
                const dirIcon = e.direction === 'INBOUND' ? mdiArrowDown : mdiArrowUp;
                const dirColor = e.direction === 'INBOUND' ? '#0ea5e9' : '#a855f7';
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', color: '#94a3b8', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, verticalAlign: 'top' }}>{new Date(e.occurredAt).toLocaleString()}</td>
                    <td style={{ padding: '8px 6px', verticalAlign: 'top' }}><Icon path={dirIcon} size={0.65} color={dirColor} /></td>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top' }}><span style={statusBadge(e.status)}>{e.status}</span></td>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top', color: '#1e293b', wordBreak: 'break-word' }}>
                      <div style={{ fontWeight: 500 }}>{e.subject ?? <em style={{ color: '#94a3b8' }}>(no subject)</em>}</div>
                      {e.errorMessage && <div style={{ color: '#991b1b', fontSize: 11, marginTop: 2 }}>{e.errorMessage}</div>}
                      {e.fromAddress && <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>from {e.fromAddress}</div>}
                      {e.toAddresses && e.toAddresses.length > 0 && <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>to {e.toAddresses.join(', ')}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      {e.ticketId && <a href={`/dashboard/tickets/${e.ticketId}`} style={{ fontSize: 11, color: '#4338ca' }}>ticket →</a>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
