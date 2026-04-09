'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import {
  mdiMagnify,
  mdiKeyboardReturn,
  mdiClose,
  mdiTicketOutline,
  mdiBookOpenVariant,
  mdiCommentTextOutline,
  mdiFileDocumentOutline,
  mdiLoading,
} from '@mdi/js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchResult {
  source: 'ticket' | 'knowledge_article' | 'ticket_comment' | 'attachment';
  id: string;
  title: string;
  snippet: string;
  rank: number;
  metadata?: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

const SOURCE_ICONS: Record<string, string> = {
  ticket: mdiTicketOutline,
  knowledge_article: mdiBookOpenVariant,
  ticket_comment: mdiCommentTextOutline,
  attachment: mdiFileDocumentOutline,
};

const SOURCE_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  knowledge_article: 'Knowledge',
  ticket_comment: 'Comment',
  attachment: 'Attachment',
};

function getResultLink(result: SearchResult): string {
  switch (result.source) {
    case 'ticket':
      return `/dashboard/tickets/${result.id}`;
    case 'knowledge_article':
      return `/dashboard/knowledge/${result.id}`;
    case 'ticket_comment':
      return `/dashboard/tickets/${result.id}`;
    case 'attachment':
      return result.metadata?.sourceType === 'ticket'
        ? `/dashboard/tickets/${result.metadata.sourceId}`
        : '#';
    default:
      return '#';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Keyboard shortcut: Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=10`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as SearchResponse;
        setResults(data.results);
        setSelectedIndex(0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, doSearch]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    router.push(getResultLink(result));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9990, backdropFilter: 'blur(2px)',
        }}
        onClick={() => setOpen(false)}
      />

      {/* Command palette */}
      <div
        style={{
          position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
          width: '90%', maxWidth: 580,
          backgroundColor: 'var(--bg-primary)', borderRadius: 12,
          border: '1px solid var(--border-primary)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          zIndex: 9991, overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-primary)' }}>
          <Icon path={mdiMagnify} size={0.85} color="var(--text-muted)" style={{ flexShrink: 0, marginRight: 10 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tickets, knowledge articles, comments..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 15,
              backgroundColor: 'transparent', color: 'var(--text-primary)',
            }}
          />
          {loading && <Icon path={mdiLoading} size={0.7} spin color="var(--text-muted)" style={{ marginRight: 8 }} />}
          <button
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 2, padding: '3px 6px',
              borderRadius: 4, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
            }}
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {query.length >= 2 && !loading && results.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.map((result, idx) => (
            <button
              key={`${result.source}-${result.id}`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                width: '100%', padding: '10px 16px', border: 'none', textAlign: 'left',
                backgroundColor: idx === selectedIndex ? 'var(--bg-secondary)' : 'transparent',
                cursor: 'pointer', borderBottom: '1px solid var(--bg-tertiary)',
              }}
            >
              <div
                style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0, marginTop: 2,
                  backgroundColor: 'var(--bg-tertiary)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon path={SOURCE_ICONS[result.source] ?? mdiFileDocumentOutline} size={0.6} color="var(--text-muted)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.title}
                </div>
                {result.snippet && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.snippet.replace(/\*\*/g, '')}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-placeholder)', flexShrink: 0, marginTop: 4, textTransform: 'uppercase' }}>
                {SOURCE_LABELS[result.source] ?? result.source}
              </span>
              {idx === selectedIndex && (
                <Icon path={mdiKeyboardReturn} size={0.5} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 4 }} />
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-primary)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-placeholder)' }}>
          <span><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)', fontSize: 10 }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)', fontSize: 10 }}>↵</kbd> Open</span>
          <span><kbd style={{ padding: '1px 4px', borderRadius: 3, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)', fontSize: 10 }}>esc</kbd> Close</span>
        </div>
      </div>
    </>
  );
}
