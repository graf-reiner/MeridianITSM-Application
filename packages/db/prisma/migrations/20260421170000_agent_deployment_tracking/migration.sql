-- ============================================================================
-- Agent deployment tracking + event log
--   - agent_update_deployments     (one row per deploy action)
--   - agent_update_deployment_targets (one row per targeted agent)
--   - agent_event_logs             (agent-emitted events synced to server)
--
-- Tenant-scoped per CLAUDE.md Rule 1. Timeline indexes mirror TicketActivity.
-- ============================================================================

-- agent_update_deployments
CREATE TABLE "agent_update_deployments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentUpdateId" UUID NOT NULL,
    "triggeredById" UUID,
    "targetKind" TEXT NOT NULL,
    "platform" "AgentPlatform" NOT NULL,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_update_deployments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_update_deployments_tenantId_idx" ON "agent_update_deployments"("tenantId");
CREATE INDEX "agent_update_deployments_tenantId_createdAt_idx" ON "agent_update_deployments"("tenantId", "createdAt");

ALTER TABLE "agent_update_deployments"
    ADD CONSTRAINT "agent_update_deployments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "agent_update_deployments_agentUpdateId_fkey" FOREIGN KEY ("agentUpdateId") REFERENCES "agent_updates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "agent_update_deployments_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- agent_update_deployment_targets
CREATE TABLE "agent_update_deployment_targets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deploymentId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "fromVersion" TEXT,
    "toVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_update_deployment_targets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_update_deployment_targets_tenantId_idx" ON "agent_update_deployment_targets"("tenantId");
CREATE INDEX "agent_update_deployment_targets_tenantId_deploymentId_idx" ON "agent_update_deployment_targets"("tenantId", "deploymentId");
CREATE INDEX "agent_update_deployment_targets_tenantId_agentId_idx" ON "agent_update_deployment_targets"("tenantId", "agentId");

ALTER TABLE "agent_update_deployment_targets"
    ADD CONSTRAINT "agent_update_deployment_targets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "agent_update_deployment_targets_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "agent_update_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "agent_update_deployment_targets_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- agent_event_logs
CREATE TABLE "agent_event_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_event_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_event_logs_tenantId_idx" ON "agent_event_logs"("tenantId");
CREATE INDEX "agent_event_logs_tenantId_agentId_createdAt_idx" ON "agent_event_logs"("tenantId", "agentId", "createdAt");
CREATE INDEX "agent_event_logs_tenantId_level_idx" ON "agent_event_logs"("tenantId", "level");

ALTER TABLE "agent_event_logs"
    ADD CONSTRAINT "agent_event_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "agent_event_logs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
