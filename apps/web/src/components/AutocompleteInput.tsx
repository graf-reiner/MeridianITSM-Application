'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type SuggestField = 'manufacturer' | 'model' | 'os' | 'osVersion' | 'cpuModel';

interface Suggestion {
  value: string;
  source: 'db' | 'seed';
  count?: number;
}

interface AutocompleteInputProps {
  field: SuggestField;
  value: string;
  onChange: (value: string) => void;
  parentValue?: string;
  label: string;
  placeholder?: string;
  labelStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

const DEBOUNCE_MS = 200;

/**
 * Free-text input with tenant-scoped autocomplete for Asset form fields.
 * Values are pulled from Asset + CMDB tables and merged with a curated seed list.
 * User can always type any value — suggestions never restrict input.
 */
export default function AutocompleteInput({
  field,
  value,
  onChange,
  parentValue,
  label,
  placeholder,
  labelStyle,
  inputStyle,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positionDropdown = useCallback(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      const reqId = ++requestIdRef.current;
      try {
        const params = new URLSearchParams({ field, q });
        if (parentValue && parentValue.trim()) {
          params.set('parent', parentValue.trim());
        }
        const res = await fetch(`/api/v1/assets/suggest?${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (reqId === requestIdRef.current) setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        if (reqId !== requestIdRef.current) return; // stale
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch {
        if (reqId === requestIdRef.current) setSuggestions([]);
      }
    },
    [field, parentValue],
  );

  const scheduleFetch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchSuggestions(q);
      }, DEBOUNCE_MS);
    },
    [fetchSuggestions],
  );

  const handleFocus = () => {
    positionDropdown();
    setOpen(true);
    setHighlight(-1);
    // On first focus (even with empty value), fetch top-10 by count
    if (suggestions.length === 0) scheduleFetch(value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);
    setOpen(true);
    setHighlight(-1);
    positionDropdown();
    scheduleFetch(next);
  };

  const pick = (s: Suggestion) => {
    onChange(s.value);
    setOpen(false);
    setSuggestions([]);
    setHighlight(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < suggestions.length) {
        e.preventDefault();
        pick(suggestions[highlight]!);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={wrapperRef}>
      <label style={labelStyle}>{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
      />
      {showDropdown && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            style={{
              position: 'fixed',
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 6,
              maxHeight: 240,
              overflowY: 'auto',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            {suggestions.map((s, idx) => (
              <button
                key={`${s.source}:${s.value}`}
                type="button"
                role="option"
                aria-selected={idx === highlight}
                onMouseDown={(e) => {
                  // use onMouseDown so we fire before input blur
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setHighlight(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '8px 12px',
                  background:
                    idx === highlight ? 'var(--bg-secondary)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                }}
              >
                <span>{renderMatch(s.value, value)}</span>
                {typeof s.count === 'number' && s.count > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-placeholder)',
                      marginLeft: 8,
                    }}
                  >
                    {s.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function renderMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong>{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </>
  );
}
