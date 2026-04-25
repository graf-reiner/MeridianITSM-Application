-- CreateEnum
CREATE TYPE "AgentUpdateFormat" AS ENUM ('MSI', 'EXE', 'DEB', 'RPM', 'PKG', 'TARGZ');

-- AlterTable: add format column (nullable for backfill)
ALTER TABLE "agent_updates" ADD COLUMN "format" "AgentUpdateFormat";

-- Backfill format from existing downloadUrl / storageKey (Windows-only history)
UPDATE "agent_updates"
SET "format" = CASE
  WHEN "downloadUrl" ILIKE '%.msi' OR "storageKey" ILIKE '%.msi' THEN 'MSI'::"AgentUpdateFormat"
  WHEN "downloadUrl" ILIKE '%.exe' OR "storageKey" ILIKE '%.exe' THEN 'EXE'::"AgentUpdateFormat"
  WHEN "downloadUrl" ILIKE '%.deb' OR "storageKey" ILIKE '%.deb' THEN 'DEB'::"AgentUpdateFormat"
  WHEN "downloadUrl" ILIKE '%.rpm' OR "storageKey" ILIKE '%.rpm' THEN 'RPM'::"AgentUpdateFormat"
  WHEN "downloadUrl" ILIKE '%.pkg' OR "storageKey" ILIKE '%.pkg' THEN 'PKG'::"AgentUpdateFormat"
  WHEN "downloadUrl" ILIKE '%.tar.gz' OR "storageKey" ILIKE '%.tar.gz' THEN 'TARGZ'::"AgentUpdateFormat"
  WHEN "platform" = 'WINDOWS' THEN 'MSI'::"AgentUpdateFormat"
  WHEN "platform" = 'LINUX' THEN 'DEB'::"AgentUpdateFormat"
  WHEN "platform" = 'MACOS' THEN 'PKG'::"AgentUpdateFormat"
END
WHERE "format" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "agent_updates" ALTER COLUMN "format" SET NOT NULL;

-- Drop old unique constraint and add new triple
ALTER TABLE "agent_updates" DROP CONSTRAINT IF EXISTS "agent_updates_version_platform_key";
DROP INDEX IF EXISTS "agent_updates_version_platform_key";
ALTER TABLE "agent_updates" ADD CONSTRAINT "agent_updates_version_platform_format_key" UNIQUE ("version", "platform", "format");

-- AlterTable: add installFormat to agents (nullable; populated by enrollment going forward)
ALTER TABLE "agents" ADD COLUMN "installFormat" "AgentUpdateFormat";

-- Backfill installFormat for existing agents based on platform default
UPDATE "agents"
SET "installFormat" = CASE
  WHEN "platform" = 'WINDOWS' THEN 'MSI'::"AgentUpdateFormat"
  WHEN "platform" = 'LINUX' THEN 'DEB'::"AgentUpdateFormat"
  WHEN "platform" = 'MACOS' THEN 'PKG'::"AgentUpdateFormat"
END
WHERE "installFormat" IS NULL;
