'use client';

import Icon from '@mdi/react';
import { mdiClose } from '@mdi/js';
import { WIDGET_TYPES } from './widget-registry';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (type: string) => void;
}

export default function WidgetPalette({ isOpen, onClose, onAdd }: Props) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 50,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90%',
        maxWidth: 520,
        maxHeight: '80vh',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        zIndex: 51,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-primary)',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Add Widget
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--text-muted)',
              display: 'flex',
            }}
            aria-label="Close"
          >
            <Icon path={mdiClose} size={0.9} />
          </button>
        </div>

        {/* Widget type grid */}
        <div style={{
          padding: 16,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}>
          {WIDGET_TYPES.map((wt) => (
            <button
              key={wt.type}
              onClick={() => {
                onAdd(wt.type);
                onClose();
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 6,
                padding: '14px 16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-brand)';
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary, var(--bg-secondary))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: 'rgba(2,132,199,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon path={wt.icon} size={0.8} color="var(--accent-brand, #0284c7)" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {wt.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {wt.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
