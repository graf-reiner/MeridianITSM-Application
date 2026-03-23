'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiBellRing,
  mdiPlus,
  mdiPencil,
  mdiDelete,
  mdiClose,
  mdiSlack,
  mdiMicrosoftTeams,
  mdiEmailOutline,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

const ALERT_EVENTS = [
  'sla.warning',
  'sla.breach',
  'ticket.created',
  'ticket.resolved',
  'agent.heartbeat_missed',
  'system.health_degraded',
  'change.requires_approval',
] as const;
type AlertEvent = (typeof ALERT_EVENTS)[number];

type ChannelType = 'email' | 'slack' | 'teams';

interface AlertChannel {
  id: string;
  name: string;
  type: ChannelType;
  events: AlertEvent[];
  isEnabled: boolean;
  config: {
    recipients?: string;
    webhookUrl?: string;
    connectorUrl?: string;
  };
}

interface AlertChannelListResponse {
  channels: AlertChannel[];
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}

// ─── Channel Type Config ───────────────────────────────────────────────────────

const CHANNEL_TYPES: Record<ChannelType, { label: string; icon: string; color: string }> = {
  email: { label: 'Email', icon: mdiEmailOutline, color: '#0891b2' },
  slack: { label: 'Slack', icon: mdiSlack, color: '#4a154b' },
  teams: { label: 'Microsoft Teams', icon: mdiMicrosoftTeams, color: '#5059c9' },
};

// ─── Channel Form Modal ────────────────────────────────────────────────────────

function ChannelFormModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: AlertChannel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(channel?.name ?? '');
  const [type, setType] = useState<ChannelType>(channel?.type ?? 'email');
  const [events, setEvents] = useState<Set<AlertEvent>>(new Set(channel?.events ?? []));
  const [recipients, setRecipients] = useState(channel?.config.recipients ?? '');
  const [webhookUrl, setWebhookUrl] = useState(channel?.config.webhookUrl ?? '');
  const [connectorUrl, setConnectorUrl] = useState(channel?.config.connectorUrl ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const toggleEvent = (event: AlertEvent) => {
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

  const validateUrl = () => {
    if (type === 'slack' && webhookUrl && !webhookUrl.startsWith('https://hooks.slack.com/')) {
      setUrlError('Slack webhook URL must start with https://hooks.slack.com/');
      return false;
    }
    if (type === 'teams' && connectorUrl && !connectorUrl.startsWith('https://')) {
      setUrlError('Teams connector URL must start with https://');
      return false;
    }
    setUrlError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateUrl()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const config: Record<string, string> = {};
      if (type === 'email') config.recipients = recipients;
      if (type === 'slack') config.webhookUrl = webhookUrl;
      if (type === 'teams') config.connectorUrl = connectorUrl;

      const body = {
        name,
        type,
        events: Array.from(events),
        config,
      };

      const res = await fetch(
        channel ? `/api/v1/settings/alerts/${channel.id}` : '/api/v1/settings/alerts',
        {
          method: channel ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save channel');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save channel');
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
          maxWidth: 520,
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
            {channel ? 'Edit Channel' : 'Add Channel'}
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
          {/* Channel Type Picker */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Channel Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.entries(CHANNEL_TYPES) as [ChannelType, typeof CHANNEL_TYPES[ChannelType]][]).map(
                ([ct, cfg]) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => { setType(ct); setUrlError(null); }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '10px 8px',
                      border: `2px solid ${type === ct ? cfg.color : '#e5e7eb'}`,
                      borderRadius: 8,
                      backgroundColor: type === ct ? cfg.color + '0f' : '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: type === ct ? 600 : 400,
                      color: type === ct ? cfg.color : '#374151',
                    }}
                  >
                    <Icon path={cfg.icon} size={1} color={type === ct ? cfg.color : '#9ca3af'} />
                    {cfg.label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={`e.g., ${CHANNEL_TYPES[type].label} Alerts`}
              style={inputStyle}
            />
          </div>

          {/* Dynamic config fields */}
          {type === 'email' && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Recipients (comma-separated emails) *</label>
              <input
                type="text"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                required
                placeholder="ops@company.com, admin@company.com"
                style={inputStyle}
              />
            </div>
          )}

          {type === 'slack' && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Slack Webhook URL *</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => { setWebhookUrl(e.target.value); setUrlError(null); }}
                onBlur={validateUrl}
                required
                placeholder="https://hooks.slack.com/services/..."
                style={{
                  ...inputStyle,
                  borderColor: urlError ? '#fca5a5' : '#d1d5db',
                }}
              />
              {urlError && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{urlError}</p>
              )}
            </div>
          )}

          {type === 'teams' && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Teams Connector URL *</label>
              <input
                type="url"
                value={connectorUrl}
                onChange={(e) => { setConnectorUrl(e.target.value); setUrlError(null); }}
                onBlur={validateUrl}
                required
                placeholder="https://outlook.office.com/webhook/..."
                style={{
                  ...inputStyle,
                  borderColor: urlError ? '#fca5a5' : '#d1d5db',
                }}
              />
              {urlError && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{urlError}</p>
              )}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Events (alert on these)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ALERT_EVENTS.map((event) => (
                <label
                  key={event}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                    color: '#374151',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={events.has(event)}
                    onChange={() => toggleEvent(event)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{event}</span>
                </label>
              ))}
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
              {isSubmitting ? 'Saving...' : channel ? 'Save Changes' : 'Add Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Alert Channels Page ───────────────────────────────────────────────────────

export default function AlertChannelsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editChannel, setEditChannel] = useState<AlertChannel | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const { data, isLoading } = useQuery<AlertChannelListResponse>({
    queryKey: ['settings-alert-channels'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/alerts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load alert channels');
      return res.json() as Promise<AlertChannelListResponse>;
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
        const res = await fetch(`/api/v1/settings/alerts/${id}/test`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          addToast('Test alert sent.', 'success');
        } else {
          addToast('Test failed — check channel configuration.', 'error');
        }
      } catch {
        addToast('Test failed — check channel configuration.', 'error');
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
        await fetch(`/api/v1/settings/alerts/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        void qc.invalidateQueries({ queryKey: ['settings-alert-channels'] });
      } finally {
        setDeleting(false);
        setConfirmDeleteId(null);
      }
    },
    [qc],
  );

  const channels = data?.channels ?? [];

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
          <Icon path={mdiBellRing} size={1} color="#4f46e5" />
          Alert Channels
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditChannel(null); setShowModal(true); }}
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
            Add Channel
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Send alerts to Slack, Teams, or email when critical events occur.
      </p>

      {/* Channel Card Grid */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Loading alert channels...
        </div>
      ) : channels.length === 0 ? (
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
            <Icon path={mdiBellRing} size={2.5} color="#d1d5db" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#374151' }}>
            No alert channels
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
            Connect Slack or Microsoft Teams to receive alerts for SLA breaches, system events, and
            ticket assignments.
          </p>
          <button
            onClick={() => { setEditChannel(null); setShowModal(true); }}
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
            Add Channel
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {channels.map((channel) => {
            const typeCfg = CHANNEL_TYPES[channel.type];
            const isConfirmingDelete = confirmDeleteId === channel.id;
            const isTesting = testingId === channel.id;

            return (
              <div
                key={channel.id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      backgroundColor: typeCfg.color + '1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon path={typeCfg.icon} size={1.1} color={typeCfg.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 600,
                          color: '#111827',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {channel.name}
                      </h3>
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: channel.isEnabled ? '#d1fae5' : '#f3f4f6',
                          color: channel.isEnabled ? '#065f46' : '#6b7280',
                        }}
                      >
                        {channel.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                      {typeCfg.label} · {channel.events.length} event
                      {channel.events.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Delete confirmation inline */}
                {isConfirmingDelete ? (
                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                    }}
                  >
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>
                      Remove {channel.name}? Alerts will no longer be sent to this channel.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => void handleDelete(channel.id)}
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
                        }}
                      >
                        {deleting ? 'Removing...' : 'Confirm Remove'}
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
                    </div>
                  </div>
                ) : (
                  /* Card actions */
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void handleTest(channel.id)}
                      disabled={isTesting}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: isTesting ? 'not-allowed' : 'pointer',
                        backgroundColor: '#fff',
                        color: '#374151',
                        opacity: isTesting ? 0.6 : 1,
                      }}
                    >
                      {isTesting ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => { setEditChannel(channel); setShowModal(true); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
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
                      onClick={() => setConfirmDeleteId(channel.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 10px',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: 'pointer',
                        backgroundColor: '#fff',
                        color: '#dc2626',
                      }}
                    >
                      <Icon path={mdiDelete} size={0.65} color="currentColor" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ChannelFormModal
          channel={editChannel}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-alert-channels'] })}
        />
      )}
    </div>
  );
}
