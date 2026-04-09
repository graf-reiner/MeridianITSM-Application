-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "isMajorIncident" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN "majorIncidentCoordinatorId" UUID;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_majorIncidentCoordinatorId_fkey"
  FOREIGN KEY ("majorIncidentCoordinatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (partial index for major incidents only)
CREATE INDEX "tickets_tenantId_isMajorIncident_idx" ON "tickets"("tenantId") WHERE "isMajorIncident" = true;
