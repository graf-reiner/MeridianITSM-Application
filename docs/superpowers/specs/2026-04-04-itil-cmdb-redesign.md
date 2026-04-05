# ITIL-Aligned CMDB Redesign — Design Specification

**Date**: 2026-04-04
**Status**: Draft
**Approach**: Layered Extension (schema → service → integration → frontend)

## Overview

Redesign the existing CMDB from an enum-driven, flat-attribute model to a fully ITIL-aligned, relationship-driven configuration management database. This includes database-backed reference tables, promoted base CI fields, class-specific extension tables, governance workflows, separated ITSM linkage, and full integration with existing Application, Change, Asset, and Ticket modules.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Enums vs tables | Database tables | Tenants can customize CI classes, statuses at runtime |
| Application integration | Link as CI extension | Applications participate in CMDB topology without breaking existing workflows |
| Change linkage | New CmdbChangeLink table | Non-breaking, alongside existing ChangeApplication/ChangeAsset |
| Extension tables | All 6 + Service | Full ITIL coverage; lightweight tables can sit empty until populated |
| Governance | Full implementation | Attestation, duplicate detection, staleness rules, health dashboard |

---

## 1. Reference Tables (Replacing Enums)

### 1.1 CmdbCiClass

Replaces `CmdbCiType` enum. Hierarchical, tenant-scoped.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | Multi-tenant |
| classKey | String | Machine key (e.g., `server`, `virtual_machine`) |
| className | String | Display name |
| parentClassId | String? (UUID, FK → self) | Hierarchy (e.g., `virtual_machine` → `server`) |
| description | String? | Help text |
| icon | String? | MDI icon path for UI |
| isActive | Boolean (default true) | Soft disable |

**Constraints**: `@@unique([tenantId, classKey])`

**Seed values** (14 classes):
- `business_service`, `technical_service`
- `application`, `application_instance`, `saas_application`
- `server`, `virtual_machine`
- `database`
- `network_device`, `load_balancer`
- `storage`
- `cloud_resource`
- `dns_endpoint`, `certificate`
- `generic` (catch-all for unmappable CIs during migration)

Hierarchy examples: `virtual_machine.parentClassId` → `server`, `load_balancer.parentClassId` → `network_device`

### 1.2 CmdbStatus

Replaces `CmdbCiStatus` enum. Supports lifecycle AND operational status types.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | Multi-tenant |
| statusType | String | `lifecycle` or `operational` |
| statusKey | String | Machine key |
| statusName | String | Display name |
| sortOrder | Int (default 0) | UI ordering |
| isActive | Boolean (default true) | Soft disable |

**Constraints**: `@@unique([tenantId, statusType, statusKey])`

**Lifecycle seeds**: `planned`, `ordered`, `installed`, `in_service`, `under_change`, `retired`
**Operational seeds**: `online`, `offline`, `degraded`, `maintenance`, `unknown`

### 1.3 CmdbEnvironment

Replaces `CmdbCiEnvironment` enum.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | Multi-tenant |
| envKey | String | Machine key |
| envName | String | Display name |
| sortOrder | Int (default 0) | UI ordering |
| isActive | Boolean (default true) | Soft disable |

**Constraints**: `@@unique([tenantId, envKey])`

**Seeds**: `prod`, `test`, `dev`, `qa`, `dr`, `lab`

### 1.4 CmdbRelationshipType

Replaces `CmdbRelationshipType` enum. Adds forward/reverse labels.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | Multi-tenant |
| relationshipKey | String | Machine key |
| relationshipName | String | Display name |
| forwardLabel | String | e.g., "runs on" |
| reverseLabel | String | e.g., "hosts" |
| isDirectional | Boolean (default true) | |
| description | String? | Help text |

**Constraints**: `@@unique([tenantId, relationshipKey])`

**Seeds** (13 types):

