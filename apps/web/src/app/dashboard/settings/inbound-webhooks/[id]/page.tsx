'use client';

import { useState, use, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiContentCopy, mdiCheck, mdiPlay, mdiKeyChange, mdiTune, mdiHelpCircleOutline, mdiBroom, mdiClose } from '@mdi/js';
import { formatTicketNumber } from '@meridian/core/record-numbers';

interface DeliveryRow {
  id: string;
  receivedAt: string;
  status: string;
  httpResponseCode: number;
  requestBodySize: number;
  mappedFields: Record<string, unknown> | null;
  createdTicketId: string | null;
  errorMessage: string | null;
  sourceIp: string | null;
  completedAt: string | null;
}

interface WebhookDetail {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  consecutiveFailures: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  defaultQueueId: string | null;
  defaultCategoryId: string | null;
  defaultPriority: string | null;
  defaultType: string | null;
  defaultRequesterId: string | null;
  mapping: Record<string, unknown>;
  createdAt: string;
  deliveries: DeliveryRow[];
}

const PUBLIC_BASE = (typeof window !== 'undefined' && window.location.origin) || '';

export default function InboundWebhookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  // Token never persists — only available in-session right after rotation.
  // Lifted here so MappingEditor's sample-curl block can prefill the URL.
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);

  const { data, isLoading } = useQuery<WebhookDetail>({
    queryKey: ['inbound-webhook', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inbound-webhooks/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  if (isLoading || !data) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
      <Link href="/dashboard/settings/inbound-webhooks" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 12 }}>
        <Icon path={mdiArrowLeft} size={0.7} />
        <span style={{ fontSize: 13 }}>Inbound Webhooks</span>
      </Link>

      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{data.name}</h1>
      {data.description && <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{data.description}</p>}

      <RotateTokenSection webhookId={id} onTokenRevealed={setRevealedUrl} />

      <TicketDefaultsSection webhook={data} onSaved={() => qc.invalidateQueries({ queryKey: ['inbound-webhook', id] })} />

      <MappingEditor webhook={data} webhookUrl={revealedUrl} onSaved={() => qc.invalidateQueries({ queryKey: ['inbound-webhook', id] })} />

      <DeliveriesTable deliveries={data.deliveries} />
    </div>
  );
}

// ─── Rotate token ───────────────────────────────────────────────────────────

