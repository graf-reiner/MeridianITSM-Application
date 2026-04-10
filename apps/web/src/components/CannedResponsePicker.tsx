'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiLightningBolt, mdiMagnify } from '@mdi/js';

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  visibility: string;
  createdBy: { id: string; firstName: string; lastName: string };
  group: { id: string; name: string } | null;
}

interface CannedResponsePickerProps {
  onSelect: (content: string) => void;
  /**
   * When provided, the picker asks the API to render the canned response
   * with ticket context before calling `onSelect`. Variables like
   * `{{ticket.number}}` and `{{requester.firstName}}` get substituted
   * server-side so the comment box receives ready-to-post text.
   */
  ticketId?: string;
}

/** Strip HTML tags for plain-text preview (no dangerouslySetInnerHTML needed). */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export default function CannedResponsePicker({ onSelect, ticketId }: CannedResponsePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: responses = [] } = useQuery<CannedResponse[]>({
    queryKey: ['canned-responses', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/v1/canned-responses?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json() as Promise<CannedResponse[]>;
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Group by category
  const grouped = responses.reduce<Record<string, CannedResponse[]>>((acc, r) => {
    const cat = r.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Insert canned response"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '7px 10px',
          border: '1px solid var(--border-secondary)',
          borderRadius: 6,
          fontSize: 13,
          cursor: 'pointer',
          backgroundColor: open ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
          color: 'var(--text-secondary)',
        }}
      >
        <Icon path={mdiLightningBolt} size={0.65} color="currentColor" />
        Quick Reply
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            width: 360,
            maxHeight: 360,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-secondary)' }}>
              <Icon path={mdiMagnify} size={0.65} color="var(--text-placeholder)" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search responses..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: 13,
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Response list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
            {responses.length === 0 && (
              <p style={{ color: 'var(--text-placeholder)', fontSize: 13, textAlign: 'center', padding: '16px 12px', margin: 0 }}>
                {search ? 'No matching responses' : 'No canned responses yet'}
              </p>
            )}

            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div style={{ padding: '6px 14px 3px', fontSize: 11, fontWeight: 600, color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {category}
                </div>
                {items.map((item) => {
                  const preview = stripHtml(item.content);
                  return (
                    <button
                      key={item.id}
                      onClick={async () => {
                        // If the caller gave us a ticketId, ask the server
                        // to render `{{ticket.*}}`, `{{requester.*}}`, etc.
                        // Otherwise insert the raw template for the user.
                        let content = item.content;
                        if (ticketId) {
                          try {
                            const res = await fetch(
                              `/api/v1/canned-responses/${item.id}/rendered?ticketId=${ticketId}`,
                              { credentials: 'include' },
                            );
                            if (res.ok) {
                              const data = (await res.json()) as { content: string };
                              content = data.content;
                            }
                          } catch {
                            // Fall back to raw template on network failure
                          }
                        }
                        onSelect(content);
                        setOpen(false);
                        setSearch('');
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 14px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{item.title}</div>
                      {item.shortcut && (
                        <span style={{ fontSize: 11, color: 'var(--text-placeholder)', fontFamily: 'monospace' }}>
                          {item.shortcut}
                        </span>
                      )}
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {preview.length > 80 ? preview.slice(0, 80) + '…' : preview}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
