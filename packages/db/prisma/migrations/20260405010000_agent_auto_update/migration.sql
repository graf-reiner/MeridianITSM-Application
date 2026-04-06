-- CreateTable
CREATE TABLE "agent_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" TEXT NOT NULL,
    "platform" "AgentPlatform" NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "releaseNotes" TEXT,
    "storageKey" TEXT,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_updates_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Agent
ALTER TABLE "agents" ADD COLUMN "forceUpdateUrl" TEXT;
ALTER TABLE "agents" ADD COLUMN "updateInProgress" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agents" ADD COLUMN "updateStartedAt" TIMESTAMP(3);

-- AlterTable: Tenant
ALTER TABLE "tenants" ADD COLUMN "agentUpdatePolicy" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "tenants" ADD COLUMN "agentUpdateWindowStart" TEXT;
ALTER TABLE "tenants" ADD COLUMN "agentUpdateWindowEnd" TEXT;
ALTER TABLE "tenants" ADD COLUMN "agentUpdateWindowDay" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agent_updates_version_platform_key" ON "agent_updates"("version", "platform");
