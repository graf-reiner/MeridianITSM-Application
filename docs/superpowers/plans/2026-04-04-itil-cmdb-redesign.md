# ITIL CMDB Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the CMDB from enum-driven flat model to ITIL-aligned, relationship-driven configuration management database with reference tables, extension tables, governance, and full ITSM integration.

**Architecture:** Layered extension — add new schema alongside existing, migrate data, update services/API/frontend, then clean up old enums. Four phases: Schema → Services → Integration → Frontend.

**Tech Stack:** Prisma 6 / PostgreSQL, Next.js 16 App Router, Express API, BullMQ workers, React 19 + shadcn/ui + TanStack Query

**Spec:** `docs/superpowers/specs/2026-04-04-itil-cmdb-redesign.md`

---

## Phase 1: Schema & Seed Data

### Task 1: Add Reference Table Models to Prisma Schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

Add these new models after the existing CMDB enums section (~line 222):

- [ ] **Step 1: Add CmdbCiClass model**
- [ ] **Step 2: Add CmdbStatus model**
- [ ] **Step 3: Add CmdbEnvironment model**
- [ ] **Step 4: Add CmdbRelationshipTypeRef model** (named to avoid collision with existing enum)
- [ ] **Step 5: Add CmdbVendor model**
- [ ] **Step 6: Add isCmdbSupportGroup to UserGroup model**
- [ ] **Step 7: Run prisma format to validate**

### Task 2: Expand CmdbConfigurationItem Model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add new FK columns** (classId, lifecycleStatusId, operationalStatusId, environmentId) — all optional initially for migration
- [ ] **Step 2: Add promoted columns** (displayName, hostname, fqdn, ipAddress, serialNumber, assetTag, externalId)
- [ ] **Step 3: Add product info columns** (manufacturerId, model, version, edition)
- [ ] **Step 4: Add dual ownership columns** (businessOwnerId, technicalOwnerId, supportGroupId)
- [ ] **Step 5: Add security classification columns** (criticality, confidentialityClass, integrityClass, availabilityClass)
- [ ] **Step 6: Add governance columns** (installDate, firstDiscoveredAt, lastVerifiedAt, sourceSystem, sourceRecordKey, sourceOfTruth, reconciliationRank, isDeleted)
- [ ] **Step 7: Add new indexes**
- [ ] **Step 8: Add relations to new reference tables**

### Task 3: Expand CmdbRelationship Model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add relationshipTypeId FK** (optional initially)
- [ ] **Step 2: Add metadata columns** (sourceSystem, sourceRecordKey, confidenceScore, isActive, validFrom, validTo)
- [ ] **Step 3: Add relation to CmdbRelationshipTypeRef**

### Task 4: Add Extension Table Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add CmdbCiServer model**
- [ ] **Step 2: Add CmdbCiApplication model** (with applicationId FK to Application)
- [ ] **Step 3: Add CmdbCiDatabase model**
- [ ] **Step 4: Add CmdbCiNetworkDevice model**
- [ ] **Step 5: Add CmdbCiCloudResource model**
- [ ] **Step 6: Add CmdbCiEndpoint model**
- [ ] **Step 7: Add CmdbService model**

### Task 5: Add ITSM Link & Governance Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add CmdbChangeLink model** (with FK to Change)
- [ ] **Step 2: Add CmdbIncidentLink model** (with FK to Ticket)
- [ ] **Step 3: Add CmdbProblemLink model** (with FK to Ticket)
- [ ] **Step 4: Add CmdbAttestation model**
- [ ] **Step 5: Add CmdbDuplicateCandidate model**
- [ ] **Step 6: Add reverse relations on Change, Ticket, Application models**

