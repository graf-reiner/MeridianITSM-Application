'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiDesktopClassic, mdiAlertCircle, mdiContentSave, mdiArrowLeft } from '@mdi/js';
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

export default function NewAssetPage() {
  const router = useRouter();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = { status };
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

        {/* Hardware */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Hardware</h2>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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

        {/* CI linking hint */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          You can link Configuration Items (CIs) to this asset after creating it, from the asset detail page.
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
