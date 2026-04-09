'use client';

import { useState, useEffect, useCallback } from 'react';
import Icon from '@mdi/react';
import {
  mdiMapMarkerOutline,
  mdiPlus,
  mdiPencilOutline,
  mdiDeleteOutline,
  mdiClose,
  mdiMagnify,
  mdiAccountMultiple,
  mdiPackageVariantClosed,
  mdiLoading,
} from '@mdi/js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  _count: { users: number; assets: number };
}

interface SiteForm {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
}

const emptySiteForm: SiteForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [form, setForm] = useState<SiteForm>(emptySiteForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Site | null>(null);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/settings/sites', { credentials: 'include' });
      if (res.ok) setSites(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSites(); }, [fetchSites]);

  const filtered = sites.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase()) ||
    s.country?.toLowerCase().includes(search.toLowerCase()),
  );

  const openCreate = () => {
    setEditingSite(null);
    setForm(emptySiteForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (site: Site) => {
    setEditingSite(site);
    setForm({
      name: site.name,
      address: site.address ?? '',
      city: site.city ?? '',
      state: site.state ?? '',
      country: site.country ?? '',
      postalCode: site.postalCode ?? '',
      primaryContactName: site.primaryContactName ?? '',
      primaryContactEmail: site.primaryContactEmail ?? '',
      primaryContactPhone: site.primaryContactPhone ?? '',
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);

    const body = {
      name: form.name.trim(),
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      postalCode: form.postalCode || undefined,
      primaryContactName: form.primaryContactName || undefined,
      primaryContactEmail: form.primaryContactEmail || undefined,
      primaryContactPhone: form.primaryContactPhone || undefined,
    };

    try {
      const url = editingSite
        ? `/api/v1/settings/sites/${editingSite.id}`
        : '/api/v1/settings/sites';
      const res = await fetch(url, {
        method: editingSite ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save');
      }
      setModalOpen(false);
      void fetchSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (site: Site) => {
    try {
      const res = await fetch(`/api/v1/settings/sites/${site.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        setError(data.error ?? 'Failed to delete');
        return;
      }
      setDeleteConfirm(null);
      void fetchSites();
    } catch {
      setError('Failed to delete');
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon path={mdiMapMarkerOutline} size={1.1} color="var(--accent-primary)" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Sites &amp; Locations
          </h1>
        </div>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          borderRadius: 8, border: 'none', backgroundColor: 'var(--accent-primary)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          <Icon path={mdiPlus} size={0.75} color="#fff" />
          Add Site
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 320 }}>
        <Icon path={mdiMagnify} size={0.75} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: 10 }} />
        <input
          placeholder="Search sites..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...fieldStyle, paddingLeft: 34 }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon path={mdiLoading} size={1.5} spin color="var(--text-muted)" />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon path={mdiMapMarkerOutline} size={2} color="var(--text-muted)" style={{ opacity: 0.3 }} />
          <p>{sites.length === 0 ? 'No sites configured yet.' : 'No sites match your search.'}</p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Location</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Contact</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Users</th>
                <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Assets</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((site) => (
                <tr key={site.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{site.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                    {[site.city, site.state, site.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                    {site.primaryContactName || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon path={mdiAccountMultiple} size={0.55} color="var(--text-muted)" />
                      {site._count.users}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon path={mdiPackageVariantClosed} size={0.55} color="var(--text-muted)" />
                      {site._count.assets}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button onClick={() => openEdit(site)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
                      <Icon path={mdiPencilOutline} size={0.7} color="currentColor" />
                    </button>
                    <button onClick={() => setDeleteConfirm(site)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--accent-danger)' }}>
                      <Icon path={mdiDeleteOutline} size={0.7} color="currentColor" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={() => setModalOpen(false)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            backgroundColor: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 25px -5px var(--shadow-lg)', maxWidth: 560, width: '90%', padding: 28, zIndex: 999,
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                {editingSite ? 'Edit Site' : 'New Site'}
              </h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
                <Icon path={mdiClose} size={0.85} color="currentColor" />
              </button>
            </div>

            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: '#fef2f2', color: '#991b1b', fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Site Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={fieldStyle} placeholder="e.g., Headquarters" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={fieldStyle} placeholder="Street address" />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={fieldStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>State / Province</label>
                <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Postal Code</label>
                <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} style={fieldStyle} />
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '18px 0' }} />

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Primary Contact Name</label>
              <input value={form.primaryContactName} onChange={(e) => setForm({ ...form, primaryContactName: e.target.value })} style={fieldStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Contact Email</label>
                <input type="email" value={form.primaryContactEmail} onChange={(e) => setForm({ ...form, primaryContactEmail: e.target.value })} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input type="tel" value={form.primaryContactPhone} onChange={(e) => setForm({ ...form, primaryContactPhone: e.target.value })} style={fieldStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setModalOpen(false)} style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-primary)',
                backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                backgroundColor: 'var(--accent-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Saving...' : editingSite ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={() => setDeleteConfirm(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            backgroundColor: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 25px -5px var(--shadow-lg)', maxWidth: 400, width: '90%', padding: 28, zIndex: 999,
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Delete &ldquo;{deleteConfirm.name}&rdquo;?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
              {deleteConfirm._count.users > 0 || deleteConfirm._count.assets > 0
                ? `This site has ${deleteConfirm._count.users} users and ${deleteConfirm._count.assets} assets assigned. Reassign them before deleting.`
                : 'This action cannot be undone.'}
            </p>
            {error && (
              <div style={{ padding: '8px 12px', borderRadius: 6, backgroundColor: '#fef2f2', color: '#991b1b', fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setDeleteConfirm(null); setError(null); }} style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-primary)',
                backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={() => void handleDelete(deleteConfirm)}
                disabled={deleteConfirm._count.users > 0 || deleteConfirm._count.assets > 0}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  backgroundColor: 'var(--accent-danger)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  opacity: (deleteConfirm._count.users > 0 || deleteConfirm._count.assets > 0) ? 0.5 : 1,
                }}
              >Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
