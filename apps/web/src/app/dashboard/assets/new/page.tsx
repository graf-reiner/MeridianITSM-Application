'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiDesktopClassic, mdiAlertCircle, mdiContentSave, mdiArrowLeft, mdiServerNetwork, mdiMagnify, mdiClose } from '@mdi/js';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

const STATUSES = ['IN_STOCK', 'DEPLOYED', 'IN_REPAIR', 'RETIRED', 'DISPOSED'] as const;

const sectionStyle = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 12,
  marginBottom: 16,
  overflow: 'hidden' as const,
};

const sectionHeaderStyle = {
  padding: '12px 18px',
  borderBottom: '1px solid var(--border-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'var(--bg-secondary)',
};

const labelStyle = { display: 'block' as const, marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' };

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-secondary)',
  borderRadius: 7,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit' as const,
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

interface AssetTypeOption {
  id: string;
  name: string;
  color: string | null;
}

interface CiSearchResult {
  id: string;
  ciNumber: number;
  name: string;
  hostname: string | null;
  type: string;
  manufacturer: { name: string } | null;
}

interface CiDetail {
  id: string;
  ciNumber: number;
  name: string;
  hostname: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  manufacturer: { name: string } | null;
  serverExt: { osFamily: string | null; osVersion: string | null; cpuCores: number | null; ramGb: number | null } | null;
  endpointExt: { osFamily: string | null; osVersion: string | null } | null;
}

