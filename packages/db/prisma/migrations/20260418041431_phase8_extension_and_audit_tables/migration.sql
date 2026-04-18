-- ============================================================================
-- Phase 8 Wave 1 — additive schema (non-destructive)
-- ============================================================================
-- Adds:
--   * 3 new columns on cmdb_ci_servers (cpuModel, disksJson, networkInterfacesJson)
--   * New table cmdb_software_installed (CASR-03)
--   * New table cmdb_migration_audit (forensic log for destructive migrations)
--
-- Safety posture (per RESEARCH A5):
--   ALTER TABLE ADD COLUMN with no DEFAULT is metadata-only in Postgres 11+.
--   Instant on production-scale tables. No pre-flight gate required because
--   nothing drops or becomes NOT NULL. Asset model is UNCHANGED — the 10
--   duplicated hardware columns are retired in Wave 5 (plan 08-06).
--
-- Multi-tenancy (CLAUDE.md Rule 1): every new table carries tenantId directly
-- (denormalized from ciId->ci.tenantId) so every query filters by tenantId
-- without needing a JOIN. Cross-tenant isolation verified by phase8-verify.ts
-- Check 4 (T-8-01-02 mitigation).
-- ============================================================================

-- AlterTable: cmdb_ci_servers — add three Phase 8 columns
ALTER TABLE "cmdb_ci_servers" ADD COLUMN     "cpuModel" TEXT,
ADD COLUMN     "disksJson" JSONB,
ADD COLUMN     "networkInterfacesJson" JSONB;

-- CreateTable: cmdb_software_installed (CASR-03 / D-05 / D-06)
CREATE TABLE "cmdb_software_installed" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "vendor" TEXT,
    "publisher" TEXT,
    "installDate" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "licenseKey" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmdb_software_installed_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cmdb_migration_audit (forensic log for destructive migrations)
CREATE TABLE "cmdb_migration_audit" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cmdb_migration_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: cmdb_software_installed
CREATE UNIQUE INDEX "cmdb_software_installed_ciId_name_version_key" ON "cmdb_software_installed"("ciId", "name", "version");

CREATE INDEX "cmdb_software_installed_tenantId_idx" ON "cmdb_software_installed"("tenantId");

CREATE INDEX "cmdb_software_installed_tenantId_name_idx" ON "cmdb_software_installed"("tenantId", "name");

CREATE INDEX "cmdb_software_installed_ciId_idx" ON "cmdb_software_installed"("ciId");

CREATE INDEX "cmdb_software_installed_tenantId_lastSeenAt_idx" ON "cmdb_software_installed"("tenantId", "lastSeenAt");

-- CreateIndex: cmdb_migration_audit
CREATE INDEX "cmdb_migration_audit_tenantId_idx" ON "cmdb_migration_audit"("tenantId");

CREATE INDEX "cmdb_migration_audit_tenantId_phase_idx" ON "cmdb_migration_audit"("tenantId", "phase");

CREATE INDEX "cmdb_migration_audit_tenantId_tableName_recordId_idx" ON "cmdb_migration_audit"("tenantId", "tableName", "recordId");

CREATE INDEX "cmdb_migration_audit_tenantId_createdAt_idx" ON "cmdb_migration_audit"("tenantId", "createdAt");

-- AddForeignKey: cmdb_software_installed.tenantId -> tenants.id
ALTER TABLE "cmdb_software_installed" ADD CONSTRAINT "cmdb_software_installed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: cmdb_software_installed.ciId -> cmdb_configuration_items.id (CASCADE per D-06)
ALTER TABLE "cmdb_software_installed" ADD CONSTRAINT "cmdb_software_installed_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: cmdb_migration_audit.tenantId -> tenants.id
ALTER TABLE "cmdb_migration_audit" ADD CONSTRAINT "cmdb_migration_audit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
