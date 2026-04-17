---
status: partial
phase: 07-ci-reference-table-migration
source: [07-VERIFICATION.md]
started: 2026-04-17T22:55:00Z
updated: 2026-04-17T22:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. CMDB form dropdowns render from reference-table fetches (CREF-05 UI smoke)
expected: Open `/dashboard/cmdb/new` in dev (https://10.1.200.218:3000 or wherever your dev web serves), confirm the Class / Status / Environment / Relationship-Type dropdowns are populated from API fetches (not a hard-coded list). Submit a new CI and verify in the DB it has FK ids set, not legacy enum strings. Playwright spec exists at `apps/web/tests/cmdb-ref-table-dropdowns.spec.ts` if you'd rather automate.
result: [pending]

### 2. AI chat answers "how many servers do we have?" using JOIN cmdb_ci_classes (CAI-01 LLM smoke)
expected: Open the staff AI assistant in dev, ask "how many servers do we have?". Confirm: (a) the response cites a count, (b) the SQL plan visible in dev mode contains `JOIN cmdb_ci_classes` (not the legacy `WHERE type = 'server'` pattern). LLM behavior is non-deterministic so this can't be automated cleanly.
result: [pending]

### 3. Database REJECTS duplicate (sourceId, targetId, relationshipTypeId) inserts (CREF-04 unique index smoke)
expected: SSH to dev → `docker exec meridian-postgres psql -U meridian -d meridian` → manually attempt to INSERT a duplicate row into cmdb_relationships with the same (sourceId, targetId, relationshipTypeId) as an existing row. Postgres should reject with a unique constraint violation on `cmdb_relationships_sourceId_targetId_relationshipTypeId_key`. (Index existence is already confirmed; this exercises the actual REJECT.)
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
