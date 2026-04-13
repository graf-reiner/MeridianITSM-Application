'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import Link from 'next/link';
import {
  mdiDesktopClassic,
  mdiPencil,
  mdiCheck,
  mdiClose,
  mdiServerNetwork,
  mdiPlus,
  mdiDelete,
  mdiMagnify,
} from '@mdi/js';
import RichTextField from '@/components/RichTextField';
import Breadcrumb from '@/components/Breadcrumb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetTypeOption {
  id: string;
  name: string;
  color: string | null;
}

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
  assetType: { id: string; name: string; icon: string | null; color: string | null } | null;
  notes: string | null;
  cmdbConfigItems: Array<{
    id: string;
    ciNumber: number;
    name: string;
    hostname: string | null;
    type: string;
    criticality: string;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_STATUSES = ['IN_STOCK', 'DEPLOYED', 'IN_REPAIR', 'RETIRED', 'DISPOSED'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'DEPLOYED':  return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_STOCK':  return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'IN_REPAIR': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'RETIRED':   return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    case 'DISPOSED':  return { bg: 'var(--bg-tertiary)', text: '#9ca3af' };
    default:          return { bg: 'var(--bg-tertiary)', text: '#374151' };
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
  if (!warrantyExpiry) return { color: 'var(--text-placeholder)', label: '—' };
  const now = Date.now();
  const expiry = new Date(warrantyExpiry).getTime();
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { color: 'var(--accent-danger)', label: `Expired ${formatDate(warrantyExpiry)}` };
  if (daysLeft < 30) return { color: 'var(--accent-warning)', label: `Expires ${formatDate(warrantyExpiry)} (${daysLeft}d)` };
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
              <div style={{ width: 16, height: 2, backgroundColor: 'var(--border-secondary)', flexShrink: 0 }} />
            )}
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: isActive ? 700 : 400,
                backgroundColor: isActive ? style.bg : 'var(--bg-secondary)',
                color: isActive ? style.text : 'var(--text-placeholder)',
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

