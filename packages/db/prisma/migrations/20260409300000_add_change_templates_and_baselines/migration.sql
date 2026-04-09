-- CreateTable: change_templates (Gap 4 - Change Templates)
CREATE TABLE "change_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "changeType" "ChangeType" NOT NULL DEFAULT 'NORMAL',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "defaultTitle" TEXT,
    "defaultDescription" TEXT,
    "defaultBackoutPlan" TEXT,
    "defaultAssigneeId" UUID,
    "defaultQueueId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_templates_tenantId_idx" ON "change_templates"("tenantId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "change_templates_tenantId_name_key" ON "change_templates"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "change_templates" ADD CONSTRAINT "change_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: cmdb_baselines (Gap 5 - CMDB Configuration Baselines)
CREATE TABLE "cmdb_baselines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cmdb_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cmdb_baselines_tenantId_idx" ON "cmdb_baselines"("tenantId");

-- CreateIndex
CREATE INDEX "cmdb_baselines_tenantId_ciId_idx" ON "cmdb_baselines"("tenantId", "ciId");

-- AddForeignKey
ALTER TABLE "cmdb_baselines" ADD CONSTRAINT "cmdb_baselines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_baselines" ADD CONSTRAINT "cmdb_baselines_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
