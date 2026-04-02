'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ownerFetch } from '../../../lib/api';

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface SystemData {
  queues: QueueStats[];
  redisStatus: 'connected' | 'disconnected';
}

function getQueueColor(q: QueueStats): { bg: string; text: string; border: string } {
  if (q.failed > 0) return { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' };
  if (q.active > 0 && q.waiting === 0) return { bg: '#fff', text: '#374151', border: '#e5e7eb' };
  return { bg: '#f0fdf4', text: '#166534', border: '#86efac' };
}

const QUEUE_DISPLAY_NAMES: Record<string, string> = {
  'sla-monitor': 'SLA Monitor',
  'email-notification': 'Email Notifications',
  'email-polling': 'Email Polling',
  'cmdb-reconciliation': 'CMDB Reconciliation',
  'stripe-webhook': 'Stripe Webhook',
  'trial-expiry': 'Trial Expiry',
  'usage-snapshot': 'Usage Snapshot',
};

const EXPIRY_OPTIONS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '8 hours', value: 480 },
  { label: '24 hours', value: 1440 },
];

export default function SystemPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastExpiry, setBroadcastExpiry] = useState(60);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSystem = useCallback(async () => {
    try {
      const res = await ownerFetch('/api/system');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SystemData = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSystem();

    // Auto-refresh every 30 seconds
    intervalRef.current = setInterval(() => {
      void fetchSystem();
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchSystem]);

  async function sendBroadcast() {
    if (!broadcastMessage.trim()) return;
    setSendingBroadcast(true);
    setBroadcastResult(null);

    try {
      const res = await ownerFetch('/api/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: broadcastMessage,
          expiresInMinutes: broadcastExpiry,
        }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setBroadcastResult({ type: 'success', msg: `Broadcast sent — expires in ${broadcastExpiry} minutes` });
      setBroadcastMessage('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send broadcast';
      setBroadcastResult({ type: 'error', msg });
    } finally {
      setSendingBroadcast(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px', color: '#6b7280' }}>Loading system status...</div>;
  }

  if (error && !data) {
    return <div style={{ padding: '24px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>Error: {error}</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>System Operations</h1>
          <p style={{ color: '#6b7280', marginTop: '4px' }}>Worker queue health, maintenance broadcasts, and system tools</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {data && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: data.redisStatus === 'connected' ? '#dcfce7' : '#fee2e2',
                color: data.redisStatus === 'connected' ? '#166534' : '#991b1b',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: data.redisStatus === 'connected' ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
              Redis {data.redisStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </span>
          )}
          <button
            onClick={() => void fetchSystem()}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              backgroundColor: '#4338ca',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Refresh Now
          </button>
        </div>
      </div>

      {lastRefresh && (
        <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '24px' }}>
          Last refreshed: {lastRefresh.toLocaleTimeString()} (auto-refreshes every 30s)
        </p>
      )}

      {/* Queue Health */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 16px' }}>Worker Queue Health</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {(data?.queues ?? []).map(queue => {
            const colors = getQueueColor(queue);
            return (
              <div
                key={queue.name}
                style={{
                  backgroundColor: colors.bg,
                  borderRadius: '8px',
                  padding: '16px',
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: colors.text }}>
                    {QUEUE_DISPLAY_NAMES[queue.name] ?? queue.name}
                  </h3>
                  {queue.failed > 0 && (
                    <span style={{ fontSize: '10px', fontWeight: '700', backgroundColor: '#dc2626', color: '#fff', padding: '2px 6px', borderRadius: '9999px' }}>
                      {queue.failed} FAILED
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '12px' }}>
                  {[
                    { label: 'Waiting', value: queue.waiting, color: queue.waiting > 10 ? '#92400e' : '#374151' },
                    { label: 'Active', value: queue.active, color: queue.active > 0 ? '#1e40af' : '#374151' },
                    { label: 'Completed', value: queue.completed, color: '#166534' },
                    { label: 'Failed', value: queue.failed, color: queue.failed > 0 ? '#991b1b' : '#374151' },
                    { label: 'Delayed', value: queue.delayed, color: '#374151' },
                  ].map(stat => (
                    <div key={stat.label}>
                      <p style={{ margin: 0, fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>{stat.label}</p>
                      <p style={{ margin: '1px 0 0', fontSize: '16px', fontWeight: '700', color: stat.color }}>{stat.value.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Maintenance Broadcast */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px' }}>Maintenance Broadcast</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
          Send a system-wide maintenance message stored in Redis. The web application can read this to display a banner to all users.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <input
            type="text"
            value={broadcastMessage}
            onChange={e => setBroadcastMessage(e.target.value)}
            placeholder="e.g. Scheduled maintenance on Saturday 10pm–12am UTC"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
          <select
            value={broadcastExpiry}
            onChange={e => setBroadcastExpiry(parseInt(e.target.value, 10))}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: '#fff',
            }}
          >
            {EXPIRY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => void sendBroadcast()}
            disabled={sendingBroadcast || !broadcastMessage.trim()}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: sendingBroadcast || !broadcastMessage.trim() ? '#9ca3af' : '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: sendingBroadcast || !broadcastMessage.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {sendingBroadcast ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>

        {broadcastResult && (
          <p
            style={{
              fontSize: '13px',
              color: broadcastResult.type === 'success' ? '#166534' : '#991b1b',
              backgroundColor: broadcastResult.type === 'success' ? '#dcfce7' : '#fee2e2',
              padding: '8px 12px',
              borderRadius: '4px',
              margin: 0,
            }}
          >
            {broadcastResult.msg}
          </p>
        )}
      </div>

      {/* Future Tools Placeholder */}
      <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db', padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#9ca3af', margin: '0 0 4px' }}>System Tools (Coming Soon)</h2>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Trigger CMDB Reconciliation, force usage snapshots, and other maintenance operations will be available here in a future release.
        </p>
      </div>
    </div>
  );
}
