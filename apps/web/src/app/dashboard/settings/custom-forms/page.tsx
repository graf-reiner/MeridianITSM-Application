'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiFormSelect,
  mdiPlus,
  mdiPencil,
  mdiArchive,
  mdiClose,
  mdiContentCopy,
} from '@mdi/js';

// --- Types ------------------------------------------------------------------

type FormStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type TicketType = 'SERVICE_REQUEST' | 'INCIDENT' | 'PROBLEM';

interface CustomForm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ticketType: TicketType;
  status: FormStatus;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { submissions: number };
}

const TICKET_TYPES: { value: TicketType; label: string }[] = [
  { value: 'SERVICE_REQUEST', label: 'Service Request' },
  { value: 'INCIDENT', label: 'Incident' },
  { value: 'PROBLEM', label: 'Problem' },
];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Styles -----------------------------------------------------------------

const labelStyle = { display: 'block' as const, marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' };
const thStyle = { padding: '10px 14px', textAlign: 'left' as const, fontWeight: 600, color: 'var(--text-secondary)' };
const tdStyle = { padding: '10px 14px' };

// --- Status Badge -----------------------------------------------------------

function StatusBadge({ status }: { status: FormStatus }) {
  const colors: Record<FormStatus, { bg: string; color: string }> = {
    DRAFT: { bg: 'var(--badge-yellow-bg, #fef9c3)', color: '#ca8a04' },
    PUBLISHED: { bg: 'var(--badge-green-bg, #dcfce7)', color: '#16a34a' },
    ARCHIVED: { bg: 'var(--bg-tertiary, #f3f4f6)', color: 'var(--text-muted, #9ca3af)' },
  };
  const c = colors[status] ?? colors.DRAFT;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

// --- Success Banner ---------------------------------------------------------

function SuccessBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{ padding: '10px 16px', marginBottom: 16, backgroundColor: 'var(--badge-green-bg, #dcfce7)', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 2 }}>
        <Icon path={mdiClose} size={0.7} color="currentColor" />
      </button>
    </div>
  );
}

// --- Create Form Modal ------------------------------------------------------

function CreateFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('SERVICE_REQUEST');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugManuallyEdited) {
      setSlug(generateSlug(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setSlugManuallyEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!slug.trim()) { setError('Slug is required.'); return; }
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) { setError('Slug must start with a letter and contain only lowercase letters, numbers, and hyphens.'); return; }

    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/custom-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          ticketType,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create form');
      }

      onSaved(`Form "${name.trim()}" created successfully.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 520, overflow: 'auto', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            Create Form
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cf-name" style={labelStyle}>Name *</label>
            <input id="cf-name" type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} required style={inputStyle} placeholder="e.g. New Hire Onboarding" />
          </div>

          {/* Slug */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cf-slug" style={labelStyle}>Slug *</label>
            <input
              id="cf-slug"
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              style={{
                ...inputStyle,
                fontFamily: 'monospace',
                fontSize: 13,
              }}
              placeholder="auto-generated-from-name"
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
              Auto-generated from name. Used in the portal URL for this form.
            </span>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cf-desc" style={labelStyle}>Description</label>
            <textarea id="cf-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the purpose of this form" />
          </div>

          {/* Ticket Type */}
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="cf-type" style={labelStyle}>Ticket Type *</label>
            <select id="cf-type" value={ticketType} onChange={(e) => setTicketType(e.target.value as TicketType)} style={inputStyle}>
              {TICKET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Custom Forms Page ------------------------------------------------------

export default function CustomFormsSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CustomForm[]>({
    queryKey: ['settings-custom-forms'],
    queryFn: async () => {
      const res = await fetch('/api/v1/custom-forms', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load custom forms');
      const json = await res.json();
      return Array.isArray(json) ? json : json.forms ?? json.data ?? [];
    },
  });

  const handleClone = async (form: CustomForm) => {
    if (!window.confirm(`Clone form "${form.name}"? A new draft copy will be created.`)) return;
    try {
      const res = await fetch(`/api/v1/custom-forms/${form.id}/clone`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to clone form');
      }
      setSuccessMsg(`Form "${form.name}" cloned successfully.`);
      void qc.invalidateQueries({ queryKey: ['settings-custom-forms'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clone form');
    }
  };

  const handleArchive = async (form: CustomForm) => {
    if (!window.confirm(`Archive form "${form.name}"? It will no longer be available in the portal.`)) return;
    try {
      const res = await fetch(`/api/v1/custom-forms/${form.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to archive form');
      }
      setSuccessMsg(`Form "${form.name}" archived.`);
      void qc.invalidateQueries({ queryKey: ['settings-custom-forms'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive form');
    }
  };

  const handleSaved = useCallback((msg: string) => {
    setSuccessMsg(msg);
    void qc.invalidateQueries({ queryKey: ['settings-custom-forms'] });
  }, [qc]);

  const dismissSuccess = useCallback(() => setSuccessMsg(null), []);

  const forms = data ?? [];

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiFormSelect} size={1} color="#6366f1" />
          Custom Forms
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Create Form
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <p style={{ margin: '0 0 20px 0', fontSize: 14, color: 'var(--text-muted)', paddingLeft: 34 }}>
        Build portal forms that generate tickets
      </p>

      {/* Success Banner */}
      {successMsg && <SuccessBanner message={successMsg} onDismiss={dismissSuccess} />}

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading custom forms...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Version</th>
                <th style={thStyle}>Submissions</th>
                <th style={thStyle}>Last Published</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{form.name}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{form.slug}</div>
                  </td>
                  <td style={tdStyle}><StatusBadge status={form.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 13 }}>v{form.version}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 13 }}>{form._count?.submissions ?? 0}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 13 }}>{formatDate(form.publishedAt)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link
                        href={`/dashboard/settings/custom-forms/${form.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', textDecoration: 'none' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </Link>
                      <button
                        onClick={() => void handleClone(form)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiContentCopy} size={0.65} color="currentColor" />
                        Clone
                      </button>
                      {form.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => void handleArchive(form)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                        >
                          <Icon path={mdiArchive} size={0.65} color="currentColor" />
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {forms.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                    No custom forms found. Create your first form to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CreateFormModal
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
