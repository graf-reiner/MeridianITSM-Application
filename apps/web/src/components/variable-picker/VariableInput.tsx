'use client';

import { useMemo } from 'react';
import Icon from '@mdi/react';
import { mdiCodeBraces } from '@mdi/js';
import {
  getVariablesForContext,
  type VariableContextKey,
  type VariableDefinition,
} from '@meridian/core/template';
import { useVariablePicker } from './useVariablePicker';
import { VariablePopup } from './VariablePopup';

export interface VariableInputProps {
  /** Current template string. */
  value: string;
  /** Parent setter. */
  onChange: (next: string) => void;
  /** Which variable catalogs to merge into the picker. */
  context: VariableContextKey[];
  /** Extra variables to append (used for per-form field keys). */
  dynamicVariables?: VariableDefinition[];
  /** Placeholder text shown when the input is empty. */
  placeholder?: string;
  /** Optional extra CSS style merged onto the input. */
  style?: React.CSSProperties;
  /** Disable editing. */
  disabled?: boolean;
  /** Forwarded HTML id for label-for wiring. */
  id?: string;
  /** Hide the "Variables" button (keeps only the slash trigger). */
  hideButton?: boolean;
}

/**
 * Drop-in replacement for `<input type="text">` with variable insertion.
 * Type `/` in the field to open a floating picker, OR click the small
 * Variables button to open the same popup.
 *
 * The input stores the raw template string (e.g. `Hello {{requester.firstName}}`),
 * so the parent form can persist it directly.
 */
export function VariableInput({
  value,
  onChange,
  context,
  dynamicVariables,
  placeholder,
  style,
  disabled,
  id,
  hideButton,
}: VariableInputProps) {
  const variables = useMemo(() => {
    const base = getVariablesForContext(context);
    return dynamicVariables ? [...base, ...dynamicVariables] : base;
  }, [context, dynamicVariables]);

  const picker = useVariablePicker({ value, onChange, variables });

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={picker.inputRef as any}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={picker.handlers.onKeyDown}
        onKeyUp={picker.handlers.onKeyUp}
        placeholder={placeholder ?? 'Type / to insert a variable'}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '9px 12px',
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          fontSize: 14,
          outline: 'none',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          ...style,
        }}
      />
      {!hideButton && (
        <button
          type="button"
          onClick={picker.openAtCaret}
          disabled={disabled}
          title="Insert variable (or press /)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '8px 10px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 8,
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon path={mdiCodeBraces} size={0.7} color="currentColor" />
          Variables
        </button>
      )}
      {picker.isOpen && (
        <VariablePopup
          variables={variables}
          query={picker.query}
          onInsert={picker.insert}
          onClose={picker.close}
          anchor={picker.anchor}
        />
      )}
    </div>
  );
}
