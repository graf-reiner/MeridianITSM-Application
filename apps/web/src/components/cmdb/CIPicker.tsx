'use client';

import { useState, useEffect, useCallback, useRef, type ReactElement } from 'react';

/**
 * Phase 8 (D-04): CMDB CI search picker with type-ahead. Used from the Asset
 * detail page's "Link a CI" empty state when the operator wants to attach
 * an Asset to an existing CI.
 *
 * Multi-tenancy (CLAUDE.md Rule 1): server-side enforced via
 * /api/v1/cmdb/cis tenant filter on the authenticated user's session
 * (no client-side tenant param). MUST NOT add a tenantId query parameter —
 * the existing `/api/v1/cmdb/cis` endpoint already scopes by tenantId from
 * the session JWT. (T-8-01-05 mitigation.)
 *
 * Analog: apps/web/src/components/VendorPicker.tsx (lines 39-65 — the
 * fetchCis + useEffect pattern). Adds a 250ms debounce on top (CI list
 * can be 1000s of rows; VendorPicker's vendor list is smaller).
 */
export interface CIOption {
  id: string;
  name: string;
  ciNumber: number;
  classKey: string;
}

export function CIPicker(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (ciId: string) => void;
}): ReactElement | null {
  const [query, setQuery] = useState('');
  const [cis, setCis] = useState<CIOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchCis = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/cmdb/cis?search=${encodeURIComponent(search)}&pageSize=20`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Failed to load CIs');
      const json = (await res.json()) as { data?: CIOption[] };
      setCis(json.data ?? []);
    } catch {
      setCis([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced type-ahead — fire fetch after 250ms of input idle time.
  useEffect(() => {
    if (!props.open) return;
    const t = setTimeout(() => void fetchCis(query), 250);
    return () => clearTimeout(t);
  }, [query, fetchCis, props.open]);

  // Auto-focus the search input when the modal opens.
  useEffect(() => {
    if (props.open) {
      // Microtask so the DOM node exists when we call focus().
      Promise.resolve().then(() => inputRef.current?.focus());
    }
  }, [props.open]);

  if (!props.open) return null;
  return (
    <div
      data-testid="ci-picker"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          padding: 24,
          borderRadius: 8,
          minWidth: 480,
          maxWidth: 640,
          maxHeight: '70vh',
          overflow: 'auto',
          border: '1px solid var(--border-primary)',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          Link a Configuration Item
        </h3>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search CIs by name, hostname, or CI number..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            marginBottom: 12,
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
        {loading ? (
          <p style={{ margin: 8, color: 'var(--text-muted)' }}>Loading…</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cis.map((ci) => (
              <li
                key={ci.id}
                data-testid="ci-option"
                onClick={() => {
                  props.onSelect(ci.id);
                  props.onClose();
                }}
                style={{
                  padding: '8px 10px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-primary)',
                  fontSize: 13,
                }}
              >
                <strong>{ci.name}</strong> — CI-{ci.ciNumber} ({ci.classKey})
              </li>
            ))}
            {cis.length === 0 && !loading && (
              <li style={{ padding: 8, color: 'var(--text-muted)' }}>No CIs found</li>
            )}
          </ul>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
