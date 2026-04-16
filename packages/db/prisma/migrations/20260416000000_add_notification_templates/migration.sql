-- CreateEnum
CREATE TYPE "NotificationTemplateChannel" AS ENUM ('EMAIL', 'TELEGRAM', 'SLACK', 'TEAMS', 'DISCORD');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" "NotificationTemplateChannel" NOT NULL,
    "content" JSONB NOT NULL,
    "contexts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenantId_name_channel_key" ON "notification_templates"("tenantId", "name", "channel");

-- CreateIndex
CREATE INDEX "notification_templates_tenantId_channel_idx" ON "notification_templates"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "notification_templates_tenantId_isActive_idx" ON "notification_templates"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
