'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiWebhook, mdiPlus, mdiClose, mdiContentCopy, mdiCheck } from '@mdi/js';

interface InboundWebhook {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  consecutiveFailures: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  _count: { deliveries: number };
}

interface CreateResponse extends InboundWebhook {
  token: string;
  url: string;
}

const PUBLIC_BASE = (typeof window !== 'undefined' && window.location.origin) || '';

export default function InboundWebhooksListPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<CreateResponse | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<InboundWebhook[]>({
    queryKey: ['inbound-webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/v1/inbound-webhooks', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const createMut = useMutation<CreateResponse, Error, { name: string; description?: string }>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/v1/inbound-webhooks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Create failed');
      return res.json();
    },
    onSuccess: (data) => {
      setCreated(data);
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['inbound-webhooks'] });
    },
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
      <Link href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 12 }}>
        <Icon path={mdiArrowLeft} size={0.7} />
        <span style={{ fontSize: 13 }}>Settings</span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 24, fontWeight: 700 }}>
            <Icon path={mdiWebhook} size={1.1} color="var(--accent-primary)" />
            Inbound Webhooks
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Per-source URLs that third-party tools (curl, Datadog, PagerDuty, GitHub) POST to in order to create tickets.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon path={mdiPlus} size={0.7} />
          New Webhook
        </button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : webhooks.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border-secondary)', borderRadius: 12, color: 'var(--text-muted)' }}>
          <Icon path={mdiWebhook} size={2.5} color="var(--text-placeholder)" />
          <p style={{ margin: '12px 0 0' }}>No inbound webhooks yet. Create one to get a URL you can curl.</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-primary)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-secondary)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Deliveries</th>
              <th style={thStyle}>Last Used</th>
              <th style={thStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                <td style={tdStyle}>
                  <Link href={`/dashboard/settings/inbound-webhooks/${w.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
                    {w.name}
                  </Link>
                  {w.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{w.description}</div>}
                </td>
                <td style={tdStyle}>
                  <StatusBadge isActive={w.isActive} failures={w.consecutiveFailures} />
                </td>
                <td style={tdStyle}>{w._count.deliveries}</td>
                <td style={tdStyle}>{w.lastUsedAt ? new Date(w.lastUsedAt).toLocaleString() : '—'}</td>
                <td style={tdStyle}>{new Date(w.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(p) => createMut.mutate(p)}
          isPending={createMut.isPending}
          error={createMut.error?.message ?? null}
        />
      )}

      {created && <CreatedTokenModal data={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreate, isPending, error }: {
  onClose: () => void;
  onCreate: (p: { name: string; description?: string }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>New Inbound Webhook</h2>
          <button onClick={onClose} style={iconButton}><Icon path={mdiClose} size={0.8} /></button>
        </div>
        <label style={fieldLabel}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Datadog Production" style={inputStyle} />
        <label style={fieldLabel}>Description (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What posts to this URL?" style={inputStyle} />
        {error && <div style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button
            onClick={() => onCreate({ name: name.trim(), description: description.trim() || undefined })}
            disabled={!name.trim() || isPending}
            style={{ ...btnPrimary, opacity: !name.trim() || isPending ? 0.5 : 1 }}
          >
            {isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatedTokenModal({ data, onClose }: { data: CreateResponse; onClose: () => void }) {
  const fullUrl = data.url.startsWith('http') ? data.url : `${PUBLIC_BASE}${data.url}`;
  return (
    <div style={modalOverlay}>
      <div style={{ ...modalCard, maxWidth: 600 }}>
        <h2 style={{ margin: 0, fontSize: 18, marginBottom: 8 }}>Webhook Created</h2>
        <p style={{ color: 'var(--accent-warning)', fontSize: 13, marginBottom: 16 }}>
          ⚠ Copy the URL now — it contains the token and won&apos;t be shown again.
        </p>
        <CopyField label="Webhook URL" value={fullUrl} multiline />
        <CopyField label="Token (also embedded in the URL)" value={data.token} />
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16 }}>
          Test it: <code style={codeStyle}>{`curl -X POST "${fullUrl}" -H 'Content-Type: application/json' -d '{"title":"Hello","description":"From curl"}'`}</code>
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={btnPrimary}>Done</button>
        </div>
      </div>
    </div>
  );
}

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={fieldLabel}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {multiline ? (
          <textarea readOnly value={value} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, minHeight: 60, resize: 'vertical' }} />
        ) : (
          <input readOnly value={value} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} />
        )}
        <button onClick={copy} style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon path={copied ? mdiCheck : mdiContentCopy} size={0.7} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ isActive, failures }: { isActive: boolean; failures: number }) {
  if (!isActive) return <span style={{ ...badgeStyle, background: 'var(--bg-danger-subtle)', color: 'var(--accent-danger)' }}>Disabled</span>;
  if (failures > 5) return <span style={{ ...badgeStyle, background: 'var(--bg-warning-subtle)', color: 'var(--accent-warning)' }}>Failing ({failures})</span>;
  return <span style={{ ...badgeStyle, background: 'var(--bg-success-subtle)', color: 'var(--accent-success)' }}>Active</span>;
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 };
const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)' };
const badgeStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 };
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modalCard: React.CSSProperties = { width: '90%', maxWidth: 480, background: 'var(--bg-primary)', borderRadius: 12, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' };
const fieldLabel: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 8 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { padding: '8px 14px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer' };
const iconButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' };
const codeStyle: React.CSSProperties = { display: 'block', padding: 8, marginTop: 4, background: 'var(--bg-tertiary)', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', whiteSpace: 'pre-wrap' };