interface CiResult {
  id: string;
  ciNumber: number;
  name: string;
  hostname: string | null;
  type: string;
  criticality: string;
}

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
  const [assetTypeId, setAssetTypeId] = useState(asset.assetType?.id ?? '');
  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/settings/asset-types', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json()) as AssetTypeOption[];
          setAssetTypes(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // CI linking state
  const [linkedCis, setLinkedCis] = useState<CiResult[]>(asset.cmdbConfigItems ?? []);
  const [ciSearch, setCiSearch] = useState('');
  const [ciResults, setCiResults] = useState<CiResult[]>([]);
  const [ciLinking, setCiLinking] = useState(false);

  const searchCis = async (query: string) => {
    if (query.length < 2) { setCiResults([]); return; }
    try {
      const res = await fetch(`/api/v1/cmdb/cis?search=${encodeURIComponent(query)}&pageSize=8`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { data: CiResult[] };
      // Filter out already-linked CIs
      const linkedIds = new Set(linkedCis.map((c) => c.id));
      setCiResults((data.data ?? []).filter((c) => !linkedIds.has(c.id)));
    } catch { /* ignore */ }
  };

  const linkCi = async (ci: CiResult) => {
    setCiLinking(true);
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}/link-ci`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ciId: ci.id }),
      });
      if (res.ok) {
        setLinkedCis((prev) => [...prev, ci]);
        setCiSearch('');
        setCiResults([]);
      }
    } catch { /* ignore */ }
    finally { setCiLinking(false); }
  };

  const unlinkCi = async (ciId: string) => {
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}/link-ci/${ciId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setLinkedCis((prev) => prev.filter((c) => c.id !== ciId));
      }
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/assets/${asset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, ramGb: form.ramGb ? Number(form.ramGb) : null, assetTypeId: assetTypeId || null }),
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
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
      />
    </div>
  );

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 20, marginTop: 16 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Edit Asset</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0 16px' }}>
        {assetTypes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Type</label>
            <select
              value={assetTypeId}
              onChange={(e) => setAssetTypeId(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, backgroundColor: 'var(--bg-primary)' }}
            >
              <option value="">-- No type --</option>
              {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        {field('Manufacturer', 'manufacturer')}
        {field('Model', 'model')}
        {field('Serial Number', 'serialNumber')}
        {field('Hostname', 'hostname')}
        {field('Operating System', 'operatingSystem')}
        {field('CPU Model', 'cpuModel')}
        {field('RAM (GB)', 'ramGb', 'number')}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, backgroundColor: 'var(--bg-primary)' }}
          >
            {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes</label>
        <RichTextField
          value={form.notes}
          onChange={(val) => setForm((f) => ({ ...f, notes: val }))}
          placeholder=""
          minHeight={80}
          compact
        />
      </div>
      {/* CI Linking Section */}
      <div style={{ marginBottom: 16, padding: 16, borderRadius: 8, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon path={mdiServerNetwork} size={0.8} color="var(--accent-primary)" />
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Linked Configuration Items</h4>
        </div>

        {/* Currently linked CIs */}
        {linkedCis.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {linkedCis.map((ci) => (
              <div key={ci.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, backgroundColor: 'var(--bg-secondary)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-primary)' }}>CI-{ci.ciNumber}: {ci.name}{ci.hostname ? ` (${ci.hostname})` : ''}</span>
                <button
                  onClick={() => void unlinkCi(ci.id)}
                  title="Unlink CI"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-placeholder)' }}
                >
                  <Icon path={mdiDelete} size={0.7} color="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search to add */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiMagnify} size={0.7} color="var(--text-placeholder)" />
            <input
              type="text"
              value={ciSearch}
              onChange={(e) => { setCiSearch(e.target.value); void searchCis(e.target.value); }}
              placeholder="Search CIs by name, hostname, or CI number..."
              disabled={ciLinking}
              style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          {ciResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, maxHeight: 160, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {ciResults.map((ci) => (
                <button
                  key={ci.id}
                  onClick={() => void linkCi(ci)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 10px', borderBottom: '1px solid var(--border-primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)' }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>CI-{ci.ciNumber}: {ci.name}</div>
                    {ci.hostname && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ci.hostname}</div>}
                  </div>
                  <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 11, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    {ci.type?.replace(/_/g, ' ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p style={{ color: 'var(--accent-danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          <Icon path={mdiCheck} size={0.8} color="currentColor" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
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
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading asset...</div>;
  }
  if (error || !asset) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
      {error instanceof Error ? error.message : 'Asset not found'}
    </div>;
  }

  const statusStyle = getStatusStyle(asset.status);
  const warrantyInfo = getWarrantyStyle(asset.warrantyExpiry);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Breadcrumb + Header ──────────────────────────────────────────────── */}
      <Breadcrumb items={[
        { label: 'Assets', href: '/dashboard/assets' },
        { label: asset.assetTag },
      ]} />
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={mdiDesktopClassic} size={1} color="var(--accent-primary)" />
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              <Icon path={mdiPencil} size={0.8} color="currentColor" />
              Edit
            </button>
          )}
        </div>

        {/* Status Lifecycle */}
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lifecycle</p>
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
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Hardware Details</h2>
          {asset.assetType && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>Type</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500, backgroundColor: asset.assetType.color ? `${asset.assetType.color}22` : 'var(--bg-tertiary)', color: asset.assetType.color ?? 'var(--text-secondary)', border: `1px solid ${asset.assetType.color ?? 'var(--border-secondary)'}44` }}>
                {asset.assetType.name}
              </span>
            </div>
          )}
          {[
            ['Manufacturer', asset.manufacturer],
            ['Model', asset.model],
            ['Serial Number', asset.serialNumber],
            ['Hostname', asset.hostname],
            ['Operating System', asset.operatingSystem],
            ['CPU', asset.cpuModel],
            ['RAM', asset.ramGb ? `${asset.ramGb} GB` : null],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>{label}</span>
              <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{(value as string | null) ?? '—'}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Assignment Card */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Assignment</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Assigned To</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Site</span>
              <span style={{ color: 'var(--text-primary)' }}>{asset.site?.name ?? '—'}</span>
            </div>
          </div>

          {/* Purchase Card */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Purchase & Warranty</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Purchase Date</span>
              <span style={{ color: 'var(--text-primary)' }}>{formatDate(asset.purchaseDate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Purchase Cost</span>
              <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(asset.purchaseCost)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
              <span style={{ color: 'var(--text-muted)' }}>Warranty</span>
              <span style={{ color: warrantyInfo.color, fontWeight: 500 }}>{warrantyInfo.label}</span>
            </div>
          </div>

          {/* Linked CIs Card */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Icon path={mdiServerNetwork} size={0.8} color="var(--accent-primary)" />
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Linked Configuration Items</h2>
            </div>
            {asset.cmdbConfigItems && asset.cmdbConfigItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {asset.cmdbConfigItems.map((ci) => (
                  <Link
                    key={ci.id}
                    href={`/dashboard/cmdb/${ci.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-primary)',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                        CI-{ci.ciNumber}: {ci.name}
                      </div>
                      {ci.hostname && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ci.hostname}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}>
                        {ci.type?.replace(/_/g, ' ')}
                      </span>
                      {ci.criticality && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: ci.criticality === 'CRITICAL' ? 'var(--badge-red-bg)' : ci.criticality === 'HIGH' ? 'var(--badge-orange-bg)' : 'var(--bg-tertiary)',
                          color: ci.criticality === 'CRITICAL' ? '#991b1b' : ci.criticality === 'HIGH' ? '#9a3412' : 'var(--text-secondary)',
                        }}>
                          {ci.criticality}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>
                No linked configuration items. Use the Edit button to link CIs to this asset.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────────── */}
      {asset.notes && (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20, marginTop: 16 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Notes</h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{asset.notes}</p>
        </div>
      )}
    </div>
  );
}
