'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import Link from 'next/link';
import {
  mdiDesktopClassic,
  mdiPencil,
  mdiCheck,
  mdiClose,
  mdiServerNetwork,
  mdiDelete,
  mdiMagnify,
  mdiInformationOutline,
  mdiHistory,
  mdiLink,
  mdiLinkOff,
} from '@mdi/js';
import RichTextField from '@/components/RichTextField';
import Breadcrumb from '@/components/Breadcrumb';
import { CIPicker } from '@/components/cmdb/CIPicker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetTypeOption {
  id: string;
  name: string;
  color: string | null;
}

// Phase 8 Wave 5 (CASR-01 / Pitfall 6): the Asset row no longer carries
// hostname / operatingSystem / cpuModel / ramGb. Hardware / OS / software
// details live on the linked CI's CmdbCiServer extension and the
// CmdbSoftwareInstalled normalized table. The Technical Profile tab below
// renders them from the CI side.
interface AssetDetail {
  id: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
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

// Phase 8 Wave 5: Technical Profile data lives on the linked CI. The shape
// returned by /api/v1/cmdb/cis/:id may include a serverExt object with the
// Wave 1 hardware columns (cpuCount, cpuModel, memoryGb, etc.).
interface CmdbCiServerExt {
  hostname: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  cpuModel: string | null;
  cpuCount: number | null;
  memoryGb: number | null;
  domainName: string | null;
}
interface CmdbCiDetail {
  id: string;
  ciNumber: number;
  name: string;
  hostname: string | null;
  serverExt?: CmdbCiServerExt | null;
}

interface CmdbSoftwareItem {
  name: string;
  version: string;
  vendor: string | null;
  publisher: string | null;
  lastSeenAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASSET_STATUSES = ['IN_STOCK', 'DEPLOYED', 'IN_REPAIR', 'RETIRED', 'DISPOSED'] as const;

type Tab = 'overview' | 'activity' | 'technical-profile';
const TAB_DEFS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: mdiInformationOutline },
  { key: 'activity', label: 'Activity', icon: mdiHistory },
  { key: 'technical-profile', label: 'Technical Profile', icon: mdiServerNetwork },
];

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

// ─── Searchable Type Select ──────────────────────────────────────────────────

function SearchableTypeSelect({
  types,
  value,
  onChange,
}: {
  types: AssetTypeOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = types.find((t) => t.id === value);
  const filtered = search
    ? types.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : types;

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(true);
  };

  return (
    <div ref={triggerRef} style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Type</label>
      {selected && !open ? (
        <div
          onClick={() => { setSearch(''); openDropdown(); }}
          style={{
            width: '100%',
            padding: '7px 10px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            fontSize: 14,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selected.color && (
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: selected.color, flexShrink: 0 }} />
            )}
            {selected.name}
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            style={{ cursor: 'pointer', color: 'var(--text-placeholder)', fontSize: 16, lineHeight: 1 }}
            title="Clear"
          >
            &times;
          </span>
        </div>
      ) : (
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); openDropdown(); }}
          onFocus={openDropdown}
          placeholder="Search asset types..."
          autoComplete="off"
          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
        />
      )}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 6,
            maxHeight: 240,
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-placeholder)' }}>No types found</div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onChange(t.id); setOpen(false); setSearch(''); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-primary)',
                    background: t.id === value ? 'var(--bg-secondary)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                  }}
                >
                  {t.color && (
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: t.color, flexShrink: 0 }} />
                  )}
                  {t.name}
                </button>
              ))
            )}
          </div>
        </>
      )}
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

// Phase 8 Wave 5 (CASR-01): the EditAssetForm no longer accepts hostname /
// operatingSystem / cpuModel / ramGb. Those fields are owned by the linked
// CI's CmdbCiServer extension. Operators update hardware/OS/software in the
// CMDB UI; the Asset edit form focuses on financial/ownership/identifier
// fields only.
function EditAssetForm({ asset, onCancel, onSaved }: {
  asset: AssetDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    manufacturer: asset.manufacturer ?? '',
    model: asset.model ?? '',
    serialNumber: asset.serialNumber ?? '',
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
        body: JSON.stringify({ ...form, assetTypeId: assetTypeId || null }),
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
        name={key as string}
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
          <SearchableTypeSelect
            types={assetTypes}
            value={assetTypeId}
            onChange={setAssetTypeId}
          />
        )}
        {field('Manufacturer', 'manufacturer')}
        {field('Model', 'model')}
        {field('Serial Number', 'serialNumber')}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>Status</label>
          <select
            name="status"
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

      {/* Phase 8: hardware/OS fields are intentionally ABSENT. See Technical
          Profile tab on the detail page for read-only CI-owned values. */}

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

// ─── Technical Profile Panel (D-03) ───────────────────────────────────────────

