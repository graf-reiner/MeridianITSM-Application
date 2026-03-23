import { describe, it } from 'vitest';

/**
 * API Key Management Routes Test Scaffolds
 *
 * Wave 0 stubs — behavioral contracts before implementation.
 * Requirements: INTG-01
 */
describe('API Key Routes', () => {
  // ─── API Key Creation (INTG-01) ───────────────────────────────────────────────

  it.todo('POST /settings/api-keys creates key and returns full key once (INTG-01)');
  it.todo('POST /settings/api-keys stores SHA-256 hash, not raw key (INTG-01)');
  it.todo('POST /settings/api-keys stores prefix from first 8 chars (INTG-01)');
  it.todo('POST /settings/api-keys requires admin permission (INTG-01)');

  // ─── API Key Listing (INTG-01) ────────────────────────────────────────────────

  it.todo('GET /settings/api-keys lists keys without full key value (INTG-01)');
  it.todo('GET /settings/api-keys returns prefix, scopes, lastUsedAt (INTG-01)');

  // ─── API Key Revocation (INTG-01) ─────────────────────────────────────────────

  it.todo('DELETE /settings/api-keys/:id revokes key by setting isActive=false (INTG-01)');
  it.todo('DELETE /settings/api-keys/:id is tenant-scoped (INTG-01)');
});
