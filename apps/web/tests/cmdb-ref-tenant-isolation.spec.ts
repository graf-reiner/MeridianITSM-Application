import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsTenantBAdmin } from './helpers';

/**
 * Phase 7 (CREF-05 multi-tenancy E2E): tenant A admin must not see tenant B
 * reference data and vice versa.
 *
 * Guarded by HAS_SECOND_TEST_TENANT because the dev DB does not yet have a
 * tenant-b admin fixture. When the fixture ships, CI sets the env flag and
 * the test activates automatically.
 *
 * Threat ref: T-7-01-03 — cross-tenant ref-table leak is a CRITICAL security
 * regression. Zero overlap of UUIDs is the canonical gate.
 */
test.describe('CMDB reference data tenant isolation (CREF-05 multi-tenancy)', () => {
  test.skip(
    !process.env.HAS_SECOND_TEST_TENANT,
    'requires HAS_SECOND_TEST_TENANT=1 + tenant-b admin fixture in dev DB',
  );

  test('Tenant A admin cannot see tenant B reference data', async ({ page, request }) => {
    // Step 1: as tenant A, list classes
    await loginAsAdmin(page, '/dashboard/cmdb/settings/classes');
    const tenantAResponse = await request.get('/api/v1/cmdb/classes');
    expect(tenantAResponse.ok()).toBe(true);
    const tenantAJson = await tenantAResponse.json();
    const tenantAClassIds = new Set<string>(
      ((tenantAJson.data ?? tenantAJson) as Array<{ id: string }>).map((c) => c.id),
    );

    // Step 2: as tenant B, list classes
    await loginAsTenantBAdmin(page, '/dashboard/cmdb/settings/classes');
    const tenantBResponse = await request.get('/api/v1/cmdb/classes');
    expect(tenantBResponse.ok()).toBe(true);
    const tenantBJson = await tenantBResponse.json();
    const tenantBClassIds = new Set<string>(
      ((tenantBJson.data ?? tenantBJson) as Array<{ id: string }>).map((c) => c.id),
    );

    // Assert: zero overlap of UUIDs
    const intersection = [...tenantAClassIds].filter((id) => tenantBClassIds.has(id));
    expect(intersection).toEqual([]);
    expect(tenantAClassIds.size).toBeGreaterThan(0);
    expect(tenantBClassIds.size).toBeGreaterThan(0);
  });
});
