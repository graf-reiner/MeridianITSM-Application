-- Vendor field expansion
-- Adds 5 nullable columns to cmdb_vendors so admins can record the full
-- vendor relationship (marketing site, account number, named account
-- manager, free-form notes).
-- Additive only — no destructive changes.

ALTER TABLE "cmdb_vendors"
    ADD COLUMN "websiteUrl"          TEXT,
    ADD COLUMN "accountNumber"       TEXT,
    ADD COLUMN "accountManagerName"  TEXT,
    ADD COLUMN "accountManagerEmail" TEXT,
    ADD COLUMN "notes"               TEXT;
