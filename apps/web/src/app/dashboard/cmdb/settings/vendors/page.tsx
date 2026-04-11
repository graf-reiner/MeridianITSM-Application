'use client';

import { useState, useMemo } from 'react';
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
  mdiMagnify,
  mdiFilterVariant,
  mdiAccountTieOutline,
  mdiOpenInNew,
} from '@mdi/js';
import { VendorModal, VENDOR_TYPE_LABELS, type Vendor, type VendorType } from '@/components/VendorModal';

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 200,
        padding: '12px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        backgroundColor: type === 'success' ? '#065f46' : '#991b1b',
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

// ─── CMDB Vendors Page ────────────────────────────────────────────────────────

export default function CMDBVendorsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | VendorType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const { data, isLoading } = useQuery<Vendor[]>({
    queryKey: ['cmdb-vendors', 'all'],
    queryFn: async () => {
      // Load ALL vendors (including inactive) for the management page.
      const res = await fetch('/api/v1/cmdb/vendors', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load vendors');
      const json = (await res.json()) as Vendor[] | { data?: Vendor[]; vendors?: Vendor[] };
      return Array.isArray(json) ? json : (json.data ?? json.vendors ?? []);
    },
  });

  const vendors = data ?? [];

  // Derived counts for filter chips
  const counts = useMemo(() => {
    const c = { all: vendors.length, active: 0, inactive: 0 };
    for (const v of vendors) (v.isActive ? c.active++ : c.inactive++);
    return c;
  }, [vendors]);

  // Filtered view
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (typeFilter !== 'ALL' && v.vendorType !== typeFilter) return false;
      if (statusFilter === 'ACTIVE' && !v.isActive) return false;
      if (statusFilter === 'INACTIVE' && v.isActive) return false;
      if (q) {
        // Search across name + email + account manager name + notes
        const hay = [
          v.name,
          v.contactEmail ?? '',
          v.accountManagerName ?? '',
          v.accountManagerEmail ?? '',
          v.accountNumber ?? '',
          v.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vendors, search, typeFilter, statusFilter]);

  const handleDelete = async (vendor: Vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cmdb/vendors/${vendor.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
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

  const inputStyle = {
    padding: '7px 10px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 7,
    fontSize: 13,
    outline: 'none',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Link
          href="/dashboard/cmdb/settings"
          style={{
            color: 'var(--text-muted)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>
          <Link href="/dashboard/cmdb" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            CMDB
          </Link>
          {' > '}
          <Link
            href="/dashboard/cmdb/settings"
            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            Settings
          </Link>
          {' > Vendors'}
        </span>
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiDomain} size={1} color="#d97706" />
          Vendors / Manufacturers
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => {
              setEditVendor(null);
              setShowModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Vendor
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <Icon
            path={mdiMagnify}
            size={0.7}
            color="var(--text-placeholder)"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, account manager, notes…"
            style={{ ...inputStyle, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }}
          />
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFilterVariant} size={0.7} color="var(--text-muted)" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            style={inputStyle}
          >
            <option value="ALL">All types</option>
            {Object.entries(VENDOR_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => {
            const active = statusFilter === s;
            const label =
              s === 'ALL' ? `All (${counts.all})` : s === 'ACTIVE' ? `Active (${counts.active})` : `Inactive (${counts.inactive})`;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 600,
                  border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                  backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-primary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading vendors…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            padding: 48,
            textAlign: 'center',
          }}
        >
          <Icon path={mdiDomain} size={2} color="var(--text-placeholder)" />
          <p style={{ margin: '12px 0 4px', fontSize: 14, color: 'var(--text-secondary)' }}>
            {vendors.length === 0 ? 'No vendors defined yet.' : 'No vendors match these filters.'}
          </p>
          {vendors.length === 0 && (
            <button
              onClick={() => {
                setEditVendor(null);
                setShowModal(true);
              }}
              style={{
                marginTop: 12,
                padding: '7px 14px',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add your first vendor
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '2px solid var(--border-primary)',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  {['Name', 'Type', 'Website', 'Account Manager', 'Account #', 'Active', 'Actions'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 14px',
                        textAlign: h === 'Active' ? 'center' : 'left',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => (
                  <tr
                    key={v.id}
                    style={{
                      borderBottom: '1px solid var(--bg-tertiary)',
                      backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined,
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {v.name}
                      {v.notes && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                            maxWidth: 260,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={v.notes}
                        >
                          {v.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {v.vendorType ? VENDOR_TYPE_LABELS[v.vendorType] ?? v.vendorType : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {v.websiteUrl ? (
                        <a
                          href={v.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--accent-primary)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Icon path={mdiOpenInNew} size={0.55} color="currentColor" />
                          Open
                        </a>
                      ) : v.supportUrl ? (
                        <a
                          href={v.supportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--accent-primary)',
                            textDecoration: 'none',
                            fontSize: 12,
                          }}
                        >
                          Support
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-placeholder)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {v.accountManagerName || v.accountManagerEmail ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Icon path={mdiAccountTieOutline} size={0.65} color="var(--text-muted)" />
                          <div>
                            {v.accountManagerName && (
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                {v.accountManagerName}
                              </div>
                            )}
                            {v.accountManagerEmail && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {v.accountManagerEmail}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : v.contactEmail ? (
                        <span
                          style={{ color: 'var(--text-secondary)', fontSize: 12 }}
                          title="Generic support email"
                        >
                          {v.contactEmail}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-placeholder)' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '10px 14px',
                        color: v.accountNumber ? 'var(--text-primary)' : 'var(--text-placeholder)',
                        fontFamily: v.accountNumber ? 'monospace' : undefined,
                        fontSize: 12,
                      }}
                    >
                      {v.accountNumber ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <Icon
                        path={v.isActive ? mdiCheckCircle : mdiCloseCircle}
                        size={0.8}
                        color={v.isActive ? '#059669' : '#9ca3af'}
                      />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            setEditVendor(v);
                            setShowModal(true);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            border: '1px solid var(--border-secondary)',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                            backgroundColor: 'var(--bg-primary)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Icon path={mdiPencil} size={0.65} color="currentColor" />
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(v)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            border: '1px solid #fecaca',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                            backgroundColor: 'var(--bg-primary)',
                            color: '#dc2626',
                          }}
                        >
                          <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <VendorModal
          vendor={editVendor}
          onClose={() => setShowModal(false)}
          onSaved={(saved) => {
            setToast({
              message: editVendor ? 'Vendor updated successfully' : `Vendor "${saved.name}" created`,
              type: 'success',
            });
            void qc.invalidateQueries({ queryKey: ['cmdb-vendors'] });
          }}
        />
      )}
    </div>
  );
}
