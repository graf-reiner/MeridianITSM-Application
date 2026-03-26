'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiWebhook,
  mdiPlus,
  mdiPencil,
  mdiClose,
  mdiAlertCircle,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.resolved',
  'ticket.closed',
  'ticket.assigned',
  'change.created',
  'change.approved',
  'change.rejected',
  'change.implemented',
  'asset.created',
  'asset.updated',
  'sla.warning',
  'sla.breach',
  'agent.enrolled',
  'agent.heartbeat_missed',
] as const;
type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  isEnabled: boolean;
  isAutoDisabled: boolean;
  deliveryCount: number;
  headers?: Record<string, string>;
}

interface WebhookListResponse {
  webhooks: Webhook[];
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}

// ─── Webhook Form Modal ────────────────────────────────────────────────────────

function WebhookFormModal({
  webhook,
  onClose,
  onSaved,
}: {
  webhook: Webhook | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(webhook?.name ?? '');
  const [url, setUrl] = useState(webhook?.url ?? '');
  const [events, setEvents] = useState<Set<WebhookEvent>>(
    new Set(webhook?.events ?? []),
  );
  const [headerPairs, setHeaderPairs] = useState<{ key: string; value: string }[]>(
    webhook?.headers
      ? Object.entries(webhook.headers).map(([key, value]) => ({ key, value }))
      : [{ key: '', value: '' }],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (event: WebhookEvent) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      for (const { key, value } of headerPairs) {
        if (key.trim() && value.trim()) headers[key.trim()] = value.trim();
      }

      const body = {
        name,
        url,
        events: Array.from(events),
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      };

      const res = await fetch(
        webhook ? `/api/v1/webhooks/${webhook.id}` : '/api/v1/webhooks',
        {
          method: webhook ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save webhook');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save webhook');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 560,
          overflow: 'auto',
          maxHeight: '90vh',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
            {webhook ? 'Edit Webhook' : 'Add Webhook'}
          </h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: 4,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Ticket notifications"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="endpointUrl" style={labelStyle}>Endpoint URL *</label>
            <input
              id="endpointUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://your-server.example.com/webhook"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Events</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: 7,
                padding: 10,
              }}
            >
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#374151',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={events.has(event)}
                    onChange={() => toggleEvent(event)}
                    style={{ width: 13, height: 13 }}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{event}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Custom Headers (optional)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {headerPairs.map((pair, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={pair.key}
                    onChange={(e) => {
                      const next = [...headerPairs];
                      next[idx] = { ...next[idx], key: e.target.value };
                      setHeaderPairs(next);
                    }}
                    placeholder="Header name"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="text"
                    value={pair.value}
                    onChange={(e) => {
                      const next = [...headerPairs];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setHeaderPairs(next);
                    }}
                    placeholder="Value"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setHeaderPairs((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 7,
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      color: '#6b7280',
                    }}
                  >
                    <Icon path={mdiClose} size={0.65} color="currentColor" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setHeaderPairs((prev) => [...prev, { key: '', value: '' }])}
                style={{
                  alignSelf: 'flex-start',
                  padding: '4px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  backgroundColor: '#fff',
                  color: '#374151',
                }}
              >
                + Add Header
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 7,
                marginBottom: 14,
                color: '#dc2626',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: 7,
                fontSize: 14,
                cursor: 'pointer',
                backgroundColor: '#fff',
                color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 18px',
                backgroundColor: isSubmitting ? '#a5b4fc' : '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Saving...' : webhook ? 'Save Changes' : 'Add Webhook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Webhooks Page ─────────────────────────────────────────────────────────────

export default function WebhooksSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery<Webhook[]>({
    queryKey: ['settings-webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/v1/webhooks', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load webhooks');
      const json = await res.json();
      const webhooks = Array.isArray(json) ? json : json.webhooks ?? [];
      // Normalize: API uses isActive, frontend uses isEnabled
      return webhooks.map((w: any) => ({
        ...w,
        isEnabled: w.isEnabled ?? w.isActive ?? true,
        isAutoDisabled: w.isAutoDisabled ?? (w.consecutiveFailures >= 50),
      }));
    },
  });

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const handleTest = useCallback(
    async (id: string) => {
      setTestingId(id);
      try {
        const res = await fetch(`/api/v1/webhooks/${id}/test`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          addToast('Test delivery queued.', 'success');
        } else {
          addToast('Test failed — check endpoint URL.', 'error');
        }
      } catch {
        addToast('Test failed — check endpoint URL.', 'error');
      } finally {
        setTestingId(null);
      }
    },
    [addToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(true);
      try {
        await fetch(`/api/v1/webhooks/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        void qc.invalidateQueries({ queryKey: ['settings-webhooks'] });
      } finally {
        setDeleting(false);
        setConfirmDeleteId(null);
      }
    },
    [qc],
  );

  const handleToggleEnabled = useCallback(
    async (webhook: Webhook) => {
      await fetch(`/api/v1/webhooks/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !webhook.isEnabled }),
      });
      void qc.invalidateQueries({ queryKey: ['settings-webhooks'] });
    },
    [qc],
  );

  const webhooks = data ?? [];

  const getStatusBadge = (webhook: Webhook) => {
    if (webhook.isAutoDisabled) {
      return { label: 'Auto-disabled', bg: '#fee2e2', text: '#991b1b' };
    }
    if (webhook.isEnabled) {
      return { label: 'Enabled', bg: '#d1fae5', text: '#065f46' };
    }
    return { label: 'Disabled', bg: '#f3f4f6', text: '#6b7280' };
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Toasts */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: toast.type === 'success' ? '#d1fae5' : '#fee2e2',
                color: toast.type === 'success' ? '#065f46' : '#991b1b',
                border: `1px solid ${toast.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/dashboard/settings"
          style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: '#111827',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiWebhook} size={1} color="#4f46e5" />
          Webhooks
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditWebhook(null); setShowModal(true); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Webhook
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Receive real-time event notifications when things happen in MeridianITSM.
      </p>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Loading webhooks...
        </div>
      ) : webhooks.length === 0 ? (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Icon path={mdiWebhook} size={2.5} color="#d1d5db" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#374151' }}>
            No webhooks configured
          </h3>
          <p
            style={{
              margin: '0 0 20px',
              fontSize: 14,
              color: '#6b7280',
              maxWidth: 400,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Add a webhook URL to receive signed event payloads for tickets, changes, and other
            platform events.
          </p>
          <button
            onClick={() => { setEditWebhook(null); setShowModal(true); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Webhook
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {webhooks.map((webhook) => {
            const status = getStatusBadge(webhook);
            const isConfirmingDelete = confirmDeleteId === webhook.id;
            const isTesting = testingId === webhook.id;

            return (
              <div
                key={webhook.id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: '16px',
                  overflow: 'hidden',
                }}
              >
                {/* Auto-disabled warning */}
                {webhook.isAutoDisabled && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 12px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 7,
                      marginBottom: 12,
                      fontSize: 13,
                      color: '#dc2626',
                    }}
                  >
                    <Icon path={mdiAlertCircle} size={0.8} color="currentColor" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      This webhook was automatically disabled after 50 consecutive failures. Fix
                      the endpoint, then re-enable it.
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Left: info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Link
                        href={`/dashboard/settings/webhooks/${webhook.id}`}
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: '#4f46e5',
                          textDecoration: 'none',
                        }}
                      >
                        {webhook.name || 'Unnamed Webhook'}
                      </Link>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                          backgroundColor: status.bg,
                          color: status.text,
                        }}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: '0 0 6px',
                        fontSize: 13,
                        color: '#6b7280',
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                      }}
                    >
                      {webhook.url.length > 60 ? webhook.url.slice(0, 60) + '...' : webhook.url}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '1px 7px',
                          backgroundColor: '#e0e7ff',
                          color: '#4f46e5',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>
                        {webhook.deliveryCount} deliveries
                      </span>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {isConfirmingDelete ? (
                      <>
                        <span style={{ fontSize: 12, color: '#374151' }}>
                          Delete webhook &quot;{webhook.name}&quot;? Delivery history will also be
                          removed.
                        </span>
                        <button
                          onClick={() => void handleDelete(webhook.id)}
                          disabled={deleting}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: deleting ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {deleting ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            background: 'none',
                            color: '#6b7280',
                            fontSize: 12,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => void handleTest(webhook.id)}
                          disabled={isTesting}
                          style={{
                            padding: '5px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: isTesting ? 'not-allowed' : 'pointer',
                            backgroundColor: '#fff',
                            color: '#374151',
                            opacity: isTesting ? 0.6 : 1,
                          }}
                        >
                          {isTesting ? 'Sending...' : 'Send Test'}
                        </button>
                        <button
                          onClick={() => void handleToggleEnabled(webhook)}
                          style={{
                            padding: '5px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                            color: webhook.isEnabled ? '#dc2626' : '#059669',
                          }}
                        >
                          {webhook.isEnabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => { setEditWebhook(webhook); setShowModal(true); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 10px',
                            border: '1px solid #d1d5db',
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                            color: '#374151',
                          }}
                        >
                          <Icon path={mdiPencil} size={0.65} color="currentColor" />
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(webhook.id)}
                          style={{
                            padding: '5px 10px',
                            border: '1px solid #fecaca',
                            borderRadius: 6,
                            fontSize: 13,
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                            color: '#dc2626',
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <WebhookFormModal
          webhook={editWebhook}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-webhooks'] })}
        />
      )}
    </div>
  );
}
