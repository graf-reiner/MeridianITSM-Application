'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiShape, mdiPlus, mdiPencil, mdiTrashCan, mdiChevronRight } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetType {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  children?: AssetType[];
}

// ─── Asset Type Modal ─────────────────────────────────────────────────────────

function AssetTypeModal({
  assetType,
  allTypes,
  onClose,
  onSaved,
}: {
  assetType: AssetType | null;
  allTypes: AssetType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(assetType?.name ?? '');
  const [description, setDescription] = useState(assetType?.description ?? '');
  const [parentId, setParentId] = useState(assetType?.parentId ?? '');
  const [icon, setIcon] = useState(assetType?.icon ?? '');
  const [color, setColor] = useState(assetType?.color ?? '#6366f1');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(
        assetType
          ? `/api/v1/settings/asset-types/${assetType.id}`
          : '/api/v1/settings/asset-types',
        {
          method: assetType ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            parentId: parentId || null,
            icon: icon.trim() || null,
            color: color || null,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save asset type');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asset type');
    } finally {
      setIsSaving(false);
    }
  };

  const parentOptions = allTypes.filter((t) => t.id !== assetType?.id);
  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  };
  const labelStyle = {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            {assetType ? 'Edit Asset Type' : 'Create Asset Type'}
          </h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="description" style={labelStyle}>Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' as const }}
              placeholder="Optional description"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="parentType" style={labelStyle}>Parent Type</label>
            <select id="parentType" value={parentId} onChange={(e) => setParentId(e.target.value)} style={inputStyle}>
              <option value="">-- None (top-level) --</option>
              {parentOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="icon" style={labelStyle}>Icon (MDI name)</label>
            <input
              id="icon"
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              style={inputStyle}
              placeholder="e.g. laptop, server, cellphone"
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
              MDI icon name (e.g. laptop, desktop-classic, server, router-wireless)
            </p>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="color" style={labelStyle}>Color</label>
            <input
              id="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: '100%', height: 38, border: '1px solid var(--border-secondary)', borderRadius: 7, cursor: 'pointer', padding: 2 }}
            />
          </div>
          {error && (
            <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}
            >
              {isSaving ? 'Saving...' : assetType ? 'Save Changes' : 'Create Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Asset Type Tree Row ──────────────────────────────────────────────────────

function AssetTypeRow({
  assetType,
  depth,
  allTypes,
  onEdit,
  onDelete,
}: {
  assetType: AssetType;
  depth: number;
  allTypes: AssetType[];
  onEdit: (t: AssetType) => void;
  onDelete: (t: AssetType) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = assetType.children && assetType.children.length > 0;

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--text-placeholder)' }}
              >
                <Icon
                  path={mdiChevronRight}
                  size={0.7}
                  color="currentColor"
                  style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
                />
              </button>
            ) : (
              <span style={{ width: 18, display: 'inline-block' }} />
            )}
            {assetType.color && (
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: assetType.color, display: 'inline-block', flexShrink: 0 }} />
            )}
            <span style={{ fontWeight: depth === 0 ? 600 : 400, color: 'var(--text-primary)' }}>{assetType.name}</span>
            {assetType.icon && (
              <span style={{ fontSize: 11, color: 'var(--text-placeholder)', fontFamily: 'monospace' }}>{assetType.icon}</span>
            )}
          </div>
          {assetType.description && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-placeholder)', paddingLeft: depth * 20 + 24 }}>
              {assetType.description}
            </p>
          )}
        </td>
        <td style={{ padding: '10px 14px', color: 'var(--text-placeholder)', fontSize: 12 }}>
          {hasChildren ? `${assetType.children!.length} sub` : '—'}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onEdit(assetType)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
            >
              <Icon path={mdiPencil} size={0.65} color="currentColor" />
              Edit
            </button>
            <button
              onClick={() => onDelete(assetType)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
            >
              <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
              Delete
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasChildren && assetType.children!.map((child) => (
        <AssetTypeRow
          key={child.id}
          assetType={child}
          depth={depth + 1}
          allTypes={allTypes}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

// ─── Flatten for parent dropdown ──────────────────────────────────────────────

function flattenTypes(types: AssetType[]): AssetType[] {
  const result: AssetType[] = [];
  function walk(items: AssetType[]) {
    for (const t of items) {
      result.push(t);
      if (t.children) walk(t.children);
    }
  }
  walk(types);
  return result;
}

// ─── Asset Types Settings Page ────────────────────────────────────────────────

export default function AssetTypesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editType, setEditType] = useState<AssetType | null>(null);

  const { data, isLoading } = useQuery<AssetType[]>({
    queryKey: ['settings-asset-types-tree'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/asset-types/tree', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load asset types');
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
  });

  const handleDelete = async (assetType: AssetType) => {
    if (assetType.children && assetType.children.length > 0) {
      window.alert('Cannot delete an asset type that has sub-types. Delete the children first.');
      return;
    }
    if (!window.confirm(`Delete asset type "${assetType.name}"?`)) return;
    const res = await fetch(`/api/v1/settings/asset-types/${assetType.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(data.error ?? 'Failed to delete asset type');
      return;
    }
    void qc.invalidateQueries({ queryKey: ['settings-asset-types-tree'] });
  };

  const types = data ?? [];
  const flatTypes = flattenTypes(types);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiShape} size={1} color="#8B5CF6" />
          Asset Types
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditType(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Asset Type
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading asset types...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Children</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <AssetTypeRow
                  key={t.id}
                  assetType={t}
                  depth={0}
                  allTypes={flatTypes}
                  onEdit={(at) => { setEditType(at); setShowModal(true); }}
                  onDelete={(at) => void handleDelete(at)}
                />
              ))}
              {types.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                    No asset types yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AssetTypeModal
          assetType={editType}
          allTypes={flatTypes}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-asset-types-tree'] })}
        />
      )}
    </div>
  );
}
