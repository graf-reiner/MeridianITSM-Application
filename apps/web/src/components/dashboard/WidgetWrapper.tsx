'use client';

import Icon from '@mdi/react';
import { mdiDrag, mdiClose } from '@mdi/js';

interface Props {
  title: string;
  isEditing: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
}

export default function WidgetWrapper({ title, isEditing, onRemove, children }: Props) {
  return (
    <div style={{
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      border: '1px solid var(--border-primary)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 1px 3px var(--shadow-sm)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-primary)',
        gap: 8,
        minHeight: 36,
      }}>
        {isEditing && (
          <div className="drag-handle" style={{ cursor: 'grab', display: 'flex', color: 'var(--text-muted)' }}>
            <Icon path={mdiDrag} size={0.7} />
          </div>
        )}
        <span style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        {isEditing && onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 2,
              display: 'flex',
            }}
          >
            <Icon path={mdiClose} size={0.6} />
          </button>
        )}
      </div>
      {/* Body */}
      <div style={{ flex: 1, padding: '8px 12px', overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