| Key | Forward Label | Reverse Label |
|---|---|---|
| `depends_on` | depends on | is depended on by |
| `runs_on` | runs on | runs |
| `hosted_on` | is hosted on | hosts |
| `connected_to` | connects to | connects to |
| `member_of` | is member of | has member |
| `replicated_to` | replicates to | is replicated from |
| `backed_up_by` | is backed up by | backs up |
| `uses` | uses | is used by |
| `supports` | supports | is supported by |
| `managed_by` | is managed by | manages |
| `owned_by` | is owned by | owns |
| `contains` | contains | is contained in |
| `installed_on` | is installed on | has installed |

### 1.5 CmdbVendor

New table for manufacturers and vendors.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | Multi-tenant |
| name | String | Vendor name |
| vendorType | String? | `hardware`, `software`, `cloud`, `service_provider` |
| supportUrl | String? | |
| contactEmail | String? | |
| contactPhone | String? | |
| isActive | Boolean (default true) | |

**Constraints**: `@@unique([tenantId, name])`

### 1.6 Support Group Strategy

Rather than a new table, the existing `UserGroup` model gets an optional `isCmdbSupportGroup` Boolean flag. CIs reference `UserGroup` directly via `supportGroupId`. This avoids duplicating group management.

---

## 2. Expanded Base CI Table

### 2.1 New Columns on CmdbConfigurationItem

**Identity & Classification (replacing enums with FKs)**

| Field | Type | Replaces |
|---|---|---|
| classId | String (UUID, FK → CmdbCiClass) | `type` enum |
| lifecycleStatusId | String (UUID, FK → CmdbStatus) | `status` enum |
| operationalStatusId | String? (UUID, FK → CmdbStatus) | new |
| environmentId | String (UUID, FK → CmdbEnvironment) | `environment` enum |

**Network & Hardware (promoted from attributesJson)**

| Field | Type | Purpose |
|---|---|---|
| displayName | String? | Friendly name separate from identifier |
| hostname | String? | Indexed, searchable |
| fqdn | String? | Fully qualified domain name |
| ipAddress | String? | Primary IP |
| serialNumber | String? | Hardware serial |
| assetTag | String? | Asset management tag |
| externalId | String? | External system reference |

**Product Info**

| Field | Type | Purpose |
|---|---|---|
| manufacturerId | String? (UUID, FK → CmdbVendor) | Vendor reference |
| model | String? | Hardware/software model |
| version | String? | Version string |
| edition | String? | e.g., Standard, Enterprise |

**Ownership (dual owner model)**

| Field | Type | Purpose |
|---|---|---|
| businessOwnerId | String? (UUID, FK → User) | Business accountability |
| technicalOwnerId | String? (UUID, FK → User) | Technical responsibility |
| supportGroupId | String? (UUID, FK → UserGroup) | Support routing |

Existing `ownerId` migrates to `technicalOwnerId`, then is dropped.

**Security Classification**

| Field | Type | Purpose |
|---|---|---|
| criticality | String? | `low`, `medium`, `high`, `mission_critical` |
| confidentialityClass | String? | CIA triad |
| integrityClass | String? | CIA triad |
| availabilityClass | String? | CIA triad |

**Governance & Discovery**

| Field | Type | Purpose |
|---|---|---|
| installDate | DateTime? | When deployed |
| firstDiscoveredAt | DateTime? | First seen by any source |
| lastVerifiedAt | DateTime? | Last attestation |
| sourceSystem | String? | `agent`, `manual`, `csv-import`, `cloud-api` |
| sourceRecordKey | String? | External system record ID |
| sourceOfTruth | Boolean (default false) | Authoritative record? |
| reconciliationRank | Int (default 100) | Multi-source conflict priority |
| isDeleted | Boolean (default false) | Soft delete |

**Retained fields**: `id`, `tenantId`, `ciNumber`, `name`, `categoryId`, `assetId`, `agentId`, `siteId`, `attributesJson` (for tenant-specific custom data), `discoveredAt`, `lastSeenAt`, `createdAt`, `updatedAt`

### 2.2 New Indexes

