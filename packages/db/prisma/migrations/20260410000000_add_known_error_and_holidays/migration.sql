-- ITIL Gap 9: Known Error flag on KnowledgeArticle
ALTER TABLE "knowledge_articles"
  ADD COLUMN "isKnownError" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "knowledge_articles_tenantId_isKnownError_idx"
  ON "knowledge_articles"("tenantId", "isKnownError");

-- ITIL Gap 8: Holiday calendar for SLA business-hours exclusion
CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "holidays_tenantId_idx" ON "holidays"("tenantId");

CREATE UNIQUE INDEX "holidays_tenantId_date_key" ON "holidays"("tenantId", "date");

ALTER TABLE "holidays"
  ADD CONSTRAINT "holidays_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