### Task 6: Generate Migration & Seed Data

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/prisma/seed.ts`

- [ ] **Step 1: Run prisma generate to validate schema**
- [ ] **Step 2: Run prisma migrate dev to create migration**
- [ ] **Step 3: Add CMDB seed function to seed.ts** — seeds reference tables per tenant (15 CI classes, 11 statuses, 6 environments, 13 relationship types)
- [ ] **Step 4: Run seed to verify**

---

## Phase 2: Service Layer

### Task 7: Reference Data CRUD Services

**Files:**
- Create: `apps/api/src/services/cmdb-reference.service.ts`

- [ ] **Step 1: CRUD functions for CmdbCiClass** (create, list, update, delete with tenant scoping)
- [ ] **Step 2: CRUD functions for CmdbStatus**
- [ ] **Step 3: CRUD functions for CmdbEnvironment**
- [ ] **Step 4: CRUD functions for CmdbRelationshipTypeRef**
- [ ] **Step 5: CRUD functions for CmdbVendor**

### Task 8: Update Core CMDB Service

**Files:**
- Modify: `apps/api/src/services/cmdb.service.ts`

- [ ] **Step 1: Update createCI** — accept new fields (classId, lifecycleStatusId, etc.), create extension records based on class
- [ ] **Step 2: Update getCI** — include extension data, dual owners, vendor, support group
- [ ] **Step 3: Update listCIs** — add new filters (criticality, vendorId, supportGroupId, classId, staleness)
- [ ] **Step 4: Update updateCI** — handle extension record updates, dual ownership changes
- [ ] **Step 5: Update deleteCI** — use isDeleted soft delete
- [ ] **Step 6: Update createRelationship** — use relationshipTypeId
- [ ] **Step 7: Update getCIRelationships** — include relationship type labels
- [ ] **Step 8: Update getImpactAnalysis** — use new relationship structure

### Task 9: Add Governance Services

**Files:**
- Create: `apps/api/src/services/cmdb-governance.service.ts`

- [ ] **Step 1: createAttestation** — creates attestation, updates CI lastVerifiedAt if verified
- [ ] **Step 2: listAttestations** — paginated attestation history for a CI
- [ ] **Step 3: detectDuplicates** — check hostname/serial/fqdn/assetTag/externalId matches, create candidates
- [ ] **Step 4: listDuplicateCandidates** — paginated list with review status filter
- [ ] **Step 5: reviewDuplicateCandidate** — update review status
- [ ] **Step 6: getStaleReport** — query CIs based on staleness rules (30d prod, 90d non-prod)
- [ ] **Step 7: getOrphanedReport** — CIs with no relationships
- [ ] **Step 8: getHealthReport** — aggregate metrics (counts by class/env, stale, orphaned, duplicates, missing data, attestation coverage)
- [ ] **Step 9: getMissingDataReport** — CIs missing required fields per class

### Task 10: Add ITSM Link Services

**Files:**
- Create: `apps/api/src/services/cmdb-links.service.ts`

- [ ] **Step 1: createChangeLink / deleteChangeLink / listChangeLinks**
- [ ] **Step 2: createIncidentLink / deleteIncidentLink / listIncidentLinks**
- [ ] **Step 3: createProblemLink / deleteProblemLink / listProblemLinks**

### Task 11: Update Import Service

**Files:**
- Modify: `apps/api/src/services/cmdb-import.service.ts`

- [ ] **Step 1: Update import to resolve classId from classKey**
- [ ] **Step 2: Update import to resolve statusId from statusKey**
- [ ] **Step 3: Update import to resolve environmentId from envKey**
- [ ] **Step 4: Update import to populate promoted columns instead of attributesJson**
- [ ] **Step 5: Support extension data in import rows**

---

## Phase 3: API Routes & Worker

### Task 12: Add Reference Data API Routes

**Files:**
- Create: `apps/api/src/routes/v1/cmdb/reference.ts`
- Modify: `apps/api/src/routes/v1/cmdb/index.ts`

- [ ] **Step 1: CRUD routes for /classes**
- [ ] **Step 2: CRUD routes for /statuses**
- [ ] **Step 3: CRUD routes for /environments**
- [ ] **Step 4: CRUD routes for /relationship-types**
- [ ] **Step 5: CRUD routes for /vendors**
- [ ] **Step 6: Mount reference routes in main CMDB router**

### Task 13: Add ITSM Link & Governance API Routes

**Files:**
- Modify: `apps/api/src/routes/v1/cmdb/index.ts`

- [ ] **Step 1: Routes for /cis/:id/changes** (POST, DELETE, GET)
- [ ] **Step 2: Routes for /cis/:id/incidents** (POST, DELETE, GET)
- [ ] **Step 3: Routes for /cis/:id/problems** (POST, DELETE, GET)
- [ ] **Step 4: Routes for /cis/:id/attestations** (POST, GET)
- [ ] **Step 5: Routes for /duplicates** (GET, PUT)
- [ ] **Step 6: Routes for /reports/health, /reports/stale, /reports/orphaned, /reports/duplicates, /reports/by-class, /reports/by-environment, /reports/missing-data**

### Task 14: Update Existing CI API Routes

**Files:**
- Modify: `apps/api/src/routes/v1/cmdb/index.ts`

- [ ] **Step 1: Update POST /cis** — accept new fields, extension data
- [ ] **Step 2: Update GET /cis** — add new filter query params
- [ ] **Step 3: Update GET /cis/:id** — return enriched data
- [ ] **Step 4: Update PUT /cis/:id** — accept extension updates
- [ ] **Step 5: Update POST /relationships** — use relationshipTypeId

### Task 15: Update Reconciliation Worker

**Files:**
- Modify: `apps/worker/src/workers/cmdb-reconciliation.ts`

- [ ] **Step 1: Update CI creation** — use classId, populate promoted columns, create CmdbCiServer extension
- [ ] **Step 2: Update CI update logic** — update promoted columns, update extension record
- [ ] **Step 3: Set sourceSystem/sourceRecordKey/firstDiscoveredAt**
- [ ] **Step 4: Use isDeleted for stale CIs instead of status change**
- [ ] **Step 5: Run duplicate detection after CI creation**

---

## Phase 4: Frontend

### Task 16: Updated CMDB List Page

**Files:**
- Modify: `apps/web/src/app/dashboard/cmdb/page.tsx`

- [ ] **Step 1: Replace hardcoded enum filters with reference table dropdowns**
- [ ] **Step 2: Add new filter dropdowns** (criticality, vendor, support group, staleness)
- [ ] **Step 3: Update table columns** (class with icon, dual status badges, dual owners, health dot)
- [ ] **Step 4: Update API calls to use new filter params**

### Task 17: CI Create/Edit Pages

**Files:**
- Create: `apps/web/src/app/dashboard/cmdb/new/page.tsx`
- Create: `apps/web/src/app/dashboard/cmdb/[id]/edit/page.tsx`

- [ ] **Step 1: Build multi-step form** (class selection → general → ownership → technical → review)
- [ ] **Step 2: Dynamic extension fields** based on selected class
- [ ] **Step 3: Reference table dropdowns** (classes, statuses, environments, vendors)
- [ ] **Step 4: Owner/support group search dropdowns**
- [ ] **Step 5: Edit page** — pre-populate from existing CI

### Task 18: Updated CI Detail Page

**Files:**
- Modify: `apps/web/src/app/dashboard/cmdb/[id]/page.tsx`

- [ ] **Step 1: Restructure to 7 ITIL tabs** (General, Ownership, Technical, Service Context, Relationships, Governance, Linked Records)
- [ ] **Step 2: General tab** — class, dual status, environment, criticality, description
- [ ] **Step 3: Ownership tab** — business/technical owner dropdowns, support group, vendor
- [ ] **Step 4: Technical tab** — promoted fields + dynamic extension fields by class
- [ ] **Step 5: Service Context tab** — service fields or service relationships
- [ ] **Step 6: Governance tab** — source info, attestation history, "Attest Now" button, duplicate candidates
- [ ] **Step 7: Linked Records tab** — Changes, Incidents, Problems with link/unlink

### Task 19: Update Relationship Map

**Files:**
- Modify: `apps/web/src/app/dashboard/cmdb/[id]/RelationshipMap.tsx`

- [ ] **Step 1: Use forward/reverse labels from relationship type**
- [ ] **Step 2: Show confidence score on edges**
- [ ] **Step 3: Update add relationship dialog** to use reference table dropdown

### Task 20: CMDB Health Dashboard

**Files:**
- Create: `apps/web/src/app/dashboard/cmdb/health/page.tsx`

- [ ] **Step 1: CI count by class** (bar chart)
- [ ] **Step 2: CI count by environment** (pie chart)
- [ ] **Step 3: Stale CIs list** with quick-attest
- [ ] **Step 4: Orphaned CIs list**
- [ ] **Step 5: Duplicate candidates queue**
- [ ] **Step 6: Missing data report**
- [ ] **Step 7: Attestation coverage**

### Task 21: Reference Data Management Pages

**Files:**
- Create: `apps/web/src/app/dashboard/cmdb/settings/page.tsx`
- Create: `apps/web/src/app/dashboard/cmdb/settings/classes/page.tsx`
- Create: `apps/web/src/app/dashboard/cmdb/settings/statuses/page.tsx`
- Create: `apps/web/src/app/dashboard/cmdb/settings/environments/page.tsx`
- Create: `apps/web/src/app/dashboard/cmdb/settings/relationship-types/page.tsx`
- Create: `apps/web/src/app/dashboard/cmdb/settings/vendors/page.tsx`

- [ ] **Step 1: Settings index page** with navigation to sub-pages
- [ ] **Step 2: CI Classes CRUD** with parent class, icon picker
- [ ] **Step 3: Statuses CRUD** grouped by type, reorder
- [ ] **Step 4: Environments CRUD** with reorder
- [ ] **Step 5: Relationship Types CRUD** with forward/reverse labels
- [ ] **Step 6: Vendors CRUD** with contact info

### Task 22: Change Detail Page Integration

**Files:**
- Modify: `apps/web/src/app/dashboard/changes/[id]/page.tsx`

- [ ] **Step 1: Add "Configuration Items" tab**
- [ ] **Step 2: CI picker with search** (name, class, hostname)
- [ ] **Step 3: Impact role selection per link**
- [ ] **Step 4: Show linked CIs** with class icon, criticality, status

### Task 23: Application Detail Page Integration

**Files:**
- Modify: `apps/web/src/app/dashboard/applications/[id]/page.tsx`

- [ ] **Step 1: Add "View in CMDB" link** when CI exists
- [ ] **Step 2: CMDB badge** showing lifecycle status, last verified

### Task 24: Update Import Wizard

**Files:**
- Modify: `apps/web/src/app/dashboard/cmdb/import/page.tsx`

- [ ] **Step 1: Update column mapping** to include new promoted fields
- [ ] **Step 2: Add class selection** (reference table dropdown)
- [ ] **Step 3: Update preview** to show new fields

---

## Phase 5: Data Migration & Cleanup

### Task 25: Data Migration Script

**Files:**
- Create: `packages/db/scripts/cmdb-migration.ts`

- [ ] **Step 1: Seed reference tables for all existing tenants**
- [ ] **Step 2: Map existing enum values to new FK references on CIs**
- [ ] **Step 3: Map existing enum values on relationships**
- [ ] **Step 4: Create CIs for existing Applications**
- [ ] **Step 5: Migrate CmdbTicketLink to CmdbIncidentLink/CmdbProblemLink**
- [ ] **Step 6: Populate firstDiscoveredAt from discoveredAt**
- [ ] **Step 7: Run duplicate detection on all CIs**

### Task 26: Schema Cleanup

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Make new FK columns required** (classId, lifecycleStatusId, environmentId, relationshipTypeId)
- [ ] **Step 2: Drop old enum columns** (type, status, environment on CI; relationshipType on relationship)
- [ ] **Step 3: Drop CmdbTicketLink model**
- [ ] **Step 4: Drop old CMDB enums** (CmdbCiType, CmdbCiStatus, CmdbCiEnvironment, CmdbRelationshipType, CmdbTicketLinkType)
- [ ] **Step 5: Drop ownerId column** (replaced by businessOwnerId/technicalOwnerId)
- [ ] **Step 6: Run prisma migrate dev**
