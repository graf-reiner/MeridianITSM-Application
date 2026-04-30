-- CreateTable
CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "objectKey" TEXT,
    "sizeBytes" BIGINT,
    "attachmentCount" INTEGER,
    "dbRowCounts" JSONB,
    "keyFingerprint" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "owner_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "backup_runs_status_startedAt_idx" ON "backup_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "backup_runs_trigger_startedAt_idx" ON "backup_runs"("trigger", "startedAt");

-- AddForeignKey
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "owner_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_settings" ADD CONSTRAINT "owner_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "owner_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
