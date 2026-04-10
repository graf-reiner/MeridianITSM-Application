'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { VariableDefinition } from '@meridian/core/template';

/**
 * Floating popup that shows a filterable, categorized list of template
 * variables. Pure presentation — state for open/close and caret anchor
 * lives in the parent (`useVariablePicker` or the TipTap suggestion
 * renderer), so this component can be mounted both from slash-command
 * triggers and from an on-screen "Variables" button.
 */
export interface VariablePopupProps {
  /** Variables to offer, already merged for the current context. */
  variables: VariableDefinition[];
  /** Current search string (typed after the slash, or typed in the search box). */
  query: string;
  /** Called when the user selects a variable. */
  onInsert: (variable: VariableDefinition) => void;
  /** Called when the popup should close without inserting. */
  onClose: () => void;
  /**
   * Screen coordinates where the popup should anchor (usually the caret
   * position in the input below it). If omitted, the popup centers in
   * its parent — useful for the "Variables" button flow.
   */
  anchor?: { top: number; left: number } | null;
  /** Show the inline search box above the list (default true). */
  showSearch?: boolean;
}

const POPUP_WIDTH = 340;
const POPUP_MAX_HEIGHT = 340;

export function VariablePopup({
  variables,
  query,
  onInsert,
  onClose,
  anchor,
  showSearch = true,
}: VariablePopupProps) {
  const [localQuery, setLocalQuery] = useState(query);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Merge the parent-provided query with the in-popup search box.
  // Parent query wins on prop change; typing in the search box updates localQuery.
  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  // Filter variables by the effective query — case-insensitive match on
  // key, label, or description.
  const filtered = useMemo(() => {
    const q = localQuery.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q),
    );
  }, [variables, localQuery]);

  // Group filtered results by category for section headers.
  const grouped = useMemo(() => {
    const groups = new Map<string, VariableDefinition[]>();
    for (const v of filtered) {
      const list = groups.get(v.category) ?? [];
      list.push(v);
      groups.set(v.category, list);
    }
    // Flatten back into an ordered list with category markers, so keyboard
    // navigation can step through items regardless of headers.
    const flat: Array<
      | { type: 'header'; category: string }
      | { type: 'item'; variable: VariableDefinition; index: number }
    > = [];
    let itemIndex = 0;
    for (const [category, items] of groups) {
      flat.push({ type: 'header', category });
      for (const variable of items) {
        flat.push({ type: 'item', variable, index: itemIndex });
        itemIndex++;
      }
    }
    return { flat, itemCount: itemIndex };
  }, [filtered]);

  // Reset selection whenever the filter changes.
  useEffect(() => {
    setSelectedIdx(0);
  }, [localQuery, variables]);

  // Keep the selected item scrolled into view.
  useEffect(() => {
    itemRefs.current[selectedIdx]?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedIdx]);

  // Focus the search box on open.
  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  // Global keyboard handler — arrow keys + Enter + Escape.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, grouped.itemCount - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const picked = filtered[selectedIdx];
        if (picked) onInsert(picked);
        return;
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [grouped.itemCount, filtered, selectedIdx, onInsert, onClose]);

  // Click-outside-to-close.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Compute style — absolute positioned when anchored to a caret,
  // else a centered modal-ish position.
  const style: React.CSSProperties = anchor
    ? {
        position: 'fixed',
        top: Math.min(anchor.top + 20, window.innerHeight - POPUP_MAX_HEIGHT - 20),
        left: Math.min(anchor.left, window.innerWidth - POPUP_WIDTH - 20),
        width: POPUP_WIDTH,
        maxHeight: POPUP_MAX_HEIGHT,
        zIndex: 10000,
      }
    : {
        position: 'absolute',
        top: '100%',
        marginTop: 4,
        right: 0,
        width: POPUP_WIDTH,
        maxHeight: POPUP_MAX_HEIGHT,
        zIndex: 10000,
      };

  return (
    <div
      ref={containerRef}
      style={{
        ...style,
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      role="listbox"
      aria-label="Insert variable"
    >
      {showSearch && (
        <div
          style={{
            padding: '8px 10px',
            borderBottom: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <input
            ref={searchRef}
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search variables..."
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid var(--border-secondary)',
              borderRadius: 6,
              fontSize: 13,
              outline: 'none',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {grouped.flat.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            No variables match &ldquo;{localQuery}&rdquo;
          </div>
        ) : (
          grouped.flat.map((row, rowIdx) => {
            if (row.type === 'header') {
              return (
                <div
                  key={`h-${row.category}-${rowIdx}`}
                  style={{
                    padding: '6px 12px 2px',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-placeholder)',
                  }}
                >
                  {row.category}
                </div>
              );
            }
            const isSelected = row.index === selectedIdx;
            return (
              <button
                key={row.variable.key}
                ref={(el) => {
                  itemRefs.current[row.index] = el;
                }}
                type="button"
                onClick={() => onInsert(row.variable)}
                onMouseEnter={() => setSelectedIdx(row.index)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
                role="option"
                aria-selected={isSelected}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{row.variable.label}</span>
                  <code
                    style={{
                      fontSize: 11,
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      color: 'var(--text-placeholder)',
                    }}
                  >
                    {`{{${row.variable.key}}}`}
                  </code>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.variable.description}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div
        style={{
          padding: '4px 10px',
          borderTop: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
          fontSize: 10,
          color: 'var(--text-placeholder)',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span>
          <kbd>↑↓</kbd> navigate
        </span>
        <span>
          <kbd>Enter</kbd> insert
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </div>
    </div>
  );
}
