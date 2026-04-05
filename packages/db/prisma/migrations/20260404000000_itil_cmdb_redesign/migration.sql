-- ITIL CMDB Redesign Migration
-- Adds reference tables, expands CI model, adds extension tables, ITSM links, governance tables

-- ─── Reference Tables ────────────────────────────────────────────────────────

CREATE TABLE "cmdb_ci_classes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "classKey" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "parentClassId" UUID,
    "description" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_classes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_ci_classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cmdb_ci_classes_parentClassId_fkey" FOREIGN KEY ("parentClassId") REFERENCES "cmdb_ci_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_ci_classes_tenantId_classKey_key" ON "cmdb_ci_classes"("tenantId", "classKey");
CREATE INDEX "cmdb_ci_classes_tenantId_idx" ON "cmdb_ci_classes"("tenantId");

CREATE TABLE "cmdb_statuses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "statusType" TEXT NOT NULL,
    "statusKey" TEXT NOT NULL,
    "statusName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_statuses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_statuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_statuses_tenantId_statusType_statusKey_key" ON "cmdb_statuses"("tenantId", "statusType", "statusKey");
CREATE INDEX "cmdb_statuses_tenantId_idx" ON "cmdb_statuses"("tenantId");

CREATE TABLE "cmdb_environments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "envKey" TEXT NOT NULL,
    "envName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_environments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_environments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_environments_tenantId_envKey_key" ON "cmdb_environments"("tenantId", "envKey");
CREATE INDEX "cmdb_environments_tenantId_idx" ON "cmdb_environments"("tenantId");

CREATE TABLE "cmdb_relationship_types" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "relationshipKey" TEXT NOT NULL,
    "relationshipName" TEXT NOT NULL,
    "forwardLabel" TEXT NOT NULL,
    "reverseLabel" TEXT NOT NULL,
    "isDirectional" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_relationship_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_relationship_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_relationship_types_tenantId_relationshipKey_key" ON "cmdb_relationship_types"("tenantId", "relationshipKey");
CREATE INDEX "cmdb_relationship_types_tenantId_idx" ON "cmdb_relationship_types"("tenantId");

CREATE TABLE "cmdb_vendors" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "vendorType" TEXT,
    "supportUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_vendors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_vendors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_vendors_tenantId_name_key" ON "cmdb_vendors"("tenantId", "name");
CREATE INDEX "cmdb_vendors_tenantId_idx" ON "cmdb_vendors"("tenantId");

-- Add isCmdbSupportGroup to user_groups
ALTER TABLE "user_groups" ADD COLUMN "isCmdbSupportGroup" BOOLEAN NOT NULL DEFAULT false;

-- ─── Expand CmdbConfigurationItem ────────────────────────────────────────────

ALTER TABLE "cmdb_configuration_items" ADD COLUMN "displayName" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "classId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "lifecycleStatusId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "operationalStatusId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "environmentId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "hostname" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "fqdn" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "serialNumber" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "assetTag" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "externalId" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "manufacturerId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "model" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "version" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "edition" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "businessOwnerId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "technicalOwnerId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "supportGroupId" UUID;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "criticality" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "confidentialityClass" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "integrityClass" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "availabilityClass" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "installDate" TIMESTAMPTZ(6);
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "firstDiscoveredAt" TIMESTAMPTZ(6);
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "lastVerifiedAt" TIMESTAMPTZ(6);
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "sourceSystem" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "sourceRecordKey" TEXT;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "sourceOfTruth" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "reconciliationRank" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "cmdb_configuration_items" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- FK constraints for expanded CI columns
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_classId_fkey" FOREIGN KEY ("classId") REFERENCES "cmdb_ci_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_lifecycleStatusId_fkey" FOREIGN KEY ("lifecycleStatusId") REFERENCES "cmdb_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_operationalStatusId_fkey" FOREIGN KEY ("operationalStatusId") REFERENCES "cmdb_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "cmdb_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "cmdb_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_supportGroupId_fkey" FOREIGN KEY ("supportGroupId") REFERENCES "user_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New indexes on CI
CREATE INDEX "cmdb_ci_classId_idx" ON "cmdb_configuration_items"("tenantId", "classId");
CREATE INDEX "cmdb_ci_lifecycleStatusId_idx" ON "cmdb_configuration_items"("tenantId", "lifecycleStatusId");
CREATE INDEX "cmdb_ci_environmentId_idx" ON "cmdb_configuration_items"("tenantId", "environmentId");
CREATE INDEX "cmdb_ci_hostname_idx" ON "cmdb_configuration_items"("tenantId", "hostname");
CREATE INDEX "cmdb_ci_fqdn_idx" ON "cmdb_configuration_items"("tenantId", "fqdn");
CREATE INDEX "cmdb_ci_externalId_idx" ON "cmdb_configuration_items"("tenantId", "externalId");
CREATE INDEX "cmdb_ci_serialNumber_idx" ON "cmdb_configuration_items"("tenantId", "serialNumber");
CREATE INDEX "cmdb_ci_assetTag_idx" ON "cmdb_configuration_items"("tenantId", "assetTag");
CREATE INDEX "cmdb_ci_supportGroupId_idx" ON "cmdb_configuration_items"("tenantId", "supportGroupId");
CREATE INDEX "cmdb_ci_businessOwnerId_idx" ON "cmdb_configuration_items"("tenantId", "businessOwnerId");
CREATE INDEX "cmdb_ci_technicalOwnerId_idx" ON "cmdb_configuration_items"("tenantId", "technicalOwnerId");
CREATE INDEX "cmdb_ci_manufacturerId_idx" ON "cmdb_configuration_items"("tenantId", "manufacturerId");

