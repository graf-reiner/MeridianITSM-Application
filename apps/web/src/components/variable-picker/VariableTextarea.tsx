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

export interface VariableTextareaProps {
  value: string;
  onChange: (next: string) => void;
  context: VariableContextKey[];
  dynamicVariables?: VariableDefinition[];
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
  disabled?: boolean;
  id?: string;
  hideButton?: boolean;
}

/**
 * Drop-in replacement for `<textarea>` with variable insertion.
 * Same slash-or-button pattern as `VariableInput`, but renders as a
 * multi-line textarea with the Variables button in the top-right corner.
 */
export function VariableTextarea({
  value,
  onChange,
  context,
  dynamicVariables,
  placeholder,
  rows = 4,
  style,
  disabled,
  id,
  hideButton,
}: VariableTextareaProps) {
  const variables = useMemo(() => {
    const base = getVariablesForContext(context);
    return dynamicVariables ? [...base, ...dynamicVariables] : base;
  }, [context, dynamicVariables]);

  const picker = useVariablePicker({ value, onChange, variables });

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={picker.inputRef as React.Ref<HTMLTextAreaElement>}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={picker.handlers.onKeyDown}
        onKeyUp={picker.handlers.onKeyUp}
        placeholder={placeholder ?? 'Type / to insert a variable'}
        rows={rows}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '9px 12px',
          paddingRight: hideButton ? 12 : 110,
          border: '1px solid var(--border-secondary)',
          borderRadius: 8,
          fontSize: 14,
          outline: 'none',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          resize: 'vertical',
          lineHeight: 1.5,
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
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon path={mdiCodeBraces} size={0.6} color="currentColor" />
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
