-- Problem Management: Add root cause tracking and incident-problem linking

-- Add problem-specific fields to tickets table
ALTER TABLE "tickets" ADD COLUMN "rootCause" TEXT;
ALTER TABLE "tickets" ADD COLUMN "workaround" TEXT;
ALTER TABLE "tickets" ADD COLUMN "knowledgeArticleId" UUID;

-- Foreign key for known error KB article link
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_knowledgeArticleId_fkey"
  FOREIGN KEY ("knowledgeArticleId") REFERENCES "knowledge_articles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Incident-to-Problem linking table
CREATE TABLE "incident_problem_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "incidentId" UUID NOT NULL,
  "problemId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "incident_problem_links_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one link per incident-problem pair per tenant
CREATE UNIQUE INDEX "incident_problem_links_tenantId_incidentId_problemId_key"
  ON "incident_problem_links"("tenantId", "incidentId", "problemId");

-- Performance indexes
CREATE INDEX "incident_problem_links_tenantId_idx"
  ON "incident_problem_links"("tenantId");
CREATE INDEX "incident_problem_links_tenantId_problemId_idx"
  ON "incident_problem_links"("tenantId", "problemId");

-- Foreign keys
ALTER TABLE "incident_problem_links" ADD CONSTRAINT "incident_problem_links_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incident_problem_links" ADD CONSTRAINT "incident_problem_links_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_problem_links" ADD CONSTRAINT "incident_problem_links_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