export default function NewAssetPage() {
  const router = useRouter();

  const [assetTypeId, setAssetTypeId] = useState('');
  const [assetTypes, setAssetTypes] = useState<AssetTypeOption[]>([]);
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [hostname, setHostname] = useState('');
  const [status, setStatus] = useState<string>('IN_STOCK');
  const [operatingSystem, setOperatingSystem] = useState('');
  const [osVersion, setOsVersion] = useState('');
  const [cpuModel, setCpuModel] = useState('');
  const [cpuCores, setCpuCores] = useState('');
  const [ramGb, setRamGb] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // CI picker state
  const [selectedCi, setSelectedCi] = useState<{ id: string; label: string } | null>(null);
  const [ciSearch, setCiSearch] = useState('');
  const [ciResults, setCiResults] = useState<CiSearchResult[]>([]);
  const [ciLoading, setCiLoading] = useState(false);

  const searchCis = async (query: string) => {
    if (query.length < 2) { setCiResults([]); return; }
    try {
      const res = await fetch(`/api/v1/cmdb/cis?search=${encodeURIComponent(query)}&pageSize=8`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json() as { data: CiSearchResult[] };
      setCiResults(data.data ?? []);
    } catch { /* ignore */ }
  };

  const selectCi = async (ci: CiSearchResult) => {
    setCiLoading(true);
    setCiSearch('');
    setCiResults([]);
    setSelectedCi({ id: ci.id, label: `CI-${ci.ciNumber}: ${ci.name}` });

    // Fetch full CI detail to auto-populate fields
    try {
      const res = await fetch(`/api/v1/cmdb/cis/${ci.id}`, { credentials: 'include' });
      if (!res.ok) return;
      const detail = await res.json() as CiDetail;

      // Auto-populate fields from CI data (only if field is currently empty)
      if (!hostname && detail.hostname) setHostname(detail.hostname);
      if (!serialNumber && detail.serialNumber) setSerialNumber(detail.serialNumber);
      if (!manufacturer && detail.manufacturer?.name) setManufacturer(detail.manufacturer.name);

      // Server extension data
      if (detail.serverExt) {
        if (!operatingSystem && detail.serverExt.osFamily) setOperatingSystem(detail.serverExt.osFamily);
        if (!osVersion && detail.serverExt.osVersion) setOsVersion(detail.serverExt.osVersion);
        if (!cpuCores && detail.serverExt.cpuCores) setCpuCores(String(detail.serverExt.cpuCores));
        if (!ramGb && detail.serverExt.ramGb) setRamGb(String(detail.serverExt.ramGb));
      }

      // Endpoint extension data (fallback for OS)
      if (detail.endpointExt && !detail.serverExt) {
        if (!operatingSystem && detail.endpointExt.osFamily) setOperatingSystem(detail.endpointExt.osFamily);
        if (!osVersion && detail.endpointExt.osVersion) setOsVersion(detail.endpointExt.osVersion);
      }
    } catch { /* ignore */ }
    finally { setCiLoading(false); }
  };

  const clearCi = () => {
    setSelectedCi(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { status };
    if (assetTypeId) body.assetTypeId = assetTypeId;
    if (manufacturer.trim()) body.manufacturer = manufacturer.trim();
    if (model.trim()) body.model = model.trim();
    if (serialNumber.trim()) body.serialNumber = serialNumber.trim();
    if (hostname.trim()) body.hostname = hostname.trim();
    if (operatingSystem.trim()) body.operatingSystem = operatingSystem.trim();
    if (osVersion.trim()) body.osVersion = osVersion.trim();
    if (cpuModel.trim()) body.cpuModel = cpuModel.trim();
    if (cpuCores) body.cpuCores = parseInt(cpuCores, 10);
    if (ramGb) body.ramGb = parseInt(ramGb, 10);
    if (purchaseDate) body.purchaseDate = purchaseDate;
    if (purchaseCost) body.purchaseCost = parseFloat(purchaseCost);
    if (warrantyExpiry) body.warrantyExpiry = warrantyExpiry;

    try {
      const res = await fetch('/api/v1/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to create asset (${res.status})`);
      }
      const asset = (await res.json()) as { id: string };

      // If a CI was selected, link it to the new asset
      if (selectedCi) {
        await fetch(`/api/v1/assets/${asset.id}/link-ci`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ciId: selectedCi.id }),
        }).catch(() => {}); // Non-critical — asset was created successfully
      }

      router.push(`/dashboard/assets/${asset.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Assets', href: '/dashboard/assets' }, { label: 'New Asset' }]} />

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon path={mdiDesktopClassic} size={1.1} color="var(--accent-primary)" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>New Asset</h1>
        </div>

        {/* Populate from CI */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <Icon path={mdiServerNetwork} size={0.8} color="var(--accent-primary)" />
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Populate from Configuration Item</h2>
            <span style={{ fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 400 }}>(optional)</span>
          </div>
          <div style={{ padding: 18 }}>
            {selectedCi ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon path={mdiServerNetwork} size={0.7} color="var(--accent-primary)" />
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{selectedCi.label}</span>
                <button
                  type="button"
                  onClick={clearCi}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-placeholder)' }}
                  title="Remove CI"
                >
                  <Icon path={mdiClose} size={0.7} color="currentColor" />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon path={mdiMagnify} size={0.7} color="var(--text-placeholder)" />
                  <input
                    type="text"
                    value={ciSearch}
                    onChange={(e) => { setCiSearch(e.target.value); void searchCis(e.target.value); }}
                    placeholder="Search CIs by name, hostname, or IP to auto-populate fields..."
                    disabled={ciLoading}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
                {ciLoading && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Loading CI data...</p>
                )}
                {ciResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, maxHeight: 200, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {ciResults.map((ci) => (
                      <button
                        key={ci.id}
                        type="button"
                        onClick={() => void selectCi(ci)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)' }}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>CI-{ci.ciNumber}: {ci.name}</div>
                          {ci.hostname && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ci.hostname}{ci.manufacturer ? ` — ${ci.manufacturer.name}` : ''}</div>}
                        </div>
                        <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                          {ci.type?.replace(/_/g, ' ')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hardware */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Hardware</h2>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {assetTypes.length > 0 && (
              <div>
                <label style={labelStyle}>Type</label>
                <select value={assetTypeId} onChange={(e) => setAssetTypeId(e.target.value)} style={inputStyle}>
                  <option value="">-- Select type --</option>
                  {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Manufacturer</label>
              <input type="text" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} style={inputStyle} placeholder="e.g. Dell, HP, Lenovo" />
            </div>
            <div>
              <label style={labelStyle}>Model</label>
              <input type="text" value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle} placeholder="e.g. PowerEdge R740" />
            </div>
            <div>
              <label style={labelStyle}>Serial Number</label>
              <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} style={inputStyle} placeholder="Manufacturer serial" />
            </div>
            <div>
              <label style={labelStyle}>Hostname</label>
              <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} style={inputStyle} placeholder="e.g. PROD-WEB-01" />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Specs */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Specs</h2>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Operating System</label>
              <input type="text" value={operatingSystem} onChange={(e) => setOperatingSystem(e.target.value)} style={inputStyle} placeholder="e.g. Ubuntu, Windows Server" />
            </div>
            <div>
              <label style={labelStyle}>OS Version</label>
              <input type="text" value={osVersion} onChange={(e) => setOsVersion(e.target.value)} style={inputStyle} placeholder="e.g. 22.04 LTS" />
            </div>
            <div>
              <label style={labelStyle}>CPU Model</label>
              <input type="text" value={cpuModel} onChange={(e) => setCpuModel(e.target.value)} style={inputStyle} placeholder="e.g. Xeon Gold 6248" />
            </div>
            <div>
              <label style={labelStyle}>CPU Cores</label>
              <input type="number" min="1" value={cpuCores} onChange={(e) => setCpuCores(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>RAM (GB)</label>
              <input type="number" min="1" value={ramGb} onChange={(e) => setRamGb(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Procurement */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Procurement</h2>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle}>Purchase Date</label>
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Purchase Cost (USD)</label>
              <input type="number" min="0" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Warranty Expiry</label>
              <input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--accent-danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon path={mdiAlertCircle} size={0.8} color="currentColor" />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 40 }}>
          <Link href="/dashboard/assets" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 13, textDecoration: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontWeight: 500 }}>
            <Icon path={mdiArrowLeft} size={0.75} color="currentColor" />
            Cancel
          </Link>
          <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', backgroundColor: saving ? '#a5b4fc' : 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            <Icon path={mdiContentSave} size={0.8} color="currentColor" />
            {saving ? 'Creating…' : 'Create Asset'}
          </button>
        </div>
      </form>
    </div>
  );
}
