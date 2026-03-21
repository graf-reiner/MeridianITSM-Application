'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiTag, mdiPlus, mdiPencil, mdiTrashCan, mdiChevronRight } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  children?: Category[];
}

// ─── Category Modal ───────────────────────────────────────────────────────────

function CategoryModal({
  category,
  allCategories,
  onClose,
  onSaved,
}: {
  category: Category | null;
  allCategories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [color, setColor] = useState(category?.color ?? '#6366f1');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(category ? `/api/v1/settings/categories/${category.id}` : '/api/v1/settings/categories', {
        method: category ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          parentId: parentId || null,
          color: color || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save category');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setIsSaving(false);
    }
  };

  // Exclude the current category and its descendants from parent options
  const parentOptions = allCategories.filter((c) => c.id !== category?.id);
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: '#374151' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{category ? 'Edit Category' : 'Create Category'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Parent Category</label>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={inputStyle}>
              <option value="">-- None (top-level) --</option>
              {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Color</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: '100%', height: 38, border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', padding: 2 }} />
            </div>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : category ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Category Tree Row ────────────────────────────────────────────────────────

function CategoryRow({
  category,
  depth,
  allCategories,
  onEdit,
  onDelete,
}: {
  category: Category;
  depth: number;
  allCategories: Category[];
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <>
      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#9ca3af' }}>
                <Icon path={mdiChevronRight} size={0.7} color="currentColor" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
              </button>
            ) : (
              <span style={{ width: 18, display: 'inline-block' }} />
            )}
            {category.color && (
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: category.color, display: 'inline-block', flexShrink: 0 }} />
            )}
            <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{category.name}</span>
          </div>
          {category.description && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af', paddingLeft: depth * 20 + 24 }}>{category.description}</p>
          )}
        </td>
        <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>
          {hasChildren ? `${category.children!.length} sub` : '—'}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onEdit(category)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
              <Icon path={mdiPencil} size={0.65} color="currentColor" />
              Edit
            </button>
            <button onClick={() => onDelete(category)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}>
              <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
              Delete
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasChildren && category.children!.map((child) => (
        <CategoryRow
          key={child.id}
          category={child}
          depth={depth + 1}
          allCategories={allCategories}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

// ─── Flatten categories for parent dropdown ───────────────────────────────────

function flattenCategories(categories: Category[]): Category[] {
  const result: Category[] = [];
  function walk(cats: Category[]) {
    for (const c of cats) {
      result.push(c);
      if (c.children) walk(c.children);
    }
  }
  walk(categories);
  return result;
}

// ─── Categories Settings Page ─────────────────────────────────────────────────

export default function CategoriesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);

  const { data, isLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ['settings-categories-tree'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories/tree', { credentials: 'include' });
      if (!res.ok) {
        // Fall back to flat list if tree endpoint not available
        const res2 = await fetch('/api/v1/settings/categories', { credentials: 'include' });
        if (!res2.ok) throw new Error('Failed to load categories');
        return res2.json() as Promise<{ categories: Category[] }>;
      }
      return res.json() as Promise<{ categories: Category[] }>;
    },
  });

  const handleDelete = async (category: Category) => {
    const hasChildren = category.children && category.children.length > 0;
    if (hasChildren) {
      window.alert('Cannot delete a category that has sub-categories. Delete the children first.');
      return;
    }
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    await fetch(`/api/v1/settings/categories/${category.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-categories-tree'] });
  };

  const categories = data?.categories ?? [];
  const flatCategories = flattenCategories(categories);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTag} size={1} color="#059669" />
          Categories
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditCategory(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Category
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading categories...</div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Children</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  depth={0}
                  allCategories={flatCategories}
                  onEdit={(c) => { setEditCategory(c); setShowModal(true); }}
                  onDelete={(c) => void handleDelete(c)}
                />
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No categories yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CategoryModal
          category={editCategory}
          allCategories={flatCategories}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-categories-tree'] })}
        />
      )}
    </div>
  );
}