-- ─── Expand CmdbRelationship ─────────────────────────────────────────────────

ALTER TABLE "cmdb_relationships" ADD COLUMN "relationshipTypeId" UUID;
ALTER TABLE "cmdb_relationships" ADD COLUMN "sourceSystem" TEXT;
ALTER TABLE "cmdb_relationships" ADD COLUMN "sourceRecordKey" TEXT;
ALTER TABLE "cmdb_relationships" ADD COLUMN "confidenceScore" DOUBLE PRECISION;
ALTER TABLE "cmdb_relationships" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "cmdb_relationships" ADD COLUMN "validFrom" TIMESTAMPTZ(6);
ALTER TABLE "cmdb_relationships" ADD COLUMN "validTo" TIMESTAMPTZ(6);

ALTER TABLE "cmdb_relationships" ADD CONSTRAINT "cmdb_rel_relationshipTypeId_fkey" FOREIGN KEY ("relationshipTypeId") REFERENCES "cmdb_relationship_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cmdb_rel_relationshipTypeId_idx" ON "cmdb_relationships"("tenantId", "relationshipTypeId");

-- ─── Extension Tables ────────────────────────────────────────────────────────

CREATE TABLE "cmdb_ci_servers" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "serverType" TEXT NOT NULL,
    "operatingSystem" TEXT,
    "osVersion" TEXT,
    "cpuCount" INTEGER,
    "memoryGb" DOUBLE PRECISION,
    "storageGb" DOUBLE PRECISION,
    "domainName" TEXT,
    "virtualizationPlatform" TEXT,
    "hypervisorHostCiId" UUID,
    "backupRequired" BOOLEAN NOT NULL DEFAULT false,
    "backupPolicy" TEXT,
    "patchGroup" TEXT,
    "antivirusStatus" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_servers_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_ci_servers_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cmdb_ci_servers_hypervisorHostCiId_fkey" FOREIGN KEY ("hypervisorHostCiId") REFERENCES "cmdb_configuration_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cmdb_ci_servers_tenantId_idx" ON "cmdb_ci_servers"("tenantId");

CREATE TABLE "cmdb_ci_applications" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "applicationId" UUID,
    "applicationType" TEXT,
    "installType" TEXT,
    "businessFunction" TEXT,
    "repoUrl" TEXT,
    "documentationUrl" TEXT,
    "primaryLanguage" TEXT,
    "runtimePlatform" TEXT,
    "authenticationMethod" TEXT,
    "internetFacing" BOOLEAN NOT NULL DEFAULT false,
    "complianceScope" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_applications_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_ci_applications_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cmdb_ci_applications_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cmdb_ci_applications_tenantId_idx" ON "cmdb_ci_applications"("tenantId");
CREATE INDEX "cmdb_ci_applications_applicationId_idx" ON "cmdb_ci_applications"("applicationId");

CREATE TABLE "cmdb_ci_databases" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "dbEngine" TEXT NOT NULL,
    "dbVersion" TEXT,
    "instanceName" TEXT,
    "port" INTEGER,
    "collationName" TEXT,
    "backupRequired" BOOLEAN NOT NULL DEFAULT true,
    "backupFrequency" TEXT,
    "encryptionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "containsSensitiveData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_databases_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_ci_databases_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_ci_databases_tenantId_idx" ON "cmdb_ci_databases"("tenantId");

CREATE TABLE "cmdb_ci_network_devices" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deviceType" TEXT NOT NULL,
    "firmwareVersion" TEXT,
    "managementIp" TEXT,
    "macAddress" TEXT,
    "rackLocation" TEXT,
    "haRole" TEXT,
    "supportContractRef" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_network_devices_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_ci_network_devices_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_ci_network_devices_tenantId_idx" ON "cmdb_ci_network_devices"("tenantId");

