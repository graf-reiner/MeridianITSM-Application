# Phase 8: Retire Asset Hardware/OS Duplication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 08-retire-asset-hardware-os-duplication
**Areas discussed:** Migration conflict policy & legacy column lifecycle, Asset detail page Technical Profile UX, CmdbSoftwareInstalled schema, Inventory-agent ingestion contract

---

## Migration Conflict Policy & Legacy Column Lifecycle

### Q1: When the data migration runs and Asset has data while CI's CmdbCiServer extension already has DIFFERENT data — what's the policy?

| Option | Description | Selected |
|--------|-------------|----------|
| CI wins silently, Asset value logged | Per ROADMAP: CI is source of truth. Log Asset value to cmdb_migration_audit with status 'overwritten_by_ci' and continue. Maximum throughput, no human gating. | ✓ |
| CI wins, but block release if any conflicts logged | Migration completes but verify gate FAILS if any audit rows exist. Operator must explicitly resolve. | |
| CI wins for all fields except osVersion/hostname (Asset wins for those) | Per-field policy. Some fields more recent on Asset, others on CI. | |

**User's choice:** CI wins silently, Asset value logged
**Notes:** Aligned with ROADMAP wording. Keeps migration unblocked; audit table preserves forensic data.

### Q2: Lifecycle of the 10 Asset columns being retired

| Option | Description | Selected |
|--------|-------------|----------|
| Drop in Phase 8 migration (clean cut) | Backfill, then DROP the 10 columns. Schema is cleanest. Rollback requires new migration. | ✓ |
| Rename to _legacy in Phase 8, drop in Phase 14 | Safer rollback window. Mirrors Phase 7 strategy. | |
| Drop in Phase 8 but keep migration's INSERT SQL ready for rollback | Drop now (clean), generate rollback.sql alongside. | |

**User's choice:** Drop in Phase 8 migration (clean cut)
**Notes:** Cleanest end-state. Audit table is the rollback safety net.

---

## Asset Detail Page Technical Profile UX

### Q3: Where on the Asset detail page does the read-only Technical Profile panel render?

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Technical Profile' tab next to Overview/Activity | Clean separation. Familiar pattern. | ✓ |
| Inline section on Overview tab, below ownership info | Always visible, no extra click. Could feel crowded. | |
| Collapsed accordion in the right sidebar | Compact, expandable. May be missed. | |

**User's choice:** New 'Technical Profile' tab
**Notes:** Matches existing dashboard tab convention.

### Q4: What happens when an Asset has NO linked CI (orphan Asset)?

| Option | Description | Selected |
|--------|-------------|----------|
| Show empty state with 'Link a CI' button → opens picker | Surfaces gap actively, lets user link or create. | ✓ |
| Hide the Technical Profile panel entirely | Cleanest visually but no signal to user. | |
| Show panel with all fields as 'Not available — no CI linked' | Visible but empty; no call-to-action. | |

**User's choice:** Show empty state with 'Link a CI' button → opens picker
**Notes:** Phase 9 handles bulk reconciliation; this gives Phase 8 a working degraded state.

---

## CmdbSoftwareInstalled Schema (CASR-03)

### Q5: Beyond ciId + name + version, what columns does CmdbSoftwareInstalled need?

| Option | Description | Selected |
|--------|-------------|----------|
| Vendor + publisher + installDate + source + licenseKey (Recommended) | Full schema for license reporting. Enables both presence + license tracking. | ✓ |
| Minimal: vendor + installDate + source | Skip publisher and licenseKey. Simpler. | |
| Match Windows WMI / dpkg / Homebrew output verbatim | Optimizes for agent fidelity over reporting. | |

**User's choice:** Vendor + publisher + installDate + source + licenseKey (Recommended)
**Notes:** plus `lastSeenAt` (added per Q6 dedup mechanism).

### Q6: Dedup policy when an agent reports the same software across multiple inventory cycles

| Option | Description | Selected |
|--------|-------------|----------|
| Unique constraint on (ciId, name, version) — upsert each cycle | Same name+version = same row. lastSeenAt updated. New version = new row. History by version. | ✓ |
| Unique constraint on (ciId, name) — latest version wins, history lost | Single row per software per CI. No version history. | |
| Append-only with timestamp — no unique constraint | Full audit, unbounded growth. | |

**User's choice:** Unique on (ciId, name, version) with lastSeenAt
**Notes:** Reconciliation worker (existing) cleans stale rows by lastSeenAt threshold.

---

## Inventory-Agent Ingestion Contract (CASR-06)

### Q7: How should Phase 8 reroute writes to the CI?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side translates (no agent change) — Recommended | Existing endpoint accepts Asset-shaped payload. Server translates to CI writes. Zero agent fleet redeploy. | ✓ |
| Update agent + server, both new shape (clean break) | New endpoint, agent rebuild required. Cleaner long-term. | |
| Add new endpoint, deprecate old via response header | Phased rollout, both code paths until migration. | |

**User's choice:** Server-side translates (no agent change)
**Notes:** Avoids the operational complexity of an agent fleet redeploy. Future v3 agent can adopt CI-shaped endpoint if desired.

### Q8: If an inventory snapshot arrives for an Asset with NO linked CI, what does upsertServerExtensionByAsset do?

| Option | Description | Selected |
|--------|-------------|----------|
| Create a CI on-the-fly with class='server' (or inferred), link to Asset, then write extension | Auto-create. 'Just works'. Reuses Phase 7 resolver + worker's inferClassKeyFromSnapshot. | ✓ |
| Reject with 409 Conflict, log to dead-letter queue | Strict; forces explicit hygiene. | |
| Write to cmdb_pending_inventory staging table, surface for review | Highest data quality, operational burden. | |

**User's choice:** Auto-create CI, link Asset, write extension
**Notes:** Mirrors existing CMDB reconciliation worker's create-on-first-heartbeat behavior.

---

## Claude's Discretion

- License reporting query SQL shape (criterion 5)
- Migration ordering within the Phase 8 migration file
- Inferred class heuristic for orphan-Asset auto-create (D-08) — reuse existing `inferClassKeyFromSnapshot`
- `cmdb_migration_audit` exact column list

## Deferred Ideas

- Per-field conflict policy (rejected in favor of CI-wins-all)
- License-management UI dashboard (future ITAM phase)
- Bulk Asset → CI link wizard (Phase 9 handles)
- Software publisher normalization (future cleanup)
- Soft-delete / archive of dropped Asset columns (clean drop chosen)
- Agent endpoint versioning / Deprecation header (no agent change chosen)
