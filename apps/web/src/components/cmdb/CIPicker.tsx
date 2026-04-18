'use client';

import { useState, useEffect, useCallback, type ReactElement } from 'react';

/**
 * Phase 8 (D-04): CMDB CI search picker with type-ahead. Used from the Asset
 * detail page's "Link a CI" empty state when the operator wants to attach
 * an Asset to an existing CI.
 *
 * SKELETON — Wave 0 ships an inert placeholder. Wave 5 (plan 08-06) wires
 * the actual fetch + select callback per the analog at
 * apps/web/src/components/VendorPicker.tsx (copy the fetchCis + useEffect
 * debounce pattern verbatim from VendorPicker.tsx:39-65).
 *
 * Multi-tenancy (CLAUDE.md Rule 1): server-side enforced via
 * /api/v1/cmdb/cis tenant filter on the authenticated user's session
 * (no client-side tenant param). Wave 5 wiring MUST NOT add a tenantId
 * query parameter — the existing `/api/v1/cmdb/cis` endpoint already
 * scopes by tenantId from the session JWT. (T-8-01-05 mitigation.)
 */
export interface CIOption {
  id: string;
  name: string;
  ciNumber: number;
  classKey: string;
}

export function CIPicker(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (ciId: string) => void;
}): ReactElement | null {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_query, _setQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_cis, _setCis] = useState<CIOption[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loading, _setLoading] = useState(false);

  // Wave 5 implementation: copy the fetchCis + useEffect debounce pattern
  // verbatim from apps/web/src/components/VendorPicker.tsx:39-65.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _fetchCis = useCallback(async (_search: string) => {
    // Wave 5: GET /api/v1/cmdb/cis?search=...  (credentials: 'include')
  }, []);

  useEffect(() => {
    // Wave 5: setTimeout 250ms debounce on _query, invoke _fetchCis.
  }, []);

  if (!props.open) return null;
  return (
    <div data-testid="ci-picker-skeleton" style={{ padding: 16 }}>
      <p>CIPicker — Wave 5 implementation pending</p>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </div>
  );
}
