'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiDomain,
  mdiPlus,
  mdiPencil,
  mdiTrashCan,
  mdiCheckCircle,
  mdiCloseCircle,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string;
  name: string;
  vendorType: 'hardware' | 'software' | 'cloud' | 'service_provider';
  supportUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
}

const VENDOR_TYPE_LABELS: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  cloud: 'Cloud',
  service_provider: 'Service Provider',
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 100,
        padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500,
        backgroundColor: type === 'success' ? '#065f46' : '#991b1b', color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

// ─── Vendor Modal ─────────────────────────────────────────────────────────────

function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [vendorType, setVendorType] = useState(vendor?.vendorType ?? 'hardware');
  const [supportUrl, setSupportUrl] = useState(vendor?.supportUrl ?? '');
  const [contactEmail, setContactEmail] = useState(vendor?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(vendor?.contactPhone ?? '');
  const [isActive, setIsActive] = useState(vendor?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        vendorType,
        supportUrl: supportUrl.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        isActive,
      };
      const url = vendor ? `/api/v1/cmdb/vendors/${vendor.id}` : '/api/v1/cmdb/vendors';
      const res = await fetch(url, {
        method: vendor ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save vendor');
      }
      onSaved(vendor ? 'Vendor updated successfully' : 'Vendor created successfully');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 500, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Vendor Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Dell Technologies" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="vendorType" style={labelStyle}>Vendor Type *</label>
            <select id="vendorType" value={vendorType} onChange={(e) => setVendorType(e.target.value as Vendor['vendorType'])} style={inputStyle}>
              <option value="hardware">Hardware</option>
              <option value="software">Software</option>
              <option value="cloud">Cloud</option>
              <option value="service_provider">Service Provider</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="supportUrl" style={labelStyle}>Support URL</label>
            <input id="supportUrl" type="url" value={supportUrl} onChange={(e) => setSupportUrl(e.target.value)} placeholder="https://support.example.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="contactEmail" style={labelStyle}>Contact Email</label>
            <input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="support@example.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="contactPhone" style={labelStyle}>Contact Phone</label>
            <input id="contactPhone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 (555) 123-4567" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="isActive" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>Active</label>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : vendor ? 'Save Changes' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CMDB Vendors Page ────────────────────────────────────────────────────────

export default function CMDBVendorsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery<Vendor[]>({
    queryKey: ['cmdb-vendors'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/vendors', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load vendors');
      const json = await res.json();
      return Array.isArray(json) ? json : json.vendors ?? json.data ?? [];
    },
  });

  const handleDelete = async (vendor: Vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cmdb/vendors/${vendor.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to delete vendor');
      }
      setToast({ message: 'Vendor deleted', type: 'success' });
      void qc.invalidateQueries({ queryKey: ['cmdb-vendors'] });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const vendors = data ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Link href="/dashboard/cmdb/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>
          <Link href="/dashboard/cmdb" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CMDB</Link>
          {' > '}
          <Link href="/dashboard/cmdb/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Settings</Link>
          {' > Vendors'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiDomain} size={1} color="#d97706" />
          Vendors
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditVendor(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Vendor
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading vendors...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Contact Email</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Active</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{v.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 500,
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}>
                      {VENDOR_TYPE_LABELS[v.vendorType] ?? v.vendorType}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: v.contactEmail ? 'var(--text-secondary)' : 'var(--text-placeholder)', fontSize: 13 }}>
                    {v.contactEmail ?? '--'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Icon path={v.isActive ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={v.isActive ? '#059669' : '#9ca3af'} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditVendor(v); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No vendors defined yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <VendorModal
          vendor={editVendor}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => {
            setToast({ message: msg, type: 'success' });
            void qc.invalidateQueries({ queryKey: ['cmdb-vendors'] });
          }}
        />
      )}
    </div>
  );
}
