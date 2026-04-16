'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TemplateChannel } from '@/components/notification-templates/types';

/**
 * Small "Save as Template" helper for workflow action nodes. Promotes the
 * current inline field values to a reusable NotificationTemplate and then
 * selects that template on the node (via `onTemplateCreated`).
 *
 * Hidden when a template is already selected — there's nothing to save.
 */
export function SaveAsTemplateButton({
  channel,
  content,
  onTemplateCreated,
  disabled,
}: {
  channel: TemplateChannel;
  /** Channel-specific inline content captured from node config */
  content: Record<string, unknown>;
  /** Called with the new template id after a successful save */
  onTemplateCreated: (templateId: string) => void;
  /** When true, hide the button (e.g. when a template is already selected) */
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabled) return null;

  const hasContent = Object.values(content).some((v) => typeof v === 'string' && v.trim().length > 0);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/notification-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          channel,
          content,
          // Infer contexts from typical defaults — user can refine later via Edit
          contexts: ['ticket', 'requester', 'assignee', 'tenant', 'now'],
          isActive: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to save template');
      }
      const created = (await res.json()) as { id: string };
      onTemplateCreated(created.id);
      void qc.invalidateQueries({ queryKey: ['workflow-template-picker', channel] });
      setOpen(false);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasContent}
        data-testid="save-as-template-button"
        title={hasContent ? 'Promote these inline fields to a reusable template' : 'Fill the fields first'}
        style={{
          marginTop: 8,
          padding: '4px 10px',
          border: '1px dashed var(--border-secondary)',
          borderRadius: 6,
          fontSize: 11,
          cursor: hasContent ? 'pointer' : 'not-allowed',
          backgroundColor: 'transparent',
          color: hasContent ? 'var(--accent-primary)' : 'var(--text-placeholder)',
        }}
      >
        + Save as Template
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 60,
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
              maxWidth: 440,
              padding: 22,
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Save as Template</h3>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              Save these {channel.toLowerCase()} fields as a reusable template.
            </p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              data-testid="save-as-template-name"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 13,
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 13,
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            {error && (
              <div
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'var(--badge-red-bg-subtle)',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  color: '#dc2626',
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: '7px 14px',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 7,
                  fontSize: 13,
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || !name.trim()}
                data-testid="save-as-template-confirm"
                style={{
                  padding: '7px 16px',
                  backgroundColor: isSaving || !name.trim() ? '#a5b4fc' : 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isSaving || !name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isSaving ? 'Saving…' : 'Save & Select'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
