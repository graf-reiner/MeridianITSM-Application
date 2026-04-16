'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { TemplateChannel, NotificationTemplate } from '@/components/notification-templates/types';

export function TemplatePickerField({
  channel,
  value,
  onChange,
}: {
  channel: TemplateChannel;
  value: string;
  onChange: (next: string) => void;
}) {
  const { data, isLoading } = useQuery<NotificationTemplate[]>({
    queryKey: ['workflow-template-picker', channel],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/notification-templates?channel=${channel}&isActive=true`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Failed to load templates');
      return (await res.json()) as NotificationTemplate[];
    },
  });

  const selected = data?.find((t) => t.id === value);

  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="template-picker-select"
        style={{
          width: '100%',
          padding: '7px 10px',
          border: '1px solid var(--border-secondary)',
          borderRadius: 6,
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      >
        <option value="">— None (use inline fields) —</option>
        {isLoading && <option disabled>Loading templates…</option>}
        {data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.description ? ` — ${t.description}` : ''}
          </option>
        ))}
      </select>

      {selected && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
            borderLeft: '3px solid var(--accent-primary)',
          }}
          data-testid="template-preview"
        >
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Preview
          </div>
          <TemplatePreview template={selected} />
          <Link
            href={`/dashboard/settings/notification-templates`}
            target="_blank"
            style={{
              display: 'inline-block',
              marginTop: 6,
              color: 'var(--accent-primary)',
              fontSize: 11,
              textDecoration: 'none',
            }}
          >
            Edit template →
          </Link>
        </div>
      )}
    </div>
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function TemplatePreview({ template }: { template: NotificationTemplate }) {
  const content = template.content as unknown as Record<string, unknown>;
  const snippetStyle: React.CSSProperties = {
    maxHeight: 90,
    overflow: 'hidden',
    fontSize: 11,
    opacity: 0.8,
    whiteSpace: 'pre-wrap',
  };
  switch (template.channel) {
    case 'EMAIL':
      return (
        <>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontWeight: 600 }}>Subject: </span>
            <code style={{ fontSize: 11 }}>{String(content.subject ?? '')}</code>
          </div>
          <div style={snippetStyle}>{stripHtml(String(content.htmlBody ?? '')).slice(0, 240)}</div>
        </>
      );
    case 'TEAMS':
      return (
        <>
          <div style={{ marginBottom: 3 }}>
            <span style={{ fontWeight: 600 }}>Title: </span>
            <code style={{ fontSize: 11 }}>{String(content.title ?? '')}</code>
          </div>
          <div style={snippetStyle}>{stripHtml(String(content.body ?? '')).slice(0, 200)}</div>
        </>
      );
    default:
      return (
        <div style={snippetStyle}>
          {String(content.message ?? '').slice(0, 240)}
          {String(content.message ?? '').length > 240 ? '…' : ''}
        </div>
      );
  }
}