```
hostname, fqdn, externalId, serialNumber, assetTag,
supportGroupId, businessOwnerId, technicalOwnerId,
manufacturerId, classId, lifecycleStatusId, environmentId
```

### 2.3 Updated CmdbRelationship

New columns added:

| Field | Type | Purpose |
|---|---|---|
| relationshipTypeId | String (UUID, FK → CmdbRelationshipType) | Replaces enum |
| sourceSystem | String? | Discovery source |
| sourceRecordKey | String? | External reference |
| confidenceScore | Float? | 0-100 |
| isActive | Boolean (default true) | Soft disable |
| validFrom | DateTime? | Temporal start |
| validTo | DateTime? | Temporal end |

---

## 3. Class-Specific Extension Tables

Each uses CI's `id` as PK (1:1 relationship). Created only when CI's class matches.

### 3.1 CmdbCiServer

For classes: `server`, `virtual_machine`

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| serverType | String | `physical`, `cloud_vm`, `virtual_machine`, `container_host` |
| operatingSystem | String? | e.g., Windows Server, Ubuntu |
| osVersion | String? | e.g., 2022, 22.04 |
| cpuCount | Int? | CPU cores |
| memoryGb | Float? | RAM |
| storageGb | Float? | Total storage |
| domainName | String? | AD domain |
| virtualizationPlatform | String? | e.g., VMware, Hyper-V, KVM |
| hypervisorHostCiId | String? (UUID, FK → CmdbConfigurationItem) | Parent hypervisor |
| backupRequired | Boolean (default false) | |
| backupPolicy | String? | e.g., Daily-30d |
| patchGroup | String? | Patching schedule group |
| antivirusStatus | String? | e.g., active, disabled, unknown |

### 3.2 CmdbCiApplication

For classes: `application`, `application_instance`, `saas_application`. Links to existing Application model.

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| applicationId | String? (UUID, FK → Application) | Bridge to existing model |
| applicationType | String? | `web`, `mobile`, `desktop`, `api`, `service` |
| installType | String? | `standalone`, `clustered`, `distributed` |
| businessFunction | String? | Business process supported |
| repoUrl | String? | Source repository |
| documentationUrl | String? | Docs link |
| primaryLanguage | String? | e.g., TypeScript, C# |
| runtimePlatform | String? | e.g., Node.js, .NET 8 |
| authenticationMethod | String? | e.g., OAuth2, SAML |
| internetFacing | Boolean (default false) | Exposed to internet? |
| complianceScope | String? | e.g., SOC2, HIPAA |

When `applicationId` is set, the CI syncs name, criticality, lifecycle status from Application.

### 3.3 CmdbCiDatabase

For class: `database`

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| dbEngine | String | `postgresql`, `mysql`, `mssql`, `oracle`, `mongodb`, `redis` |
| dbVersion | String? | Version |
| instanceName | String? | Named instance |
| port | Int? | Listening port |
| collationName | String? | Character set |
| backupRequired | Boolean (default true) | |
| backupFrequency | String? | `hourly`, `daily`, `weekly` |
| encryptionEnabled | Boolean (default false) | At-rest encryption |
| containsSensitiveData | Boolean (default false) | PII/PHI flag |

### 3.4 CmdbCiNetworkDevice

For classes: `network_device`, `load_balancer`

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| deviceType | String | `switch`, `router`, `firewall`, `load_balancer`, `access_point`, `vpn_gateway` |
| firmwareVersion | String? | |
| managementIp | String? | OOB management IP |
| macAddress | String? | Primary MAC |
| rackLocation | String? | e.g., DC1-R05-U12 |
| haRole | String? | `primary`, `secondary`, `standalone` |
| supportContractRef | String? | Vendor contract number |

### 3.5 CmdbCiCloudResource

