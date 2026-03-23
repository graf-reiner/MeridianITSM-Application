import { describe, it } from 'vitest';

// ─── External API Routes — Behavioral Contracts ───────────────────────────────
//
// Test scaffolds for external API endpoints (INTG-02).
// These stubs document expected behaviors before full integration tests are written.

describe('GET /api/external/tickets', () => {
  it.todo('returns tenant-scoped tickets (INTG-02)');
  it.todo('returns paginated result with total, page, pageSize');
  it.todo('filters by status when provided');
});

describe('POST /api/external/tickets', () => {
  it.todo('creates ticket via API key (INTG-02)');
  it.todo('returns 400 if title is missing');
  it.todo('fires TICKET_CREATED webhook after creation');
});

describe('GET /api/external/assets', () => {
  it.todo('returns tenant-scoped assets (INTG-02)');
  it.todo('returns paginated result with total, page, pageSize');
});

describe('GET /api/external/cis', () => {
  it.todo('returns tenant-scoped CIs (INTG-02)');
  it.todo('returns paginated result with total, page, pageSize');
});

describe('scope enforcement', () => {
  it.todo('missing tickets.read scope returns 403 on GET /tickets (INTG-01)');
  it.todo('missing tickets.write scope returns 403 on POST /tickets (INTG-01)');
  it.todo('missing assets.read scope returns 403 on GET /assets (INTG-01)');
  it.todo('missing ci.read scope returns 403 on GET /cis (INTG-01)');
});