function RotateTokenSection({ webhookId, onTokenRevealed }: { webhookId: string; onTokenRevealed?: (url: string) => void }) {
  const [revealed, setRevealed] = useState<{ token: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const rotateMut = useMutation<{ token: string; url: string }, Error>({
    mutationFn: async () => {
      if (!confirm('Generate a new token? The old one will stop working immediately.')) {
        throw new Error('cancelled');
      }
      const res = await fetch(`/api/v1/inbound-webhooks/${webhookId}/rotate-token`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Rotate failed');
      return res.json();
    },
    onSuccess: (data) => {
      setRevealed(data);
      const fullUrl = data.url.startsWith('http') ? data.url : `${PUBLIC_BASE}${data.url}`;
      onTokenRevealed?.(fullUrl);
    },
  });

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitle}>Webhook URL</h2>
      {revealed ? (
        <>
          <p style={{ color: 'var(--accent-warning)', fontSize: 13, marginBottom: 12 }}>
            ⚠ Save this URL now — the token won&apos;t be shown again.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea readOnly value={revealed.url.startsWith('http') ? revealed.url : `${PUBLIC_BASE}${revealed.url}`} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, minHeight: 60 }} />
            <button onClick={() => { navigator.clipboard.writeText(revealed.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={btnSecondary}>
              <Icon path={copied ? mdiCheck : mdiContentCopy} size={0.7} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          The token is hashed in the database and only shown once at creation. To get a new working URL, rotate the token below — the old one stops working immediately.
        </p>
      )}
      <button onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending} style={{ ...btnSecondary, marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon path={mdiKeyChange} size={0.7} />
        {rotateMut.isPending ? 'Rotating…' : 'Rotate Token'}
      </button>
    </section>
  );
}

// ─── Ticket Defaults (queue / category / priority / type) ──────────────────
// These set what every ticket created by this webhook gets when the inbound
// payload doesn't override via a mapping template. Saved via the same PATCH
// route the mapping editor uses.

interface OptionRow { id: string; name: string }

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const TYPE_OPTIONS = ['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE_REQUEST', 'TASK', 'MAJOR_INCIDENT'] as const;

function useQueueOptions() {
  return useQuery<OptionRow[]>({
    queryKey: ['settings', 'queues'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
    staleTime: 60_000,
  });
}

function useCategoryOptions() {
  return useQuery<OptionRow[]>({
    queryKey: ['settings', 'categories'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? [];
    },
    staleTime: 60_000,
  });
}

function TicketDefaultsSection({ webhook, onSaved }: { webhook: WebhookDetail; onSaved: () => void }) {
  const { data: queues = [] } = useQueueOptions();
  const { data: categories = [] } = useCategoryOptions();

  const [defaultQueueId, setDefaultQueueId] = useState(webhook.defaultQueueId ?? '');
  const [defaultCategoryId, setDefaultCategoryId] = useState(webhook.defaultCategoryId ?? '');
  const [defaultPriority, setDefaultPriority] = useState(webhook.defaultPriority ?? '');
  const [defaultType, setDefaultType] = useState(webhook.defaultType ?? '');

  const dirty =
    (webhook.defaultQueueId ?? '') !== defaultQueueId ||
    (webhook.defaultCategoryId ?? '') !== defaultCategoryId ||
    (webhook.defaultPriority ?? '') !== defaultPriority ||
    (webhook.defaultType ?? '') !== defaultType;

  const saveMut = useMutation<unknown, Error>({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/inbound-webhooks/${webhook.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultQueueId: defaultQueueId || null,
          defaultCategoryId: defaultCategoryId || null,
          defaultPriority: defaultPriority || null,
          defaultType: defaultType || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      return res.json();
    },
    onSuccess: () => onSaved(),
  });

  return (
    <section style={sectionStyle}>
      <h2 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon path={mdiTune} size={0.8} />
        Ticket Defaults
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Applied to every ticket created from this webhook unless the mapping templates below override them.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={fieldLabel}>Default Queue</label>
          <select value={defaultQueueId} onChange={(e) => setDefaultQueueId(e.target.value)} style={inputStyle}>
            <option value="">— None —</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Default Category</label>
          <select value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)} style={inputStyle}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Default Priority</label>
          <select value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)} style={inputStyle}>
            <option value="">— None —</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Default Type</label>
          <select value={defaultType} onChange={(e) => setDefaultType(e.target.value)} style={inputStyle}>
            <option value="">— None —</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          style={{ ...btnPrimary, opacity: !dirty || saveMut.isPending ? 0.5 : 1 }}
        >
          {saveMut.isPending ? 'Saving…' : 'Save Defaults'}
        </button>
        {saveMut.isError && <span style={{ color: 'var(--accent-danger)', fontSize: 12 }}>{saveMut.error.message}</span>}
        {saveMut.isSuccess && !dirty && <span style={{ color: 'var(--accent-success)', fontSize: 12 }}>Saved</span>}
      </div>
    </section>
  );
}

// ─── Mapping editor + preview ───────────────────────────────────────────────