For class: `cloud_resource`

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| cloudProvider | String | `azure`, `aws`, `gcp`, `other` |
| accountId | String? | Cloud account |
| subscriptionId | String? | Azure subscription / AWS account |
| cloudTenantId | String? | Cloud tenant ID (distinct from app tenantId) |
| region | String? | e.g., `eastus`, `us-east-1` |
| resourceGroup | String? | Azure resource group |
| resourceType | String? | e.g., `Microsoft.Compute/virtualMachines` |
| nativeResourceId | String? | Provider's resource ID |
| tagsJson | Json? | Cloud tags |

### 3.6 CmdbCiEndpoint

For classes: `dns_endpoint`, `certificate`

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| endpointType | String | `url`, `dns`, `certificate`, `api_endpoint` |
| protocol | String? | `https`, `tcp`, `udp`, `grpc` |
| port | Int? | |
| url | String? | Full URL |
| dnsName | String? | DNS record |
| certificateExpiryDate | DateTime? | Cert expiry |
| certificateIssuer | String? | e.g., Let's Encrypt |
| tlsRequired | Boolean (default false) | |

### 3.7 CmdbService

For classes: `business_service`, `technical_service`

| Field | Type | Purpose |
|---|---|---|
| ciId | String (UUID, PK, FK → CmdbConfigurationItem) | 1:1 link |
| tenantId | String (UUID) | Multi-tenant |
| serviceType | String | `business`, `technical`, `infrastructure` |
| serviceTier | String? | `gold`, `silver`, `bronze` |
| slaName | String? | Associated SLA |
| availabilityTarget | Float? | e.g., 99.95 |
| rtoMinutes | Int? | Recovery time objective |
| rpoMinutes | Int? | Recovery point objective |
| customerScope | String? | Service consumers |
| serviceUrl | String? | Service portal URL |

---

## 4. ITSM Link Tables

### 4.1 CmdbChangeLink

Links CIs to Change records. Coexists with existing `ChangeApplication`/`ChangeAsset`.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | |
| ciId | String (UUID, FK → CmdbConfigurationItem) | |
| changeId | String (UUID, FK → Change) | |
| impactRole | String? | `affected`, `causing`, `implementing` |
| createdAt | DateTime | |

**Constraints**: `@@unique([ciId, changeId])`

### 4.2 CmdbIncidentLink

Links CIs to incident/service request tickets. Replaces `CmdbTicketLink` for incidents.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | |
| ciId | String (UUID, FK → CmdbConfigurationItem) | |
| ticketId | String (UUID, FK → Ticket) | |
| impactRole | String? | `affected`, `root_cause`, `related` |
| createdAt | DateTime | |

**Constraints**: `@@unique([ciId, ticketId])`

### 4.3 CmdbProblemLink

Links CIs to problem tickets.

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | |
| ciId | String (UUID, FK → CmdbConfigurationItem) | |
| ticketId | String (UUID, FK → Ticket) | |
| impactRole | String? | `root_cause`, `affected`, `related` |
| createdAt | DateTime | |

**Constraints**: `@@unique([ciId, ticketId])`

### 4.4 Migration from CmdbTicketLink

Existing `CmdbTicketLink` records migrate to `CmdbIncidentLink` or `CmdbProblemLink` based on the linked ticket's `type` field:
- `INCIDENT` and `SERVICE_REQUEST` → `CmdbIncidentLink`
- `PROBLEM` → `CmdbProblemLink`

Link type mapping: `AFFECTED` → `affected`, `RELATED` → `related`, `CAUSED_BY` → `root_cause`

After migration, `CmdbTicketLink` model is dropped.

---

## 5. Governance Tables

### 5.1 CmdbAttestation

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | |
| ciId | String (UUID, FK → CmdbConfigurationItem) | |
| attestedById | String (UUID, FK → User) | Who verified |
| attestedAt | DateTime | When |
| attestationStatus | String | `verified`, `disputed`, `needs_review` |
| comments | String? | Notes |
| createdAt | DateTime | |

Creating an attestation with status `verified` automatically updates the CI's `lastVerifiedAt`.

### 5.2 CmdbDuplicateCandidate

