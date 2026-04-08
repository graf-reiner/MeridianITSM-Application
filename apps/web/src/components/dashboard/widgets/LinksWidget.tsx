'use client';

import { useState } from 'react';
import Icon from '@mdi/react';
import { mdiOpenInNew, mdiPlus, mdiDelete, mdiPencil } from '@mdi/js';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface LinkItem {
  label: string;
  url: string;
  color?: string;
}

const DEFAULT_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626'];

export default function LinksWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const links: LinkItem[] = (config.config?.links as LinkItem[]) || [];
  const [editMode, setEditMode] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const title = config.title || 'Links';

  function updateLinks(newLinks: LinkItem[]) {
    onConfigChange?.(widgetId, {
      ...config,
      config: { ...config.config, links: newLinks },
    });
  }

  function addLink() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    const color = DEFAULT_COLORS[links.length % DEFAULT_COLORS.length];
    updateLinks([...links, { label: newLabel.trim(), url: newUrl.trim(), color }]);
    setNewLabel('');
    setNewUrl('');
  }

  function removeLink(idx: number) {
    updateLinks(links.filter((_, i) => i !== idx));
  }

  return (
    <WidgetWrapper title={title} isEditing={isEditing} onRemove={isEditing ? () => onConfigChange?.(widgetId, { ...config, type: '__remove__' }) : undefined}>
      {links.length === 0 && !isEditing ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-placeholder)', fontSize: 13 }}>
          No links configured
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map((link, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: link.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
                flexShrink: 0,
              }} />
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              >
                {link.label}
              </a>
              <Icon path={mdiOpenInNew} size={0.5} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              {isEditing && editMode && (
                <button
                  onClick={() => removeLink(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--accent-danger)' }}
                >
                  <Icon path={mdiDelete} size={0.55} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit controls - only visible in dashboard edit mode */}
      {isEditing && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--border-primary)', paddingTop: 8 }}>
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: 'var(--accent-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <Icon path={mdiPencil} size={0.5} />
              Edit Links
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  placeholder="Label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '4px 8px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 4,
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="https://..."
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
                  style={{
                    flex: 2,
                    fontSize: 12,
                    padding: '4px 8px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 4,
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={addLink}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 8px',
                    fontSize: 12,
                    border: '1px solid var(--accent-primary)',
                    borderRadius: 4,
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <Icon path={mdiPlus} size={0.5} />
                </button>
              </div>
              <button
                onClick={() => setEditMode(false)}
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  alignSelf: 'flex-end',
                }}
              >
                Done editing
              </button>
            </div>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
