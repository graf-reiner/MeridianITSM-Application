-- APM ↔ CMDB bridge
-- Adds primaryCiId FK + 5 APM-only text fields to applications,
-- and a new CERT_EXPIRY_WARNING value to the NotificationType enum.
-- Additive only — no destructive changes.

-- AlterEnum: NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CERT_EXPIRY_WARNING';

-- AlterTable: applications
ALTER TABLE "applications"
    ADD COLUMN "primaryCiId"    UUID,
    ADD COLUMN "supportNotes"   TEXT,
    ADD COLUMN "specialNotes"   TEXT,
    ADD COLUMN "osRequirements" TEXT,
    ADD COLUMN "vendorContact"  TEXT,
    ADD COLUMN "licenseInfo"    TEXT;

-- AddForeignKey
ALTER TABLE "applications"
    ADD CONSTRAINT "applications_primaryCiId_fkey"
    FOREIGN KEY ("primaryCiId") REFERENCES "cmdb_configuration_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "applications_tenantId_primaryCiId_idx"
    ON "applications"("tenantId", "primaryCiId");
