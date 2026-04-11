'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VendorType = 'hardware' | 'software' | 'cloud' | 'service_provider';

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  hardware: 'Hardware',
  software: 'Software',
  cloud: 'Cloud',
  service_provider: 'Service Provider',
};

/**
 * Canonical vendor shape used everywhere the vendor modal/picker appears.
 * Mirrors the prisma CmdbVendor model minus tenant/timestamps.
 */
export interface Vendor {
  id: string;
  name: string;
  vendorType: VendorType | null;
  websiteUrl: string | null;
  supportUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  accountNumber: string | null;
  accountManagerName: string | null;
  accountManagerEmail: string | null;
  notes: string | null;
  isActive: boolean;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-secondary)',
  borderRadius: 7,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit' as const,
};

const labelStyle = {
  display: 'block',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600 as const,
  color: 'var(--text-secondary)',
};

// ─── VendorModal ──────────────────────────────────────────────────────────────

/**
 * Create or edit a vendor in a modal dialog. Used from:
 *   - the CMDB vendors settings page (full CRUD)
 *   - the VendorPicker inline-create flow on CI create/edit forms
 *
 * Posts to /api/v1/cmdb/vendors (create) or PUTs to /:id (edit) and calls
 * `onSaved` with the fresh record so callers can auto-select it.
 */
export function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | null;
  onClose: () => void;
  onSaved: (saved: Vendor) => void;
}) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [vendorType, setVendorType] = useState<VendorType>(vendor?.vendorType ?? 'hardware');
  const [websiteUrl, setWebsiteUrl] = useState(vendor?.websiteUrl ?? '');
  const [supportUrl, setSupportUrl] = useState(vendor?.supportUrl ?? '');
  const [contactEmail, setContactEmail] = useState(vendor?.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(vendor?.contactPhone ?? '');
  const [accountNumber, setAccountNumber] = useState(vendor?.accountNumber ?? '');
  const [accountManagerName, setAccountManagerName] = useState(vendor?.accountManagerName ?? '');
  const [accountManagerEmail, setAccountManagerEmail] = useState(vendor?.accountManagerEmail ?? '');
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [isActive, setIsActive] = useState(vendor?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vendor name is required');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        vendorType,
        websiteUrl: websiteUrl.trim() || null,
        supportUrl: supportUrl.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        accountNumber: accountNumber.trim() || null,
        accountManagerName: accountManagerName.trim() || null,
        accountManagerEmail: accountManagerEmail.trim() || null,
        notes: notes.trim() || null,
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
      const saved = (await res.json()) as Vendor;
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        // Click outside = cancel
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 640,
          overflow: 'auto',
          maxHeight: '92vh',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            {vendor ? 'Edit Vendor' : 'Add Vendor'}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {vendor
              ? 'Update vendor / manufacturer details.'
              : 'Create a new vendor or manufacturer record. Used from CMDB CI forms and the vendor management page.'}
          </p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Identity */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="vendor-name" style={labelStyle}>Vendor Name *</label>
              <input
                id="vendor-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Dell Technologies"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="vendor-type" style={labelStyle}>Vendor Type</label>
              <select
                id="vendor-type"
                value={vendorType}
                onChange={(e) => setVendorType(e.target.value as VendorType)}
                style={inputStyle}
              >
                {Object.entries(VENDOR_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* URLs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="vendor-website" style={labelStyle}>Website</label>
              <input
                id="vendor-website"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://www.dell.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="vendor-support-url" style={labelStyle}>Support Portal URL</label>
              <input
                id="vendor-support-url"
                type="url"
                value={supportUrl}
                onChange={(e) => setSupportUrl(e.target.value)}
                placeholder="https://support.dell.com"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Generic support contact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="vendor-email" style={labelStyle}>Support Email</label>
              <input
                id="vendor-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="support@dell.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="vendor-phone" style={labelStyle}>Support Phone</label>
              <input
                id="vendor-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 (800) 555-0100"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Account relationship */}
          <div
            style={{
              padding: 12,
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}
            >
              Account Relationship
            </div>
            <div style={{ marginBottom: 10 }}>
              <label htmlFor="vendor-account-number" style={labelStyle}>Account / Customer Number</label>
              <input
                id="vendor-account-number"
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Your customer ID with this vendor"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label htmlFor="vendor-account-mgr-name" style={labelStyle}>Account Manager Name</label>
                <input
                  id="vendor-account-mgr-name"
                  type="text"
                  value={accountManagerName}
                  onChange={(e) => setAccountManagerName(e.target.value)}
                  placeholder="Jane Doe"
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="vendor-account-mgr-email" style={labelStyle}>Account Manager Email</label>
                <input
                  id="vendor-account-mgr-email"
                  type="email"
                  value={accountManagerEmail}
                  onChange={(e) => setAccountManagerEmail(e.target.value)}
                  placeholder="jane.doe@dell.com"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="vendor-notes" style={labelStyle}>Notes</label>
            <textarea
              id="vendor-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }}
              placeholder="Partner code, escalation notes, renewal reminders…"
            />
          </div>

          {/* Active toggle */}
          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="vendor-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="vendor-active" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Active (visible in CI selection dropdowns)
            </label>
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--badge-red-bg-subtle)',
                border: '1px solid #fecaca',
                borderRadius: 7,
                marginBottom: 14,
                color: '#dc2626',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 14,
                cursor: 'pointer',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '8px 18px',
                backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Saving…' : vendor ? 'Save Changes' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
