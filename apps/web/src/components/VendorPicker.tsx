'use client';

import { useState, useEffect, useCallback } from 'react';
import { VendorModal, type Vendor } from './VendorModal';

/**
 * A vendor / manufacturer dropdown with an inline "+ Add new vendor…"
 * option that opens VendorModal, auto-selects the newly created vendor,
 * and adds it to the local cache so a page reload isn't needed.
 *
 * Used from the CMDB CI create + edit forms.
 *
 * Fetches from /api/v1/cmdb/vendors?activeOnly=true so inactive vendors
 * never appear as selectable options.
 */
export function VendorPicker({
  value,
  onChange,
  style,
  id,
  onVendorCreated,
}: {
  value: string;
  onChange: (vendorId: string) => void;
  style?: React.CSSProperties;
  id?: string;
  /**
   * Fires when a new vendor was created via the inline modal — lets the
   * parent (e.g. the CI create wizard) keep its own lookup table in sync
   * so the review step can still display the vendor name without a
   * refetch.
   */
  onVendorCreated?: (vendor: Vendor) => void;
}) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/cmdb/vendors?activeOnly=true', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load vendors');
      const json = (await res.json()) as Vendor[] | { data?: Vendor[] };
      const list = Array.isArray(json) ? json : (json.data ?? []);
      setVendors(list);
    } catch {
      // swallow — caller sees empty dropdown and can retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVendors();
  }, [fetchVendors]);

  const NEW_SENTINEL = '__new__';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === NEW_SENTINEL) {
      setShowModal(true);
      // Important: don't propagate the sentinel to the parent
      return;
    }
    onChange(v);
  };

  const handleSaved = (saved: Vendor) => {
    // Merge into the in-memory list (sorted by name)
    setVendors((prev) => {
      const next = [...prev.filter((v) => v.id !== saved.id), saved];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
    onChange(saved.id);
    onVendorCreated?.(saved);
  };

  return (
    <>
      <select
        id={id}
        value={value}
        onChange={handleChange}
        style={style}
        disabled={loading}
      >
        <option value="">-- Select --</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
        <option value={NEW_SENTINEL} style={{ fontStyle: 'italic' }}>
          + Add new vendor…
        </option>
      </select>

      {showModal && (
        <VendorModal
          vendor={null}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
