'use client';

import { useState } from 'react';
import Icon from '@mdi/react';
import { mdiClose, mdiCheck } from '@mdi/js';
import type { DashboardConfig } from './types';

type Background = DashboardConfig['background'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentBackground: Background;
  onSelect: (bg: Background) => void;
}

const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'White', value: '#ffffff' },
  { label: 'Light Gray', value: '#f1f5f9' },
  { label: 'Light Blue', value: '#eff6ff' },
  { label: 'Light Green', value: '#f0fdf4' },
  { label: 'Light Purple', value: '#faf5ff' },
  { label: 'Dark Blue', value: '#1e293b' },
  { label: 'Dark Gray', value: '#1f2937' },
  { label: 'Black', value: '#0f172a' },
];

const GRADIENT_PRESETS: { label: string; value: string }[] = [
  { label: 'Blue to Purple', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Green to Teal', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
  { label: 'Warm Sunset', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Cool Ocean', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { label: 'Dark Night', value: 'linear-gradient(135deg, #0c1445 0%, #1a1a2e 50%, #16213e 100%)' },
];

function isSelected(current: Background, type: 'color' | 'gradient', value: string): boolean {
  if (!current) return false;
  return current.type === type && current.value === value;
}

export default function BackgroundPicker({ isOpen, onClose, currentBackground, onSelect }: Props) {
  const [customHex, setCustomHex] = useState('');

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
        maxWidth: 440,
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
            Dashboard Background
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

        {/* Content */}
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>

          {/* Reset to default */}
          <button
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: 16,
              backgroundColor: currentBackground === null ? 'var(--accent-brand)' : 'var(--bg-secondary)',
              color: currentBackground === null ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Default (theme background)
          </button>

          {/* Color presets */}
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Solid Colors
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {COLOR_PRESETS.map((c) => {
              const selected = isSelected(currentBackground, 'color', c.value);
              return (
                <button
                  key={c.value}
                  onClick={() => {
                    onSelect({ type: 'color', value: c.value });
                    onClose();
                  }}
                  title={c.label}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 8,
                    border: selected ? '2px solid var(--accent-brand)' : '1px solid var(--border-primary)',
                    backgroundColor: c.value,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {selected && (
                    <Icon
                      path={mdiCheck}
                      size={0.8}
                      color={c.value === '#ffffff' || c.value === '#f1f5f9' || c.value === '#eff6ff' || c.value === '#f0fdf4' || c.value === '#faf5ff' ? '#0284c7' : '#fff'}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Gradient presets */}
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Gradients
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {GRADIENT_PRESETS.map((g) => {
              const selected = isSelected(currentBackground, 'gradient', g.value);
              return (
                <button
                  key={g.value}
                  onClick={() => {
                    onSelect({ type: 'gradient', value: g.value });
                    onClose();
                  }}
                  title={g.label}
                  style={{
                    width: '100%',
                    aspectRatio: '2 / 1',
                    borderRadius: 8,
                    border: selected ? '2px solid var(--accent-brand)' : '1px solid var(--border-primary)',
                    background: g.value,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && <Icon path={mdiCheck} size={0.8} color="#fff" />}
                </button>
              );
            })}
          </div>

          {/* Custom hex input */}
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Custom Color
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="#hex or rgb(...)"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 13,
                border: '1px solid var(--border-primary)',
                borderRadius: 8,
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => {
                const val = customHex.trim();
                if (val) {
                  onSelect({ type: 'color', value: val });
                  onClose();
                }
              }}
              disabled={!customHex.trim()}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: 'var(--accent-brand)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: customHex.trim() ? 'pointer' : 'not-allowed',
                opacity: customHex.trim() ? 1 : 0.5,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