CREATE TABLE "cmdb_ci_cloud_resources" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cloudProvider" TEXT NOT NULL,
    "accountId" TEXT,
    "subscriptionId" TEXT,
    "cloudTenantId" TEXT,
    "region" TEXT,
    "resourceGroup" TEXT,
    "resourceType" TEXT,
    "nativeResourceId" TEXT,
    "tagsJson" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_cloud_resources_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_ci_cloud_resources_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_ci_cloud_resources_tenantId_idx" ON "cmdb_ci_cloud_resources"("tenantId");

CREATE TABLE "cmdb_ci_endpoints" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "endpointType" TEXT NOT NULL,
    "protocol" TEXT,
    "port" INTEGER,
    "url" TEXT,
    "dnsName" TEXT,
    "certificateExpiryDate" TIMESTAMPTZ(6),
    "certificateIssuer" TEXT,
    "tlsRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_ci_endpoints_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_ci_endpoints_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_ci_endpoints_tenantId_idx" ON "cmdb_ci_endpoints"("tenantId");

CREATE TABLE "cmdb_services" (
    "ciId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "serviceType" TEXT NOT NULL,
    "serviceTier" TEXT,
    "slaName" TEXT,
    "availabilityTarget" DOUBLE PRECISION,
    "rtoMinutes" INTEGER,
    "rpoMinutes" INTEGER,
    "customerScope" TEXT,
    "serviceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cmdb_services_pkey" PRIMARY KEY ("ciId"),
    CONSTRAINT "cmdb_services_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_services_tenantId_idx" ON "cmdb_services"("tenantId");

-- ─── ITSM Link Tables ────────────────────────────────────────────────────────

CREATE TABLE "cmdb_change_links" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "changeId" UUID NOT NULL,
    "impactRole" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cmdb_change_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_change_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cmdb_change_links_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cmdb_change_links_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_change_links_ciId_changeId_key" ON "cmdb_change_links"("ciId", "changeId");
CREATE INDEX "cmdb_change_links_tenantId_idx" ON "cmdb_change_links"("tenantId");
CREATE INDEX "cmdb_change_links_tenantId_changeId_idx" ON "cmdb_change_links"("tenantId", "changeId");

CREATE TABLE "cmdb_incident_links" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "impactRole" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cmdb_incident_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_incident_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cmdb_incident_links_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cmdb_incident_links_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_incident_links_ciId_ticketId_key" ON "cmdb_incident_links"("ciId", "ticketId");
CREATE INDEX "cmdb_incident_links_tenantId_idx" ON "cmdb_incident_links"("tenantId");
CREATE INDEX "cmdb_incident_links_tenantId_ticketId_idx" ON "cmdb_incident_links"("tenantId", "ticketId");

CREATE TABLE "cmdb_problem_links" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "impactRole" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cmdb_problem_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_problem_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cmdb_problem_links_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cmdb_problem_links_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cmdb_problem_links_ciId_ticketId_key" ON "cmdb_problem_links"("ciId", "ticketId");
CREATE INDEX "cmdb_problem_links_tenantId_idx" ON "cmdb_problem_links"("tenantId");
CREATE INDEX "cmdb_problem_links_tenantId_ticketId_idx" ON "cmdb_problem_links"("tenantId", "ticketId");

-- ─── Governance Tables ──────────────────────────────────────���────────────────

CREATE TABLE "cmdb_attestations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "attestedById" UUID NOT NULL,
    "attestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attestationStatus" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cmdb_attestations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_attestations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cmdb_attestations_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_attestations_tenantId_idx" ON "cmdb_attestations"("tenantId");
CREATE INDEX "cmdb_attestations_tenantId_ciId_idx" ON "cmdb_attestations"("tenantId", "ciId");

CREATE TABLE "cmdb_duplicate_candidates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId1" UUID NOT NULL,
    "ciId2" UUID NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "detectionReason" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cmdb_duplicate_candidates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cmdb_duplicate_candidates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cmdb_duplicate_candidates_ciId1_fkey" FOREIGN KEY ("ciId1") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cmdb_duplicate_candidates_ciId2_fkey" FOREIGN KEY ("ciId2") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cmdb_duplicate_candidates_tenantId_idx" ON "cmdb_duplicate_candidates"("tenantId");
CREATE INDEX "cmdb_duplicate_candidates_tenantId_reviewStatus_idx" ON "cmdb_duplicate_candidates"("tenantId", "reviewStatus");
