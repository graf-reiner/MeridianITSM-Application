-- AlterTable: Add autoCloseDays to queues and categories
ALTER TABLE "queues" ADD COLUMN "autoCloseDays" INTEGER;
ALTER TABLE "categories" ADD COLUMN "autoCloseDays" INTEGER;

-- CreateTable: Canned responses / quick replies
CREATE TABLE "canned_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "shortcut" TEXT,
    "category" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PERSONAL',
    "createdById" UUID NOT NULL,
    "groupId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canned_responses_tenantId_createdById_idx" ON "canned_responses"("tenantId", "createdById");
CREATE INDEX "canned_responses_tenantId_visibility_idx" ON "canned_responses"("tenantId", "visibility");

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "user_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Add ccUserIds to ticket_comments for per-comment CC
ALTER TABLE "ticket_comments" ADD COLUMN "ccUserIds" UUID[] DEFAULT '{}';

-- CreateTable: Ticket watchers
CREATE TABLE "ticket_watchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_watchers_ticketId_userId_key" ON "ticket_watchers"("ticketId", "userId");
CREATE INDEX "ticket_watchers_tenantId_userId_idx" ON "ticket_watchers"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Saved ticket views / filter presets
CREATE TABLE "saved_ticket_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "sortBy" TEXT DEFAULT 'createdAt',
    "sortDir" TEXT DEFAULT 'desc',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_ticket_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_ticket_views_tenantId_userId_idx" ON "saved_ticket_views"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "saved_ticket_views" ADD CONSTRAINT "saved_ticket_views_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_ticket_views" ADD CONSTRAINT "saved_ticket_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add parentId and mergedIntoId to tickets
ALTER TABLE "tickets" ADD COLUMN "parentId" UUID;
ALTER TABLE "tickets" ADD COLUMN "mergedIntoId" UUID;

-- CreateIndex
CREATE INDEX "tickets_tenantId_parentId_idx" ON "tickets"("tenantId", "parentId");

-- AddForeignKey (self-referential)
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: Ticket links (relationships between tickets)
CREATE TABLE "ticket_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "fromTicketId" UUID NOT NULL,
    "toTicketId" UUID NOT NULL,
    "linkType" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_links_fromTicketId_toTicketId_linkType_key" ON "ticket_links"("fromTicketId", "toTicketId", "linkType");
CREATE INDEX "ticket_links_tenantId_idx" ON "ticket_links"("tenantId");
CREATE INDEX "ticket_links_fromTicketId_idx" ON "ticket_links"("fromTicketId");
CREATE INDEX "ticket_links_toTicketId_idx" ON "ticket_links"("toTicketId");

-- AddForeignKey
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_fromTicketId_fkey" FOREIGN KEY ("fromTicketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_toTicketId_fkey" FOREIGN KEY ("toTicketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Survey templates (CSAT)
CREATE TABLE "survey_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL DEFAULT 'RESOLVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survey_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "survey_templates_tenantId_idx" ON "survey_templates"("tenantId");

ALTER TABLE "survey_templates" ADD CONSTRAINT "survey_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Survey responses (CSAT)
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survey_responses_ticketId_key" ON "survey_responses"("ticketId");
CREATE INDEX "survey_responses_tenantId_idx" ON "survey_responses"("tenantId");
CREATE INDEX "survey_responses_tenantId_templateId_idx" ON "survey_responses"("tenantId", "templateId");

ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "survey_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Escalation policies
CREATE TABLE "escalation_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "levels" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "escalation_policies_tenantId_idx" ON "escalation_policies"("tenantId");

ALTER TABLE "escalation_policies" ADD CONSTRAINT "escalation_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add escalationPolicyId to SLAs
ALTER TABLE "slas" ADD COLUMN "escalationPolicyId" UUID;
ALTER TABLE "slas" ADD CONSTRAINT "slas_escalationPolicyId_fkey" FOREIGN KEY ("escalationPolicyId") REFERENCES "escalation_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum: Add PENDING_APPROVAL to TicketStatus
ALTER TYPE "TicketStatus" ADD VALUE 'PENDING_APPROVAL';

-- CreateTable: Ticket approval rules
CREATE TABLE "ticket_approval_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "approvers" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_approval_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_approval_rules_tenantId_idx" ON "ticket_approval_rules"("tenantId");

ALTER TABLE "ticket_approval_rules" ADD CONSTRAINT "ticket_approval_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Ticket approvals
CREATE TABLE "ticket_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "approverId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_approvals_tenantId_ticketId_idx" ON "ticket_approvals"("tenantId", "ticketId");
CREATE INDEX "ticket_approvals_tenantId_approverId_status_idx" ON "ticket_approvals"("tenantId", "approverId", "status");

ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_approvals" ADD CONSTRAINT "ticket_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Recurring tickets
CREATE TABLE "recurring_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TicketType" NOT NULL DEFAULT 'INCIDENT',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "categoryId" UUID,
    "queueId" UUID,
    "assignedToId" UUID,
    "assignedGroupId" UUID,
    "tags" TEXT[] DEFAULT '{}',
    "customFields" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_tickets_tenantId_idx" ON "recurring_tickets"("tenantId");
CREATE INDEX "recurring_tickets_isActive_nextRunAt_idx" ON "recurring_tickets"("isActive", "nextRunAt");

ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recurring_tickets" ADD CONSTRAINT "recurring_tickets_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: Ticket templates (form-builder)
CREATE TABLE "ticket_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "ticketType" "TicketType" NOT NULL DEFAULT 'SERVICE_REQUEST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultPriority" "TicketPriority",
    "defaultCategoryId" UUID,
    "defaultQueueId" UUID,
    "defaultAssigneeId" UUID,
    "defaultGroupId" UUID,
    "defaultSlaId" UUID,
    "defaultTags" TEXT[] DEFAULT '{}',
    "fields" JSONB NOT NULL,
    "sections" JSONB,
    "titleTemplate" TEXT,
    "descriptionTemplate" TEXT,
    "createdById" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_templates_tenantId_idx" ON "ticket_templates"("tenantId");
CREATE INDEX "ticket_templates_tenantId_isActive_idx" ON "ticket_templates"("tenantId", "isActive");

ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_templates" ADD CONSTRAINT "ticket_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
