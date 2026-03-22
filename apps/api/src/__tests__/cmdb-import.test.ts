import { describe, it } from 'vitest';

/**
 * CMDB bulk import service unit test stubs.
 * Covers CMDB-10 (CSV/JSON bulk import) and per-row validation behaviors.
 *
 * All tests are pending (it.todo) until implementation plans are executed.
 * Wave 0 scaffold — behavioral contract established before implementation.
 */

describe('CmdbImportService', () => {
  it.todo('imports valid CSV rows as CIs');

  it.todo('rejects rows with missing required fields');

  it.todo('rejects rows with invalid CI type');

  it.todo('returns per-row error details for invalid rows');

  it.todo('imports good rows even when some rows have errors');

  it.todo('reports success/skip/error counts');
});