function TechnicalProfilePanel({ ciId, active }: { ciId: string; active: boolean }) {
  // Multi-tenancy: /api/v1/cmdb/cis/:id server-side filters by the session
  // tenantId (T-8-05-05 mitigation owned by plan 05). No client-side tenant
  // parameter passed.
  const { data: ci, isLoading: ciLoading } = useQuery<CmdbCiDetail>({
    queryKey: ['cmdb-ci', ciId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cmdb/cis/${ciId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load CI: ${res.status}`);
      return res.json() as Promise<CmdbCiDetail>;
    },
    enabled: active,
  });

  const { data: softwareRes, isLoading: softwareLoading } = useQuery<{ data: CmdbSoftwareItem[] }>({
    queryKey: ['cmdb-ci-software', ciId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cmdb/cis/${ciId}/software`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load software: ${res.status}`);
      return res.json() as Promise<{ data: CmdbSoftwareItem[] }>;
    },
    enabled: active,
  });

  if (ciLoading || !ci) return <p style={{ color: 'var(--text-muted)' }}>Loading technical profile…</p>;
  const ext = ci.serverExt ?? null;
  const software = softwareRes?.data ?? [];

  return (
    <div data-testid="technical-profile-panel">
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Hardware &amp; Operating System</h3>
        {[
          ['Hostname', ci.hostname ?? ext?.hostname ?? null],
          ['Operating System', ext?.operatingSystem ?? null],
          ['OS Version', ext?.osVersion ?? null],
          ['CPU', ext ? `${ext.cpuCount ?? '?'} × ${ext.cpuModel ?? 'Unknown'}` : null],
          ['Memory', ext?.memoryGb != null ? `${ext.memoryGb} GB` : null],
          ['Domain', ext?.domainName ?? null],
        ].map(([label, value]) => (
          <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>{label}</span>
            <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{(value as string | null) ?? '—'}</span>
          </div>
        ))}
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
          Source: CMDB —{' '}
          <Link href={`/dashboard/cmdb/${ci.id}`} style={{ color: 'var(--accent-primary)' }}>
            CI-{ci.ciNumber}: {ci.name}
          </Link>
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Installed Software</h3>
        {softwareLoading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : software.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>No software recorded on this CI.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {software.map((s, idx) => (
              <li key={`${s.name}:${s.version}:${idx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  {s.name}{s.version ? ` ${s.version}` : ''}
                  {s.vendor && <span style={{ color: 'var(--text-muted)' }}> — {s.vendor}</span>}
                </span>
                <span style={{ color: 'var(--text-placeholder)', fontSize: 12 }}>
                  Last seen {formatDate(s.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
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
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

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
  const linkedCi = asset.cmdbConfigItems?.[0];

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

      {/* ── Tab Nav (Phase 8 D-03) ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-primary)',
          marginBottom: 20,
          gap: 0,
          overflowX: 'auto',
          marginTop: editing ? 16 : 0,
        }}
      >
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`tab-${tab.key}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent-primary)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 14,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: -1,
            }}
          >
            <Icon path={tab.icon} size={0.8} color="currentColor" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

            {/* Asset Details Card */}
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Identifiers</h2>
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
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{(value as string | null) ?? '—'}</span>
                </div>
              ))}
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
                Hardware, OS, and software details live on the linked CI — see the{' '}
                <strong>Technical Profile</strong> tab above.
              </p>
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
        </>
      )}

      {/* ── Activity Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Activity</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>
            Asset activity feed — coming in a later phase. For change-management records touching this
            Asset, see Changes linked to any of this Asset&rsquo;s Configuration Items.
          </p>
        </div>
      )}

      {/* ── Technical Profile Tab (D-03 + D-04) ──────────────────────────────── */}
      {activeTab === 'technical-profile' && (
        !linkedCi ? (
          <div
            data-testid="technical-profile-empty"
            style={{
              textAlign: 'center',
              padding: 40,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 10,
            }}
          >
            <Icon path={mdiLinkOff} size={2} color="var(--text-muted)" />
            <h3 style={{ margin: '16px 0 8px', fontSize: 16, fontWeight: 600 }}>
              No linked Configuration Item
            </h3>
            <p style={{ maxWidth: 480, margin: '0 auto 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
              This Asset isn&rsquo;t linked to a Configuration Item. Hardware, OS, and software
              details live on CIs in CMDB. <strong>Link a CI</strong> to see the technical
              profile here, or <strong>Create a new CI</strong> if none exists.
            </p>
            <button
              type="button"
              onClick={() => setLinkPickerOpen(true)}
              data-testid="link-ci-button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon path={mdiLink} size={0.8} color="currentColor" /> Link a CI
            </button>
          </div>
        ) : (
          <TechnicalProfilePanel ciId={linkedCi.id} active={activeTab === 'technical-profile'} />
        )
      )}

      {/* ── CIPicker modal (D-04) ─────────────────────────────────────────────── */}
      <CIPicker
        open={linkPickerOpen}
        onClose={() => setLinkPickerOpen(false)}
        onSelect={async (ciId) => {
          // PATCH /api/v1/cmdb/cis/:id with { assetId } — route added in plan 05
          // Task 3. Server-side dual-tenant guard (plan 05 T-8-05-09): asset
          // and CI must both belong to the session tenant.
          try {
            const res = await fetch(`/api/v1/cmdb/cis/${ciId}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assetId: asset.id }),
            });
            if (res.ok) {
              // Refetch asset detail so the orphan empty state disappears.
              void queryClient.invalidateQueries({ queryKey: ['asset', id] });
            }
          } catch {
            /* surfaced via UI refresh failure; user can retry */
          }
        }}
      />
    </div>
  );
}
