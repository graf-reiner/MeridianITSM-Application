-- AlterTable: add lastReconciledAt to agents
ALTER TABLE "agents" ADD COLUMN     "lastReconciledAt" TIMESTAMP(3);

-- AlterTable: add retention/interval config fields to tenants
ALTER TABLE "tenants" ADD COLUMN     "changeRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "heartbeatIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "inventoryIntervalMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "inventoryMinIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "snapshotRetentionCount" INTEGER NOT NULL DEFAULT 30;

-- CreateTable: inventory_diffs
-- fromSnapshotId / toSnapshotId are intentionally NOT FK-constrained so diffs survive snapshot pruning
CREATE TABLE "inventory_diffs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "ciId" UUID,
    "fromSnapshotId" UUID,
    "toSnapshotId" UUID,
    "diffJson" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_diffs_tenantId_agentId_collectedAt_idx" ON "inventory_diffs"("tenantId", "agentId", "collectedAt");

-- CreateIndex
CREATE INDEX "inventory_diffs_tenantId_ciId_collectedAt_idx" ON "inventory_diffs"("tenantId", "ciId", "collectedAt");

-- AddForeignKey
ALTER TABLE "inventory_diffs" ADD CONSTRAINT "inventory_diffs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_diffs" ADD CONSTRAINT "inventory_diffs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_diffs" ADD CONSTRAINT "inventory_diffs_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
