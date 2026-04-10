'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// @ts-expect-error — textarea-caret is a tiny JS library with no types
import getCaretCoordinates from 'textarea-caret';
import type { VariableDefinition } from '@meridian/core/template';

/**
 * Wires slash-command variable insertion onto a plain `<input>` or
 * `<textarea>`. The hook:
 *
 *  1. Listens for `/` typed at the current caret position and opens a
 *     popup anchored to that caret.
 *  2. Tracks the text typed after the slash as the search query.
 *  3. Inserts `{{variable.key}}` when the caller picks a variable,
 *     replacing the `/query` with the token.
 *  4. Exposes `openAt()` for button-triggered invocations — positions
 *     the popup at the current caret without a slash prefix.
 *
 * Returns props you spread onto the input, plus the popup state.
 */
export interface UseVariablePickerArgs {
  /** Current value of the input — hook needs this to compute positions. */
  value: string;
  /** Parent's setter — called with the edited text after insertion. */
  onChange: (next: string) => void;
  /** Available variables to offer (already filtered by context). */
  variables: VariableDefinition[];
}

export interface VariablePickerState {
  /** Is the popup currently visible? */
  isOpen: boolean;
  /** The current search query (text after the slash trigger). */
  query: string;
  /** Screen coordinates where the popup should anchor. */
  anchor: { top: number; left: number } | null;
  /** Close the popup without inserting. */
  close: () => void;
  /** Insert a variable at the tracked position. */
  insert: (variable: VariableDefinition) => void;
  /** Open the popup at the current caret position (for button clicks). */
  openAtCaret: () => void;
  /** Handlers to spread onto the input / textarea. */
  handlers: {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  };
  /** Ref to attach to the input / textarea. */
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

/**
 * Build the hook. The caller still owns the `<input>` or `<textarea>`,
 * along with its `value`/`onChange` state. The hook only observes
 * selection + keystrokes and edits the value through `onChange`.
 */
export function useVariablePicker(args: UseVariablePickerArgs): VariablePickerState {
  const { value, onChange, variables } = args;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  // Position of the slash character in the value, so we know what to replace.
  const slashPosRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    slashPosRef.current = null;
  }, []);

  /** Computes screen coords for the caret and opens the popup there. */
  const openAtPosition = useCallback((pos: number) => {
    const el = inputRef.current;
    if (!el) return;
    const coords = getCaretCoordinates(el, pos) as { top: number; left: number; height: number };
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top + coords.top - el.scrollTop + coords.height,
      left: rect.left + coords.left - el.scrollLeft,
    });
    setIsOpen(true);
  }, []);

  /** Open the popup at wherever the caret currently is. */
  const openAtCaret = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    slashPosRef.current = pos; // no slash to replace — insert AT this position
    setQuery('');
    openAtPosition(pos);
  }, [openAtPosition]);

  /** Replace the slash (and any query chars after it) with `{{token}}`. */
  const insert = useCallback(
    (variable: VariableDefinition) => {
      const el = inputRef.current;
      if (!el) return;
      const slashPos = slashPosRef.current;
      if (slashPos === null) return;

      const token = `{{${variable.key}}}`;
      // If we opened via slash trigger, the caret is past the slash and
      // maybe some typed query characters. We replace the slash + query.
      // If we opened via button (no slash), we insert at slashPos.
      const before = value.slice(0, slashPos);
      const after = value.slice(slashPos + 1 + query.length);
      // Detect whether the character at `slashPos` is actually a slash —
      // if not, this was a button-triggered open and we don't consume a char.
      const wasSlashTrigger = value[slashPos] === '/';
      const next = wasSlashTrigger
        ? `${before}${token}${value.slice(slashPos + 1 + query.length)}`
        : `${value.slice(0, slashPos)}${token}${value.slice(slashPos)}`;
      onChange(next);

      // Restore focus + move caret after the inserted token.
      const nextCaret = (wasSlashTrigger ? before.length : slashPos) + token.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      });

      close();
      // Suppress unused-var warning for `after` — kept for clarity above.
      void after;
    },
    [value, query, onChange, close],
  );

  /** Detects `/` to open the popup. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (isOpen) {
        // Let Escape / arrows / Enter be handled by the popup's global listener.
        return;
      }
      if (e.key === '/') {
        const el = e.currentTarget;
        const pos = el.selectionStart ?? 0;
        // Store the position where the slash WILL be after the keystroke.
        slashPosRef.current = pos;
        setQuery('');
        // Defer anchor calc until after the browser has inserted the slash.
        requestAnimationFrame(() => openAtPosition(pos));
      }
    },
    [isOpen, openAtPosition],
  );

  /** Track typing after the slash to update the search query. */
  const onKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!isOpen) return;
      const el = e.currentTarget;
      const caret = el.selectionStart ?? 0;
      const slashPos = slashPosRef.current;
      if (slashPos === null) return;
      // If the caret moved behind the slash, close the popup.
      if (caret <= slashPos) {
        close();
        return;
      }
      // Update query = text between slash and caret.
      setQuery(el.value.slice(slashPos + 1, caret));
    },
    [isOpen, close],
  );

  // Cleanup on unmount or context change.
  useEffect(() => {
    if (!isOpen) return;
    return () => {
      // noop — just ensuring isOpen dep is declared
    };
  }, [isOpen]);

  // Variables dependency is carried through even if unused here so the
  // hook stays in sync with picker prop changes.
  void variables;

  return {
    isOpen,
    query,
    anchor,
    close,
    insert,
    openAtCaret,
    handlers: { onKeyDown, onKeyUp },
    inputRef,
  };
}
