# CSDM Field Ownership Contract

**Status:** Authoritative — governs all Asset / CMDB / Application / Service changes.
**Scope:** `Asset`, `CmdbConfigurationItem` (+ typed extensions), `Application`, `CmdbService` (service tier).
**ITIL basis:** ITIL 4 Asset Management + Service Configuration Management (SCM) + Application Portfolio Management (APM), aligned to the ServiceNow Common Service Data Model (CSDM) reference architecture.

---

## Purpose

Every data point in the Asset / CMDB / Application / Service domain must have **exactly one authoritative owner**. All other places the value appears are either:

- **Joined reads** (a view through a relation), or
- **Controlled syncs** (an explicit propagation written in a named service function, triggered on a named event).

What is **not** permitted: the same semantic value stored independently on two tables, with no sync and no derivation rule. That is the "clutter and misalignment" this contract exists to eliminate.

---

## The contract

| Domain concern | Owner model | Owned fields | Readers | Sync policy |
|---|---|---|---|---|
| **Financial / procurement** | `Asset` | `assetTag`, `purchaseDate`, `purchaseCost`, `warrantyExpiry`, `assetTypeId`, `assignedToId` (custodian), `stockSiteId`, `notes` | CI and Application read via join | Asset is a leaf. No outbound sync. |
| **Physical identity** | `Asset` | `serialNumber`, `manufacturer`, `model` | CI reads via `assetId` join — does **not** store its own copy | Asset → CI is a **view**, not a copy. |
| **Operational / technical** | `CmdbConfigurationItem` + typed extensions (`CmdbCiServer`, `CmdbCiEndpoint`, `CmdbCiNetwork`, `CmdbCiApplication`, `CmdbCiDatabase`, `CmdbCiCloud`, future extensions) | `hostname`, `fqdn`, `ipAddress`, `operatingSystem`, `osVersion`, `cpuCount`, `cpuModel`, `memoryGb`, `storageGb`, `disks`, `networkInterfaces`, `softwareInventory`, `classId`, `lifecycleStatusId`, `operationalStatusId`, `environmentId`, `siteId` (deployed site) | Asset UI reads via the `Asset.cmdbConfigItems` reverse relation | Discovery agents write to CI only — never to Asset. |
| **Portfolio / APM** | `Application` | `name`, `type`, `criticality`, `hostingModel`, `lifecycleStage`, `rpo`, `rto`, `strategicRating`, `vendorContact`, `licenseInfo`, `techStack` | Primary CI reads via the `Application.primaryCiId` bridge | On Application update, `criticality` propagates to `primaryCi.criticality` (single named sync in `application.service.ts`). |
| **Service / consumer** | `CmdbService` extension on a Service-class CI | `serviceCategory` (`business` \| `application` \| `technical`), `customerScope`, `availabilityTarget`, `rtoMinutes`, `rpoMinutes` | Applications link via the `ServiceApplication` join | Service-level. **SLAs attach only to Service**, never directly to Application. |

---

## Separation of concerns (semantic definitions)

- **Asset** = the **financial record**. What did we pay for? Who owns it? When does the warranty run out? When we retire it, what happens to the book value?
- **CmdbConfigurationItem** = the **operational record**. What's running? What's its state right now? What depends on it? How does it relate to everything else?
- **Application** = the **portfolio record**. What business capability does this software deliver? Who owns the product? What's its lifecycle stage in our portfolio?
- **CmdbService** (Service-class CI + extension) = the **consumer record**. What does the customer actually consume? What's the SLA? What's the business impact if it's down?

These four concerns are disjoint. A field that feels like it belongs on two of them is a sign that either (a) the field is misnamed, or (b) it should be on one and read through a join from the other.

---

## Resolved structural decisions

| ID | Decision | Rationale |
|---|---|---|
| D0.1 | `Asset.hostname` is **dropped entirely**. Asset detail reads hostname via `Asset.cmdbConfigItems[0].hostname`. | No denormalized copies. Contract rule: single authoritative owner (CI). |
| D0.2 | ITIL Requested / Ordered / Received asset states are **deferred**. Current `AssetStatus` (`IN_STOCK`, `DEPLOYED`, `IN_REPAIR`, `RETIRED`, `DISPOSED`) stays. | Scope discipline — unrelated to the clutter problem. Address in a future procurement milestone if needed. |
| D0.3 | `Asset.siteId` is **renamed to `stockSiteId`**. `CmdbConfigurationItem.siteId` is the **deployed** site. Both are legal because they represent different semantic concepts. | The previous overlap was accidental — a stockroom and a deployment are not the same location. Renaming makes the distinction explicit. |
| D3.1 | `CmdbConfigurationItem.assetId` is **nullable**. A nightly reconciliation report surfaces orphan CIs (hardware-class CIs with no linked Asset). | Real-world discovery finds devices on the network before procurement records catch up. Blocking discovery on the Asset record existing first would hide shadow IT. |
| D5.2 | **SLAs attach only to Service**. Applications inherit their SLA via the Service they belong to. | CSDM discipline. If SLAs could attach to both Service and Application, there would be no deterministic answer to "what's the SLA for this ticket" when both are set. |

---

## Rules every future change must follow

1. **If a field exists on two models today, the phase that touches it must pick one owner, convert the loser to a derived/joined accessor in both the API DTO and the UI, and drop the loser column.** No two columns with the same semantic meaning may coexist after the phase that retires the loser.
2. **All new models are `tenantId`-scoped** — see `CLAUDE.md` rule #1.
3. **Every schema change updates both AI contexts** — `apps/api/src/services/ai-schema-context.ts` (staff AI) and `apps/api/src/services/portal-schema-context.ts` (end-user AI). See `CLAUDE.md` rule #6.
4. **Destructive schema changes split into two deploys** — Deploy A writes to the new target, reads from it with a legacy fallback; Deploy B drops the legacy column one release later, gated by a pre-flight check ("zero rows where legacy column IS NOT NULL AND new FK IS NULL per tenant").
5. **Reference tables over enums** — CSDM favours typed reference data so vocabulary can evolve per tenant without schema migrations. New typed dimensions go to a reference table, not a new enum.
6. **Sync logic lives in exactly one place per sync direction** — named service function, named event. No "also update X over here" side effects scattered across handlers. If it's a sync, it's in a service method with a name like `syncApplicationCriticalityToPrimaryCi()`.

---

## Relationship to the master migration plan

This document is the Phase 0 deliverable of the CSDM Alignment master plan at `C:\Users\greiner\.claude\plans\curious-wondering-tarjan.md`. All later phases (1 through 8) enforce and extend this contract. Do not modify the contract without updating the master plan.