| Field | Type | Purpose |
|---|---|---|
| id | String (UUID, PK) | |
| tenantId | String (UUID, FK → Tenant) | |
| ciId1 | String (UUID, FK → CmdbConfigurationItem) | |
| ciId2 | String (UUID, FK → CmdbConfigurationItem) | |
| matchScore | Float | 0-100 confidence |
| detectionReason | String? | e.g., `hostname_match`, `serial_match` |
| reviewStatus | String (default `pending`) | `pending`, `confirmed_duplicate`, `not_duplicate`, `merged` |
| reviewedById | String? (UUID, FK → User) | |
| reviewedAt | DateTime? | |
| createdAt | DateTime | |

### 5.3 Duplicate Detection Logic

Runs on CI create/update. Checks within same tenant:

1. Exact hostname match
2. Exact serial number match
3. Exact FQDN match
4. Exact asset tag match
5. Exact external ID match

Scoring: single field match = 60, two fields = 80, three+ = 95. Threshold: >= 60 creates a candidate.

### 5.4 Staleness Rules

Implemented as service functions, no separate table:

- **Production CIs**: stale if `lastVerifiedAt` AND `lastSeenAt` both > 30 days ago (or null)
- **Non-production CIs**: stale if both > 90 days ago (or null)
- **Relationships**: stale if `isDiscovered = true` AND `updatedAt` > 60 days ago

---

## 6. Integration Layer

### 6.1 Application ↔ CMDB Bridge

**Direction**: One-way sync (Application → CMDB). Application model remains source of truth for application-specific workflows.

On Application create/update, a corresponding CI is created/updated:
- `classId` → `application` class
- `name` → from Application.name
- `criticality` → from Application.criticality
- `lifecycleStatusId` → mapped: `ACTIVE` → `in_service`, `PLANNED` → `planned`, `DECOMMISSIONED` → `retired`, `IN_DEVELOPMENT` → `installed`, `INACTIVE` → `retired`
- `CmdbCiApplication.applicationId` → Application.id

**ApplicationDependency → CmdbRelationship mapping**:

| DependencyType | CMDB relationshipKey |
|---|---|
| `DATA_FLOW` | `depends_on` |
| `API_CALL` | `uses` |
| `SHARED_DATABASE` | `uses` |
| `AUTHENTICATION` | `depends_on` |
| `FILE_TRANSFER` | `depends_on` |
| `MESSAGE_QUEUE` | `connected_to` |
| `OTHER` | `connected_to` |

### 6.2 Asset ↔ CMDB Bridge

Existing `assetId` FK on CI is retained. When an Asset is created with hardware fields, a CI is auto-created if none exists (class inferred: has hostname → `server`, else `generic`). Asset hardware fields sync to CI promoted columns and server extension.

### 6.3 Agent Discovery (Updated Worker)

The existing `cmdb-reconciliation.ts` worker updated to:
- Use `classId` FK instead of `type` enum
- Populate promoted columns (`hostname`, `fqdn`, `ipAddress`, `serialNumber`) instead of `attributesJson`
- Create/update `CmdbCiServer` extension records
- Set `sourceSystem = 'agent'`, `sourceRecordKey = agent.agentKey`
- Set `firstDiscoveredAt` on first creation
- Respect `reconciliationRank` for multi-source conflict resolution

### 6.4 Change Management

Change detail page gets a "Configuration Items" tab:
- Lists CIs via `CmdbChangeLink`
- CI picker with search by name, class, hostname
- Impact role selection per link
- "View Impact" runs impact analysis for blast radius

### 6.5 Ticket Integration

Ticket detail page updated to use `CmdbIncidentLink`/`CmdbProblemLink` based on ticket type. Richer CI cards with class icon, dual status, criticality.

### 6.6 Data Migration Script

