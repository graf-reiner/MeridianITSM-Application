'use client';

import { AVAILABLE_CONTEXTS, type ContextKey } from './types';

const CONTEXT_LABELS: Record<ContextKey, string> = {
  ticket: 'Ticket',
  requester: 'Requester',
  assignee: 'Assignee',
  tenant: 'Tenant',
  sla: 'SLA',
  change: 'Change',
  comment: 'Comment',
  cert: 'Certificate',
  now: 'Current time',
};

export function ContextsPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (ctx: ContextKey) => {
    if (value.includes(ctx)) {
      onChange(value.filter((v) => v !== ctx));
    } else {
      onChange([...value, ctx]);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {AVAILABLE_CONTEXTS.map((ctx) => {
        const active = value.includes(ctx);
        return (
          <button
            key={ctx}
            type="button"
            onClick={() => toggle(ctx)}
            data-testid={`context-toggle-${ctx}`}
            style={{
              padding: '4px 10px',
              border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-primary)',
              color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'all 120ms',
            }}
          >
            {CONTEXT_LABELS[ctx]}
          </button>
        );
      })}
    </div>
  );
}
