'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiWebhook,
  mdiPencil,
  mdiChevronDown,
  mdiChevronUp,
  mdiRefresh,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookDelivery {
  id: string;
  status: 'success' | 'failed' | 'pending';
  httpStatus: number | null;
  responseTimeMs: number | null;
  retryCount: number;
  createdAt: string;
  requestPayload?: unknown;
  responseBody?: string;
}

interface WebhookDetail {
  id: string;
  name: string;
  url: string;
  events: string[];
  isEnabled: boolean;
  isAutoDisabled: boolean;
  deliveries: WebhookDelivery[];
  deliveryCount: number;
}

// ─── Delivery Status Badge ─────────────────────────────────────────────────────

function DeliveryStatusBadge({ status }: { status: WebhookDelivery['status'] }) {
  const styles: Record<WebhookDelivery['status'], { bg: string; text: string; label: string }> = {
    success: { bg: 'var(--badge-green-bg)', text: '#065f46', label: 'Success' },
    failed: { bg: 'var(--badge-red-bg)', text: '#991b1b', label: 'Failed' },
    pending: { bg: 'var(--badge-blue-bg)', text: '#1e40af', label: 'Pending' },
  };
  const s = styles[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: s.bg,
        color: s.text,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Delivery Row ─────────────────────────────────────────────────────────────

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const [expanded, setExpanded] = useState(false);

  const formatTime = (date: string) => {
    return new Date(date).toISOString();
  };

  return (
    <div style={{ borderBottom: '1px solid #f3f4f6' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          flexWrap: 'wrap',
        }}
      >
        <DeliveryStatusBadge status={delivery.status} />

        {delivery.httpStatus !== null && (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: delivery.httpStatus >= 200 && delivery.httpStatus < 300 ? '#065f46' : '#991b1b',
              fontWeight: 600,
            }}
          >
            HTTP {delivery.httpStatus}
          </span>
        )}

        {delivery.responseTimeMs !== null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{delivery.responseTimeMs}ms</span>
        )}

        {delivery.retryCount > 0 && (
          <span
            style={{
              padding: '1px 6px',
              backgroundColor: 'var(--badge-yellow-bg)',
              color: '#92400e',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {delivery.retryCount} {delivery.retryCount === 1 ? 'retry' : 'retries'}
          </span>
        )}

        <span style={{ fontSize: 12, color: 'var(--text-placeholder)', marginLeft: 'auto', fontFamily: 'monospace' }}>
          {formatTime(delivery.createdAt)}
        </span>

        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            border: '1px solid var(--border-primary)',
            borderRadius: 6,
            backgroundColor: 'var(--bg-primary)',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          Payload
          <Icon path={expanded ? mdiChevronUp : mdiChevronDown} size={0.65} color="currentColor" />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 12px' }}>
          {delivery.requestPayload !== undefined && delivery.requestPayload !== null && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Request Payload
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 6,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: 'var(--text-secondary)',
                }}
              >
                {JSON.stringify(delivery.requestPayload, null, 2)}
              </pre>
            </div>
          )}
          {delivery.responseBody && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Response Body
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 6,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: 'var(--text-secondary)',
                }}
              >
                {delivery.responseBody}
              </pre>
            </div>
          )}
          {!delivery.requestPayload && !delivery.responseBody && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>No payload data available.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Webhook Detail Page ──────────────────────────────────────────────────────

export default function WebhookDetailPage() {
  const params = useParams<{ id: string }>();
  const webhookId = params.id;
  const qc = useQueryClient();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [testingId, setTestingId] = useState(false);

  const { data: webhook, isLoading } = useQuery<WebhookDetail>({
    queryKey: ['webhook-detail', webhookId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/webhooks/${webhookId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load webhook');
      return res.json() as Promise<WebhookDetail>;
    },
  });

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const handleTest = useCallback(async () => {
    setTestingId(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${webhookId}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        showToast('Test delivery queued.', 'success');
        void qc.invalidateQueries({ queryKey: ['webhook-detail', webhookId] });
      } else {
        showToast('Test failed — check endpoint URL.', 'error');
      }
    } catch {
      showToast('Test failed — check endpoint URL.', 'error');
    } finally {
      setTestingId(false);
    }
  }, [webhookId, qc, showToast]);

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading webhook...
      </div>
    );
  }

  if (!webhook) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Webhook not found.
      </div>
    );
  }

  const deliveries = webhook.deliveries ?? [];
  const statusBadge = webhook.isAutoDisabled
    ? { label: 'Auto-disabled', bg: 'var(--badge-red-bg)', text: '#991b1b' }
    : webhook.isEnabled
      ? { label: 'Enabled', bg: 'var(--badge-green-bg)', text: '#065f46' }
      : { label: 'Disabled', bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 100,
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            backgroundColor: toastType === 'success' ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)',
            color: toastType === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${toastType === 'success' ? '#6ee7b7' : '#fca5a5'}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/dashboard/settings/webhooks"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', marginTop: 4 }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon path={mdiWebhook} size={1} color="#4f46e5" />
              {webhook.name || 'Unnamed Webhook'}
            </h1>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: statusBadge.bg,
                color: statusBadge.text,
              }}
            >
              {statusBadge.label}
            </span>
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
          >
            {webhook.url}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void handleTest()}
            disabled={testingId}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              cursor: testingId ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              opacity: testingId ? 0.6 : 1,
            }}
          >
            <Icon path={mdiRefresh} size={0.75} color="currentColor" />
            {testingId ? 'Sending...' : 'Send Test'}
          </button>
          <Link
            href={`/dashboard/settings/webhooks/${webhookId}/edit`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <Icon path={mdiPencil} size={0.75} color="currentColor" />
            Edit
          </Link>
        </div>
      </div>

      {/* Events */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 24,
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Subscribed Events
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {webhook.events.length > 0 ? (
            webhook.events.map((event) => (
              <span
                key={event}
                style={{
                  padding: '2px 8px',
                  backgroundColor: 'var(--badge-indigo-bg)',
                  color: 'var(--accent-primary)',
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                {event}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>No events configured.</span>
          )}
        </div>
      </div>

      {/* Delivery History */}
      <div style={{ marginBottom: 8 }}>
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          Delivery History
        </h2>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {deliveries.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-placeholder)' }}>
              No deliveries yet. Trigger a test delivery to verify your endpoint.
            </p>
          </div>
        ) : (
          <>
            {deliveries.map((delivery) => (
              <DeliveryRow key={delivery.id} delivery={delivery} />
            ))}
            {webhook.deliveryCount > deliveries.length && (
              <div
                style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  borderTop: '1px solid #f3f4f6',
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>
                  Showing last {deliveries.length} of {webhook.deliveryCount} deliveries.
                  Deliveries older than 30 days are automatically removed.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