One-time migration:
1. Seed reference tables per tenant
2. Map enum values to FK references on existing CIs and relationships
3. Create CIs for existing Applications without one
4. Create `CmdbCiApplication` extension records with `applicationId`
5. Migrate `CmdbTicketLink` → `CmdbIncidentLink`/`CmdbProblemLink`
6. Run duplicate detection on all existing CIs
7. Populate `firstDiscoveredAt` from `discoveredAt`

---

## 7. API Endpoints

### 7.1 Existing Endpoints (Updated)

All existing CMDB endpoints updated to use new reference table FKs and return enriched data.

- `POST /api/v1/cmdb/cis` — Accepts `classId`, `lifecycleStatusId`, etc. instead of enums
- `GET /api/v1/cmdb/cis` — New filters: criticality, vendorId, supportGroupId, staleness
- `GET /api/v1/cmdb/cis/:id` — Returns extension data, dual owners, dual statuses
- `PUT /api/v1/cmdb/cis/:id` — Accepts extension data in same payload
- `POST /api/v1/cmdb/relationships` — Uses `relationshipTypeId`, accepts confidence/validity

### 7.2 New Endpoints

**Reference Data CRUD** (all require `cmdb.edit`):
- `GET/POST/PUT/DELETE /api/v1/cmdb/classes`
- `GET/POST/PUT/DELETE /api/v1/cmdb/statuses`
- `GET/POST/PUT/DELETE /api/v1/cmdb/environments`
- `GET/POST/PUT/DELETE /api/v1/cmdb/relationship-types`
- `GET/POST/PUT/DELETE /api/v1/cmdb/vendors`

**ITSM Links** (require `cmdb.edit`):
- `POST /api/v1/cmdb/cis/:id/changes` — Link CI to Change
- `DELETE /api/v1/cmdb/cis/:id/changes/:changeId` — Unlink
- `GET /api/v1/cmdb/cis/:id/changes` — List linked Changes
- `POST /api/v1/cmdb/cis/:id/incidents` — Link CI to incident ticket
- `DELETE /api/v1/cmdb/cis/:id/incidents/:ticketId` — Unlink
- `GET /api/v1/cmdb/cis/:id/incidents` — List linked incidents
- `POST /api/v1/cmdb/cis/:id/problems` — Link CI to problem ticket
- `DELETE /api/v1/cmdb/cis/:id/problems/:ticketId` — Unlink
- `GET /api/v1/cmdb/cis/:id/problems` — List linked problems

**Governance** (require `cmdb.edit` except reports which need `cmdb.view`):
- `POST /api/v1/cmdb/cis/:id/attestations` — Create attestation
- `GET /api/v1/cmdb/cis/:id/attestations` — List attestation history
- `GET /api/v1/cmdb/duplicates` — List duplicate candidates
- `PUT /api/v1/cmdb/duplicates/:id` — Review (confirm/dismiss/merge)

**Reports** (require `cmdb.view`):
- `GET /api/v1/cmdb/reports/health` — Aggregate health metrics
- `GET /api/v1/cmdb/reports/stale` — Stale CIs list
- `GET /api/v1/cmdb/reports/orphaned` — CIs with no relationships
- `GET /api/v1/cmdb/reports/duplicates` — Duplicate candidate summary
- `GET /api/v1/cmdb/reports/by-class` — CI count by class
- `GET /api/v1/cmdb/reports/by-environment` — CI count by environment
- `GET /api/v1/cmdb/reports/missing-data` — CIs missing required fields

---

## 8. Frontend Changes

### 8.1 Updated CMDB List Page (`/dashboard/cmdb`)

- Filter dropdowns query reference tables (not hardcoded enums)
- New filters: Criticality, Vendor, Support Group, Staleness (fresh/stale/all)
- Class column shows icon from `CmdbCiClass.icon` + class name
- Two status badges: lifecycle + operational
- Dual owner columns
- Health indicator dot (green = fresh, yellow = approaching stale, red = stale)

### 8.2 Updated CI Detail Page (`/dashboard/cmdb/[id]`)

Tabs restructured per ITIL:

