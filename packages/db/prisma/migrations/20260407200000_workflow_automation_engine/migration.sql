-- Workflow Automation Engine — replaces and absorbs notification rules

-- Workflow: top-level definition
CREATE TABLE "workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trigger" TEXT NOT NULL,
    "scopedQueueId" UUID,
    "currentVersionId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_tenantId_trigger_status_idx" ON "workflows"("tenantId", "trigger", "status");
CREATE INDEX "workflows_tenantId_idx" ON "workflows"("tenantId");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_scopedQueueId_fkey"
    FOREIGN KEY ("scopedQueueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkflowVersion: immutable graph snapshots
CREATE TABLE "workflow_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflowId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "graphJson" JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_versions_workflowId_version_key" ON "workflow_versions"("workflowId", "version");
CREATE INDEX "workflow_versions_workflowId_idx" ON "workflow_versions"("workflowId");

ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkflowExecution: runtime execution records
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "eventPayload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_executions_tenantId_startedAt_idx" ON "workflow_executions"("tenantId", "startedAt");
CREATE INDEX "workflow_executions_workflowId_startedAt_idx" ON "workflow_executions"("workflowId", "startedAt");

ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WorkflowExecutionStep: per-node execution records
CREATE TABLE "workflow_execution_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "executionId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inputData" JSONB,
    "outputData" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_execution_steps_executionId_idx" ON "workflow_execution_steps"("executionId");

ALTER TABLE "workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_executionId_fkey"
    FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkflowAuditLog: change audit trail
CREATE TABLE "workflow_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflow_audit_logs_tenantId_createdAt_idx" ON "workflow_audit_logs"("tenantId", "createdAt");
CREATE INDEX "workflow_audit_logs_workflowId_idx" ON "workflow_audit_logs"("workflowId");

ALTER TABLE "workflow_audit_logs" ADD CONSTRAINT "workflow_audit_logs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_audit_logs" ADD CONSTRAINT "workflow_audit_logs_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
