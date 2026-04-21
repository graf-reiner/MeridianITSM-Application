-- Tenant policy toggle: require a Change record to be approved before agent deploys run
ALTER TABLE "tenants" ADD COLUMN "agentDeployRequiresChange" BOOLEAN NOT NULL DEFAULT false;

-- Link a deployment to the Change record that gates (or audits) it
ALTER TABLE "agent_update_deployments" ADD COLUMN "changeId" UUID;
ALTER TABLE "agent_update_deployments" ADD COLUMN "awaitingApproval" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "agent_update_deployments_changeId_key" ON "agent_update_deployments"("changeId");

ALTER TABLE "agent_update_deployments"
  ADD CONSTRAINT "agent_update_deployments_changeId_fkey"
  FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
