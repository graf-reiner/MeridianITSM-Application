'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiBellRing,
  mdiPlus,
  mdiPencil,
  mdiTrashCan,
  mdiEmail,
  mdiSend,
  mdiSlack,
  mdiMicrosoftTeams,
  mdiChatProcessing,
  mdiContentCopy,
} from '@mdi/js';
import { TemplateEditorModal } from '@/components/notification-templates/TemplateEditorModal';
import { ChannelBadge } from '@/components/notification-templates/ChannelBadge';
import type { NotificationTemplate, TemplateChannel } from '@/components/notification-templates/types';

const CHANNELS: TemplateChannel[] = ['EMAIL', 'TELEGRAM', 'SLACK', 'TEAMS', 'DISCORD'];

const CHANNEL_ICON: Record<TemplateChannel, string> = {
  EMAIL: mdiEmail,
  TELEGRAM: mdiSend,
  SLACK: mdiSlack,
  TEAMS: mdiMicrosoftTeams,
  DISCORD: mdiChatProcessing,
};

export default function NotificationTemplatesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<NotificationTemplate | null>(null);
  const [channelFilter, setChannelFilter] = useState<TemplateChannel | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<NotificationTemplate[]>({
    queryKey: ['settings-notification-templates'],
    queryFn: async () => {
      const res = await fetch('/api/v1/notification-templates', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load notification templates');
      return (await res.json()) as NotificationTemplate[];
    },
  });

  const items = useMemo(() => {
    let list = data ?? [];
    if (channelFilter !== 'ALL') list = list.filter((t) => t.channel === channelFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, channelFilter, search]);

  const handleDelete = async (item: NotificationTemplate) => {
    setDeleteError(null);
    if (!window.confirm(`Delete template "${item.name}"?`)) return;
    const res = await fetch(`/api/v1/notification-templates/${item.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.status === 204) {
      void qc.invalidateQueries({ queryKey: ['settings-notification-templates'] });
      return;
    }
    if (res.status === 409) {
      const body = (await res.json()) as { error?: string; workflows?: Array<{ id: string; name: string }> };
      const refs = body.workflows?.map((w) => w.name).join(', ') ?? 'one or more workflows';
      setDeleteError(`Cannot delete — still used by: ${refs}`);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setDeleteError(body.error ?? 'Failed to delete template');
  };

  const handleDuplicate = async (item: NotificationTemplate) => {
    setDeleteError(null);
    // Find a unique "Copy of X", "Copy of X (2)", ... suffix for the same channel
    const existing = new Set((data ?? []).filter((t) => t.channel === item.channel).map((t) => t.name));
    let candidate = `Copy of ${item.name}`;
    let i = 2;
    while (existing.has(candidate)) {
      candidate = `Copy of ${item.name} (${i})`;
      i += 1;
    }

    const res = await fetch('/api/v1/notification-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: candidate,
        description: item.description,
        channel: item.channel,
        content: item.content,
        contexts: item.contexts,
        isActive: item.isActive,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setDeleteError(body.error ?? 'Failed to duplicate template');
      return;
    }
    void qc.invalidateQueries({ queryKey: ['settings-notification-templates'] });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link
          href="/dashboard/settings"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiBellRing} size={1} color="#0ea5e9" />
          Notification Templates
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => {
              setEditItem(null);
              setShowModal(true);
            }}
            data-testid="new-template-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Template
          </button>
        </div>
      </div>

      <p
        style={{
          margin: '0 0 18px',
          color: 'var(--text-muted)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Reusable message templates for workflows. Create once, use across any workflow action node.
        Use <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: 4 }}>/</code>{' '}
        in any body field to insert variables like {'{{ticket.title}}'}.
      </p>

      {/* Channel filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['ALL', ...CHANNELS] as const).map((ch) => {
          const active = channelFilter === ch;
          return (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch as TemplateChannel | 'ALL')}
              data-testid={`channel-tab-${ch}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-primary)',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {ch !== 'ALL' && <Icon path={CHANNEL_ICON[ch as TemplateChannel]} size={0.65} color="currentColor" />}
              {ch === 'ALL' ? 'All' : ch.charAt(0) + ch.slice(1).toLowerCase()}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        placeholder="Search templates..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="template-search"
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          fontSize: 14,
          marginBottom: 14,
          outline: 'none',
          backgroundColor: 'var(--bg-primary)',
          boxSizing: 'border-box',
        }}
      />

      {deleteError && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--badge-red-bg-subtle)',
            border: '1px solid #fecaca',
            borderRadius: 7,
            marginBottom: 14,
            color: '#dc2626',
            fontSize: 13,
          }}
        >
          {deleteError}
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Name
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Channel
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Contexts
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Status
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Updated
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: '1px solid var(--bg-tertiary)' }}
                  data-testid={`template-row-${item.id}`}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                    <div>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.description}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <ChannelBadge channel={item.channel} />
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {item.contexts.length > 0 ? item.contexts.join(', ') : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: item.isActive ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)',
                        color: item.isActive ? 'var(--badge-green-text, #15803d)' : 'var(--text-muted)',
                      }}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          setEditItem(item);
                          setShowModal(true);
                        }}
                        data-testid={`edit-template-${item.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          border: '1px solid var(--border-secondary)',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" /> Edit
                      </button>
                      <button
                        onClick={() => void handleDuplicate(item)}
                        data-testid={`duplicate-template-${item.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          border: '1px solid var(--border-secondary)',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <Icon path={mdiContentCopy} size={0.65} color="currentColor" /> Duplicate
                      </button>
                      <button
                        onClick={() => void handleDelete(item)}
                        data-testid={`delete-template-${item.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor: 'var(--bg-primary)',
                          color: '#dc2626',
                        }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                    {data && data.length > 0
                      ? 'No templates match the current filter'
                      : 'No templates yet — click "New Template" to create your first one'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <TemplateEditorModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-notification-templates'] })}
        />
      )}
    </div>
  );
}
