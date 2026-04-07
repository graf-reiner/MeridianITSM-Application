'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiFileDocumentMultiple, mdiPlus, mdiPencil, mdiTrashCan, mdiCheck, mdiClose } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketTemplate {
  id: string;
  name: string;
  description: string | null;
  ticketType: string;
  defaultPriority: string | null;
  fields: unknown[];
  isActive: boolean;
  isDefault: boolean;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function TemplateModal({ item, onClose, onSaved }: { item: TicketTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [ticketType, setTicketType] = useState(item?.ticketType ?? 'INCIDENT');
  const [defaultPriority, setDefaultPriority] = useState(item?.defaultPriority ?? '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isDefault, setIsDefault] = useState(item?.isDefault ?? false);
  const [fieldsJson, setFieldsJson] = useState(item?.fields ? JSON.stringify(item.fields, null, 2) : '[]');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      let parsedFields: unknown[];
      try {
        parsedFields = JSON.parse(fieldsJson);
      } catch {
        throw new Error('Fields JSON is not valid JSON');
      }
      const res = await fetch(item ? `/api/v1/ticket-templates/${item.id}` : '/api/v1/ticket-templates', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          ticketType,
          defaultPriority: defaultPriority || null,
          fields: parsedFields,
          isActive,
          isDefault,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save template');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 580, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{item ? 'Edit Template' : 'Create Template'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="description" style={labelStyle}>Description</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="ticketType" style={labelStyle}>Ticket Type *</label>
              <select id="ticketType" value={ticketType} onChange={(e) => setTicketType(e.target.value)} style={inputStyle}>
                <option value="INCIDENT">Incident</option>
                <option value="REQUEST">Service Request</option>
                <option value="PROBLEM">Problem</option>
                <option value="CHANGE">Change</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="defaultPriority" style={labelStyle}>Default Priority</label>
              <select id="defaultPriority" value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value)} style={inputStyle}>
                <option value="">None</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Default
            </label>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="fields" style={labelStyle}>Fields (JSON)</label>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)' }}>Visual field builder coming soon. For now, edit the JSON directly.</p>
            <textarea id="fields" value={fieldsJson} onChange={(e) => setFieldsJson(e.target.value)} rows={6} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : item ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TicketTemplatesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<TicketTemplate | null>(null);

  const { data, isLoading } = useQuery<TicketTemplate[]>({
    queryKey: ['settings-ticket-templates'],
    queryFn: async () => {
      const res = await fetch('/api/v1/ticket-templates/all', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load templates');
      const json = await res.json();
      return Array.isArray(json) ? json : json.templates ?? json.data ?? [];
    },
  });

  const handleDelete = async (item: TicketTemplate) => {
    if (!window.confirm(`Delete template "${item.name}"?`)) return;
    await fetch(`/api/v1/ticket-templates/${item.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-ticket-templates'] });
  };

  const items = data ?? [];

  const statusBadge = (active: boolean) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: active ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: active ? '#16a34a' : 'var(--text-muted)' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiFileDocumentMultiple} size={1} color="#6366f1" />
          Ticket Templates
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Template
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Default</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{item.ticketType}</td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(item.isActive)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Icon path={item.isDefault ? mdiCheck : mdiClose} size={0.7} color={item.isDefault ? '#16a34a' : 'var(--text-placeholder)'} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditItem(item); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" /> Edit
                      </button>
                      <button onClick={() => void handleDelete(item)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}>
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No templates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <TemplateModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-ticket-templates'] })}
        />
      )}
    </div>
  );
}