1. **General** — Name, display name, class, lifecycle/operational status, environment, description, criticality
2. **Ownership** — Business owner, technical owner, support group, vendor (searchable dropdowns)
3. **Technical** — Hostname, FQDN, IP, serial, asset tag, version, model, edition. Class-specific extension fields rendered dynamically based on CI class
4. **Service Context** — Service-specific fields if CI is a service; otherwise which services this CI supports via relationships
5. **Relationships** — Relationship map + impact analysis. Types show forward/reverse labels. Add relationship uses new type dropdown.
6. **Governance** — Source system, source of truth, reconciliation rank, discovery dates, attestation history with "Attest Now" button, duplicate candidates
7. **Linked Records** — Three sub-sections: Changes (CmdbChangeLink), Incidents (CmdbIncidentLink), Problems (CmdbProblemLink). Link/unlink actions.

### 8.3 CI Create/Edit Pages

- `/dashboard/cmdb/new` and `/dashboard/cmdb/[id]/edit`
- Step 1: Select class → determines extension fields
- Step 2: General info (name, environment, status, criticality)
- Step 3: Ownership (owners, support group, vendor)
- Step 4: Technical details (base + class-specific extension)
- Step 5: Review & save

### 8.4 CMDB Health Dashboard (`/dashboard/cmdb/health`)

- CI count by class (bar chart)
- CI count by environment (pie chart)
- Stale CIs list with quick-attest
- Orphaned CIs list
- Duplicate candidates queue with merge/dismiss
- Missing data report
- Attestation coverage percentage

### 8.5 Change Detail Page (`/dashboard/changes/[id]`)

New "Configuration Items" tab:
- CI list via CmdbChangeLink
- CI picker to add with impact role
- Shows class icon, name, criticality, lifecycle status

### 8.6 Ticket Detail Page

- Uses CmdbIncidentLink/CmdbProblemLink based on ticket type
- Richer CI cards (class icon, dual status, criticality)

### 8.7 Application Detail Page (`/dashboard/applications/[id]`)

- "View in CMDB" link when corresponding CI exists
- CMDB badge showing lifecycle status and last verified

### 8.8 Reference Data Management (`/dashboard/cmdb/settings/`)

- **CI Classes** — CRUD with parent class, icon picker
- **Statuses** — CRUD grouped by type, drag reorder
- **Environments** — CRUD with reorder
- **Relationship Types** — CRUD with forward/reverse labels
- **Vendors** — CRUD with contact info

---

## 9. Enum Migration Strategy

1. New FK columns added alongside old enum columns (both nullable initially)
2. Data migration populates new FKs from enum values using seed data mapping
3. New FKs made required, old enum columns made optional
4. All code updated to use new FKs
5. Old enum columns dropped in cleanup migration
6. Enum definitions removed from schema

Mapping tables for migration:

**CmdbCiType → CmdbCiClass.classKey**:
`SERVER` → `server`, `WORKSTATION` → `server`, `NETWORK_DEVICE` → `network_device`, `SOFTWARE` → `application`, `SERVICE` → `technical_service`, `DATABASE` → `database`, `VIRTUAL_MACHINE` → `virtual_machine`, `CONTAINER` → `cloud_resource`, `OTHER` → `generic`

**CmdbCiStatus → CmdbStatus (lifecycle)**:
`ACTIVE` → `in_service`, `INACTIVE` → `retired`, `DECOMMISSIONED` → `retired`, `PLANNED` → `planned`

**CmdbCiEnvironment → CmdbEnvironment.envKey**:
`PRODUCTION` → `prod`, `STAGING` → `test`, `DEV` → `dev`, `DR` → `dr`

**CmdbRelationshipType → CmdbRelationshipType.relationshipKey**:
`DEPENDS_ON` → `depends_on`, `HOSTS` → `hosted_on`, `CONNECTS_TO` → `connected_to`, `RUNS_ON` → `runs_on`, `BACKS_UP` → `backed_up_by`, `VIRTUALIZES` → `hosted_on`, `MEMBER_OF` → `member_of`
