'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiDesktopClassic,
  mdiArrowLeft,
  mdiPencil,
  mdiCheck,
  mdiClose,
} from '@mdi/js';
import RichTextField from '@/components/RichTextField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetDetail {
  id: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  hostname: string | null;
  operatingSystem: string | null;
  cpuModel: string | null;
  ramGb: number | null;
  status: string;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiry: string | null;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  site: { id: string; name: string } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_STATUSES = ['IN_STOCK', 'DEPLOYED', 'IN_REPAIR', 'RETIRED', 'DISPOSED'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'DEPLOYED':  return { bg: '#d1fae5', text: '#065f46' };
    case 'IN_STOCK':  return { bg: '#dbeafe', text: '#1e40af' };
    case 'IN_REPAIR': return { bg: '#fef3c7', text: '#92400e' };
    case 'RETIRED':   return { bg: '#f3f4f6', text: '#6b7280' };
    case 'DISPOSED':  return { bg: '#f3f4f6', text: '#9ca3af' };
    default:          return { bg: '#f3f4f6', text: '#374151' };
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function getWarrantyStyle(warrantyExpiry: string | null): { color: string; label: string } {
  if (!warrantyExpiry) return { color: '#9ca3af', label: '—' };
  const now = Date.now();
  const expiry = new Date(warrantyExpiry).getTime();
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { color: '#dc2626', label: `Expired ${formatDate(warrantyExpiry)}` };
  if (daysLeft < 30) return { color: '#d97706', label: `Expires ${formatDate(warrantyExpiry)} (${daysLeft}d)` };
  return { color: '#16a34a', label: formatDate(warrantyExpiry) };
}

// ─── Status Lifecycle Bar ─────────────────────────────────────────────────────

function StatusLifecycle({ current }: { current: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      {ASSET_STATUSES.map((s, idx) => {
        const isActive = s === current;
        const style = getStatusStyle(s);
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {idx > 0 && (
              <div style={{ width: 16, height: 2, backgroundColor: '#d1d5db', flexShrink: 0 }} />
            )}
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: isActive ? 700 : 400,
                backgroundColor: isActive ? style.bg : '#f9fafb',
                color: isActive ? style.text : '#9ca3af',
                border: isActive ? `2px solid ${style.text}` : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {s.replace(/_/g, ' ')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Edit Form ────────────────────────────────────────────────────────────────

function EditAssetForm({ asset, onCancel, onSaved }: {
  asset: AssetDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    manufacturer: asset.manufacturer ?? '',
    model: asset.model ?? '',
    serialNumber: asset.serialNumber ?? '',
    hostname: asset.hostname ?? '',
    operatingSystem: asset.operatingSystem ?? '',
    cpuModel: asset.cpuModel ?? '',
    ramGb: asset.ramGb ?? '',
    status: asset.status,
    notes: asset.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, ramGb: form.ramGb ? Number(form.ramGb) : null }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Save failed: ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
      />
    </div>
  );

  return (
    <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Edit Asset</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0 16px' }}>
        {field('Manufacturer', 'manufacturer')}
        {field('Model', 'model')}
        {field('Serial Number', 'serialNumber')}
        {field('Hostname', 'hostname')}
        {field('Operating System', 'operatingSystem')}
        {field('CPU Model', 'cpuModel')}
        {field('RAM (GB)', 'ramGb', 'number')}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, backgroundColor: '#fff' }}
          >
            {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Notes</label>
        <RichTextField
          value={form.notes}
          onChange={(val) => setForm((f) => ({ ...f, notes: val }))}
          placeholder=""
          minHeight={80}
          compact
        />
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          <Icon path={mdiCheck} size={0.8} color="currentColor" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
        >
          <Icon path={mdiClose} size={0.8} color="currentColor" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Asset Detail Page ────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const [editing, setEditing] = useState(false);

  const { data: asset, isLoading, error } = useQuery<AssetDetail>({
    queryKey: ['asset', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/assets/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load asset: ${res.status}`);
      return res.json() as Promise<AssetDetail>;
    },
  });

  const handleSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ['asset', id] });
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    setEditing(false);
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading asset...</div>;
  }
  if (error || !asset) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
      {error instanceof Error ? error.message : 'Asset not found'}
    </div>;
  }

  const statusStyle = getStatusStyle(asset.status);
  const warrantyInfo = getWarrantyStyle(asset.warrantyExpiry);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Back + Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 12 }}
        >
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to Assets
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={mdiDesktopClassic} size={1} color="#4f46e5" />
              {asset.assetTag}
            </h1>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {asset.status.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              <Icon path={mdiPencil} size={0.8} color="currentColor" />
              Edit
            </button>
          )}
        </div>

        {/* Status Lifecycle */}
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lifecycle</p>
          <StatusLifecycle current={asset.status} />
        </div>
      </div>

      {/* ── Edit Form ─────────────────────────────────────────────────────────── */}
      {editing && (
        <EditAssetForm
          asset={asset}
          onCancel={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Two-Column Layout ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: editing ? 16 : 0 }}>

        {/* Asset Details Card */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Hardware Details</h2>
          {[
            ['Manufacturer', asset.manufacturer],
            ['Model', asset.model],
            ['Serial Number', asset.serialNumber],
            ['Hostname', asset.hostname],
            ['Operating System', asset.operatingSystem],
            ['CPU', asset.cpuModel],
            ['RAM', asset.ramGb ? `${asset.ramGb} GB` : null],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
              <span style={{ color: '#6b7280', flexShrink: 0, marginRight: 8 }}>{label}</span>
              <span style={{ color: '#111827', textAlign: 'right', wordBreak: 'break-word' }}>{(value as string | null) ?? '—'}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Assignment Card */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Assignment</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Assigned To</span>
              <span style={{ color: '#111827' }}>
                {asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Site</span>
              <span style={{ color: '#111827' }}>{asset.site?.name ?? '—'}</span>
            </div>
          </div>

          {/* Purchase Card */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Purchase & Warranty</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Purchase Date</span>
              <span style={{ color: '#111827' }}>{formatDate(asset.purchaseDate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Purchase Cost</span>
              <span style={{ color: '#111827' }}>{formatCurrency(asset.purchaseCost)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span style={{ color: '#6b7280' }}>Warranty</span>
              <span style={{ color: warrantyInfo.color, fontWeight: 500 }}>{warrantyInfo.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────────── */}
      {asset.notes && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginTop: 16 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Notes</h2>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', whiteSpace: 'pre-wrap' }}>{asset.notes}</p>
        </div>
      )}
    </div>
  );
}