function MappingEditor({ webhook, webhookUrl, onSaved }: { webhook: WebhookDetail; webhookUrl?: string | null; onSaved: () => void }) {
  const { data: queues = [] } = useQueueOptions();
  const { data: categories = [] } = useCategoryOptions();
  const [curlCopied, setCurlCopied] = useState(false);
  const [previewCopied, setPreviewCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>(() => normalizeMapping(webhook.mapping));
  const [samplePayload, setSamplePayload] = useState<string>(() => {
    // Pre-fill with the most recent delivery body if any.
    const latest = webhook.deliveries[0];
    if (latest?.mappedFields) {
      try { return JSON.stringify({ title: 'sample', description: 'sample body', priority: 'HIGH' }, null, 2); } catch { /* fall through */ }
    }
    return JSON.stringify({ title: 'Disk usage at 95%', description: 'node-prod-04', priority: 'HIGH' }, null, 2);
  });
  const [previewResult, setPreviewResult] = useState<unknown>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const saveMut = useMutation<unknown, Error>({
    mutationFn: async () => {
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(mapping)) if (v.trim()) filtered[k] = v;
      const res = await fetch(`/api/v1/inbound-webhooks/${webhook.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: filtered }),
      });
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    },
    onSuccess: () => onSaved(),
  });

  const clearMut = useMutation<unknown, Error>({
    mutationFn: async () => {
      if (!confirm('Clear all field mappings? Built-in defaults ({{json.title}}, {{json.description}}, etc.) will take over so plain curl works again.')) {
        throw new Error('cancelled');
      }
      const res = await fetch(`/api/v1/inbound-webhooks/${webhook.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: {} }),
      });
      if (!res.ok) throw new Error('Clear failed');
      return res.json();
    },
    onSuccess: () => {
      // Reset local form state so the inputs go empty alongside the saved value.
      setMapping({});
      onSaved();
    },
  });

  const previewMut = useMutation<{ ok: boolean; mapped?: unknown; error?: string }, Error>({
    mutationFn: async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(samplePayload); } catch { throw new Error('Sample payload is not valid JSON'); }
      // Pretty-print the textarea so the user sees clean JSON after preview.
      // The Sample cURL block reads from samplePayload state, so it auto-updates
      // to the formatted version too.
      setSamplePayload(JSON.stringify(parsed, null, 2));
      const res = await fetch(`/api/v1/inbound-webhooks/${webhook.id}/preview-mapping`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samplePayload: parsed, mappingOverride: mapping }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Preview failed');
      return json;
    },
    onSuccess: (data) => { setPreviewResult(data.mapped); setPreviewError(null); },
    onError: (err) => { setPreviewResult(null); setPreviewError(err.message); },
  });

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitle}>Field Mapping</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Use <code style={inlineCode}>{'{{json.path.to.value}}'}</code> to pull from the inbound payload — every ticket gets the value the sender put in its JSON.
        Type a plain string instead (e.g. <code style={inlineCode}>HIGH</code>) and every ticket will get exactly that string, regardless of payload.
        Empty fields fall back to <code style={inlineCode}>{'{{json.title}}'}</code>, <code style={inlineCode}>{'{{json.description}}'}</code>, etc. so plain curl works out of the box.
        The picker on the right lists valid values so you can copy them into the JSON your sender posts (avoiding typos like <code style={inlineCode}>INNCIDENT</code>).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          {MAPPING_FIELDS.map((f) => {
            const opts = f.pickerKind ? pickerOptions(f.pickerKind, queues, categories) : [];
            return (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label style={fieldLabel}>{f.label}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={mapping[f.key] ?? ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  {f.pickerKind && (
                    <select
                      // Always reset to the placeholder option — the picker is a
                      // one-shot insert, not a bound value. The actual value lives
                      // in the input so the user can edit it after.
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) setMapping((prev) => ({ ...prev, [f.key]: v }));
                        e.target.value = '';
                      }}
                      title="Pick a valid value"
                      style={{ ...inputStyle, width: 130, fontSize: 11, padding: '8px 6px' }}
                    >
                      <option value="">Pick value…</option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                {f.pickerKind === 'queue' || f.pickerKind === 'category' ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Picks insert the UUID — that's what your sender's JSON should contain.
                  </div>
                ) : null}
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || clearMut.isPending} style={btnPrimary}>
              {saveMut.isPending ? 'Saving…' : 'Save Mapping'}
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent-primary)', cursor: 'pointer', background: 'none', border: 'none', padding: 2, textDecoration: 'underline' }}
              aria-label="What does Save Mapping do?"
            >
              <Icon path={mdiHelpCircleOutline} size={0.9} />
            </button>
            <button
              onClick={() => clearMut.mutate()}
              disabled={saveMut.isPending || clearMut.isPending}
              style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
            >
              <Icon path={mdiBroom} size={0.7} />
              {clearMut.isPending ? 'Clearing…' : 'Clear Mapping'}
            </button>
          </div>

          {(() => {
            const url = webhookUrl ?? `${PUBLIC_BASE}/api/v1/external/inbound/<your-webhook-token>`;
            // Single-line JSON for the curl -d flag. Fall back to the raw textarea
            // contents if the user is mid-edit and the JSON doesn't parse yet.
            let bodyArg: string;
            try {
              bodyArg = JSON.stringify(JSON.parse(samplePayload));
            } catch {
              bodyArg = samplePayload.replace(/\s+/g, ' ').trim();
            }
            const curlCmd = `curl -X POST "${url}" \\\n  -H 'Content-Type: application/json' \\\n  -d '${bodyArg.replace(/'/g, "'\\''")}'`;
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ ...fieldLabel, marginBottom: 0 }}>Sample cURL</label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(curlCmd);
                      setCurlCopied(true);
                      setTimeout(() => setCurlCopied(false), 1500);
                    }}
                    style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon path={curlCopied ? mdiCheck : mdiContentCopy} size={0.6} />
                    {curlCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre style={{ margin: 0, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {curlCmd}
                </pre>
                {!webhookUrl && (
                  <p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                    Replace <code style={inlineCode}>&lt;your-webhook-token&gt;</code> with the token from the URL panel above (visible only right after creation or rotation).
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        <div>
          <label style={fieldLabel}>Sample Payload (JSON)</label>
          <textarea
            value={samplePayload}
            onChange={(e) => setSamplePayload(e.target.value)}
            style={{ ...inputStyle, minHeight: 220, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
          <button onClick={() => previewMut.mutate()} disabled={previewMut.isPending} style={{ ...btnSecondary, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiPlay} size={0.7} />
            {previewMut.isPending ? 'Rendering…' : 'Preview Mapping'}
          </button>
          {previewError && <div style={{ color: 'var(--accent-danger)', fontSize: 12, marginTop: 8 }}>{previewError}</div>}
          {previewResult !== null && (() => {
            const m = previewResult as Record<string, unknown>;
            const queueId = typeof m.queueId === 'string' ? m.queueId : null;
            const categoryId = typeof m.categoryId === 'string' ? m.categoryId : null;
            const queueName = queueId ? queues.find((q) => q.id === queueId)?.name ?? '?' : null;
            const categoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name ?? '?' : null;
            const previewJson = JSON.stringify(previewResult, null, 2);
            return (
              <>
                {(queueName || categoryName) && (
                  <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg-success-subtle)', color: 'var(--accent-success)', borderRadius: 6, fontSize: 12 }}>
                    Resolved: {queueName && <strong>Queue → {queueName}</strong>}{queueName && categoryName && ' · '}{categoryName && <strong>Category → {categoryName}</strong>}
                  </div>
                )}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ ...fieldLabel, marginBottom: 0 }}>Mapped Result (what the ticket will become)</label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(previewJson);
                      setPreviewCopied(true);
                      setTimeout(() => setPreviewCopied(false), 1500);
                    }}
                    style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon path={previewCopied ? mdiCheck : mdiContentCopy} size={0.6} />
                    {previewCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre style={{ margin: 0, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 6, fontSize: 11, maxHeight: 200, overflow: 'auto' }}>
                  {previewJson}
                </pre>
              </>
            );
          })()}
        </div>
      </div>

      {helpOpen && (
        <div
          onClick={() => setHelpOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '90%', maxWidth: 560, background: 'var(--bg-primary)', borderRadius: 12, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>About Save Mapping</h2>
              <button
                onClick={() => setHelpOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                <Icon path={mdiClose} size={0.9} />
              </button>
            </div>
            <p style={{ marginTop: 0, fontSize: 13, lineHeight: 1.55 }}>
              <strong>Save Mapping</strong> persists every non-empty field above to this webhook. From then on,
              every POST to this webhook URL is rendered through these template strings before a ticket is created.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              <strong>Templates</strong> like <code style={inlineCode}>{'{{json.title}}'}</code> or <code style={inlineCode}>{'{{json.alert.severity}}'}</code> pull
              values from the inbound JSON — every ticket gets whatever the sender put in its payload at that path.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              <strong>Plain text</strong> (e.g. just <code style={inlineCode}>HIGH</code> in the Priority field) becomes a literal —
              every ticket inherits exactly that string regardless of payload. Useful when one webhook should always
              produce, say, <code style={inlineCode}>CRITICAL</code> tickets.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              <strong>Empty</strong> fields fall back to the built-in defaults: <code style={inlineCode}>{'{{json.title}}'}</code>,
              <code style={inlineCode}>{'{{json.description}}'}</code>, <code style={inlineCode}>{'{{json.priority}}'}</code>,
              <code style={inlineCode}>{'{{json.type}}'}</code>, <code style={inlineCode}>{'{{json.requesterEmail}}'}</code> — so plain curl works
              without any configuration.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>
              The <strong>picker</strong> on each constrained field shows valid values so you can copy them into the JSON
              your sender posts (avoiding typos like <code style={inlineCode}>INNCIDENT</code>). Picking a value inserts it
              as a literal into the input — clear it again if you wanted a template.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setHelpOpen(false)} style={btnPrimary}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type PickerKind = 'priority' | 'type' | 'queue' | 'category';

interface MappingFieldDef {
  key: string;
  label: string;
  placeholder: string;
  // When set, the row shows a side dropdown of valid literal values for this
  // field — pure reference / typo-avoidance, not setting the value behind the
  // scenes. Picking a value overwrites the input with that literal so the user
  // can either save it as the literal or copy it into the system that will be
  // POSTing to the webhook.
  pickerKind?: PickerKind;
}

const MAPPING_FIELDS: MappingFieldDef[] = [
  { key: 'titleTemplate', label: 'Title', placeholder: '{{json.title}} (default)' },
  { key: 'descriptionTemplate', label: 'Description', placeholder: '{{json.description}} (default)' },
  { key: 'priorityTemplate', label: 'Priority', placeholder: '{{json.priority}} (default)', pickerKind: 'priority' },
  { key: 'typeTemplate', label: 'Type', placeholder: '{{json.type}} (default)', pickerKind: 'type' },
  { key: 'requesterEmailTemplate', label: 'Requester Email', placeholder: '{{json.requesterEmail}} (default)' },
  { key: 'queueIdTemplate', label: 'Queue ID — overrides default (advanced)', placeholder: '{{json.queueId}} or paste a UUID', pickerKind: 'queue' },
  { key: 'categoryIdTemplate', label: 'Category ID — overrides default (advanced)', placeholder: '{{json.categoryId}} or paste a UUID', pickerKind: 'category' },
];

function pickerOptions(
  kind: PickerKind,
  queues: OptionRow[],
  categories: OptionRow[],
): Array<{ label: string; value: string }> {
  switch (kind) {
    case 'priority':
      return PRIORITY_OPTIONS.map((p) => ({ label: p, value: p }));
    case 'type':
      return TYPE_OPTIONS.map((t) => ({ label: t.replace('_', ' '), value: t }));
    case 'queue':
      return queues.map((q) => ({ label: q.name, value: q.id }));
    case 'category':
      return categories.map((c) => ({ label: c.name, value: c.id }));
  }
}

function normalizeMapping(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of MAPPING_FIELDS) {
    const v = raw?.[f.key];
    if (typeof v === 'string') out[f.key] = v;
  }
  return out;
}

// ─── Deliveries table ───────────────────────────────────────────────────────

function DeliveriesTable({ deliveries }: { deliveries: DeliveryRow[] }) {
  const sorted = useMemo(() => [...deliveries].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()), [deliveries]);
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitle}>Recent Deliveries</h2>
      {sorted.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No deliveries yet. POST to the URL above to see one here.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-secondary)' }}>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Received</th>
              <th style={thStyle}>Source IP</th>
              <th style={thStyle}>Ticket</th>
              <th style={thStyle}>Body</th>
              <th style={thStyle}>Error</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                <td style={tdStyle}><DeliveryBadge status={d.status} /></td>
                <td style={tdStyle}>{new Date(d.receivedAt).toLocaleString()}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{d.sourceIp ?? '—'}</td>
                <td style={tdStyle}>
                  {d.createdTicketId ? (
                    <Link href={`/dashboard/tickets/${d.createdTicketId}`} style={{ color: 'var(--accent-primary)' }}>
                      View
                    </Link>
                  ) : '—'}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-muted)' }}>{d.requestBodySize} B</td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--accent-danger)' }}>{d.errorMessage ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DeliveryBadge({ status }: { status: string }) {
  const style: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 };
  if (status === 'PROCESSED') return <span style={{ ...style, background: 'var(--bg-success-subtle)', color: 'var(--accent-success)' }}>Processed</span>;
  if (status === 'PENDING') return <span style={{ ...style, background: 'var(--bg-info-subtle)', color: 'var(--accent-info)' }}>Pending</span>;
  if (status === 'DUPLICATE_IDEMPOTENT') return <span style={{ ...style, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>Duplicate</span>;
  return <span style={{ ...style, background: 'var(--bg-danger-subtle)', color: 'var(--accent-danger)' }}>{status}</span>;
}

const sectionStyle: React.CSSProperties = { marginTop: 24, padding: 20, background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border-secondary)' };
const sectionTitle: React.CSSProperties = { margin: '0 0 12px', fontSize: 16, fontWeight: 700 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '10px', fontSize: 13, color: 'var(--text-primary)' };
const fieldLabel: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const inlineCode: React.CSSProperties = { padding: '1px 4px', background: 'var(--bg-tertiary)', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 };
const btnPrimary: React.CSSProperties = { padding: '8px 14px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer' };
