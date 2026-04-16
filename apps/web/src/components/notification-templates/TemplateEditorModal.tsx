'use client';

import { useState } from 'react';
import { VariableInput, VariableTextarea, VariableRichEditor } from '@/components/variable-picker';
import type { VariableContextKey } from '@meridian/core/template';
import { ContextsPicker } from './ContextsPicker';
import type {
  NotificationTemplate,
  TemplateChannel,
  EmailContent,
  MessageContent,
  TeamsContent,
  ContextKey,
} from './types';

const CHANNELS: TemplateChannel[] = ['EMAIL', 'TELEGRAM', 'SLACK', 'TEAMS', 'DISCORD'];

const DEFAULT_CONTENT: Record<TemplateChannel, EmailContent | MessageContent | TeamsContent> = {
  EMAIL: { subject: '', htmlBody: '', textBody: '' },
  TELEGRAM: { message: '' },
  SLACK: { message: '' },
  TEAMS: { title: '', body: '' },
  DISCORD: { message: '' },
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-secondary)',
  borderRadius: 7,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

export function TemplateEditorModal({
  item,
  onClose,
  onSaved,
}: {
  item: NotificationTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = item !== null;
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [channel, setChannel] = useState<TemplateChannel>(item?.channel ?? 'EMAIL');
  const [contexts, setContexts] = useState<string[]>(item?.contexts ?? ['ticket', 'requester', 'tenant', 'now']);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [content, setContent] = useState<EmailContent | MessageContent | TeamsContent>(
    item?.content ?? DEFAULT_CONTENT.EMAIL,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChannelChange = (next: TemplateChannel) => {
    if (isEdit) return; // channel is immutable after create
    setChannel(next);
    setContent(DEFAULT_CONTENT[next]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const url = isEdit ? `/api/v1/notification-templates/${item!.id}` : '/api/v1/notification-templates';
      const method = isEdit ? 'PATCH' : 'POST';
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        content,
        contexts,
        isActive,
      };
      if (!isEdit) payload.channel = channel;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to save template');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
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
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 680,
          overflow: 'auto',
          maxHeight: '92vh',
        }}
      >
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {isEdit ? 'Edit Notification Template' : 'New Notification Template'}
          </h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Channel — create-time only */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Channel {isEdit && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(immutable)</span>}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CHANNELS.map((ch) => {
                const active = channel === ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleChannelChange(ch)}
                    disabled={isEdit}
                    data-testid={`channel-option-${ch}`}
                    style={{
                      padding: '6px 14px',
                      border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isEdit ? 'not-allowed' : 'pointer',
                      backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-primary)',
                      color: active ? '#fff' : 'var(--text-secondary)',
                      opacity: isEdit && !active ? 0.4 : 1,
                    }}
                  >
                    {ch.charAt(0) + ch.slice(1).toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="tpl-name" style={labelStyle}>
              Name *
            </label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
              data-testid="template-name"
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="tpl-desc" style={labelStyle}>
              Description
            </label>
            <input
              id="tpl-desc"
              type="text"
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal note about when to use this template"
              style={inputStyle}
            />
          </div>

          {/* Contexts */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Applies to
              <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)' }}>
                — filters the <code>/</code> variable menu and restricts which workflow events can use this template
              </span>
            </label>
            <ContextsPicker value={contexts} onChange={setContexts} />
          </div>

          {/* Channel-specific fields */}
          <ChannelFields channel={channel} content={content} onChange={setContent} contexts={contexts as ContextKey[]} />

          {/* isActive */}
          <div style={{ marginBottom: 20, marginTop: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                data-testid="template-active"
              />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Active — inactive templates are hidden from workflow pickers
              </span>
            </label>
          </div>

          {error && (
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
              data-testid="template-error"
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
                border: '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 14,
                cursor: 'pointer',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              data-testid="save-template"
              style={{
                padding: '8px 18px',
                backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Channel-specific field renderer ─────────────────────────────────────────

function ChannelFields({
  channel,
  content,
  onChange,
  contexts,
}: {
  channel: TemplateChannel;
  content: EmailContent | MessageContent | TeamsContent;
  onChange: (next: EmailContent | MessageContent | TeamsContent) => void;
  contexts: ContextKey[];
}) {
  // Only pass supported context keys to the variable picker.
  const pickerContexts: VariableContextKey[] = contexts.filter((c) =>
    ['ticket', 'requester', 'assignee', 'tenant', 'sla', 'change', 'comment', 'cert', 'now'].includes(c),
  ) as VariableContextKey[];

  if (channel === 'EMAIL') {
    const c = content as EmailContent;
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Subject *</label>
          <VariableInput
            value={c.subject}
            onChange={(v) => onChange({ ...c, subject: v })}
            context={pickerContexts}
            placeholder="e.g. [{{ticket.number}}] {{ticket.title}}"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>HTML Body *</label>
          <VariableRichEditor
            value={c.htmlBody}
            onChange={(v) => onChange({ ...c, htmlBody: v })}
            context={pickerContexts}
            placeholder="Type / to insert a variable"
            minHeight={200}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            Plain-Text Body
            <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)' }}>
              — optional fallback for non-HTML clients
            </span>
          </label>
          <VariableTextarea
            value={c.textBody ?? ''}
            onChange={(v) => onChange({ ...c, textBody: v })}
            context={pickerContexts}
            placeholder="Plain-text version (optional)"
            rows={4}
          />
        </div>
      </>
    );
  }

  if (channel === 'TEAMS') {
    const c = content as TeamsContent;
    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Title *</label>
          <VariableInput
            value={c.title}
            onChange={(v) => onChange({ ...c, title: v })}
            context={pickerContexts}
            placeholder="e.g. Ticket {{ticket.number}} assigned to you"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Body *</label>
          <VariableRichEditor
            value={c.body}
            onChange={(v) => onChange({ ...c, body: v })}
            context={pickerContexts}
            placeholder="Type / to insert a variable"
            minHeight={160}
          />
        </div>
      </>
    );
  }

  // TELEGRAM / SLACK / DISCORD
  const c = content as MessageContent;
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        Message *
        <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)' }}>
          — markdown supported
        </span>
      </label>
      <VariableTextarea
        value={c.message}
        onChange={(v) => onChange({ ...c, message: v })}
        context={pickerContexts}
        placeholder="Type / to insert a variable. Markdown like **bold** is supported."
        rows={6}
      />
    </div>
  );
}
