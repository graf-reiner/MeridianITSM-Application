-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('MSP', 'ENTERPRISE', 'B2C');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "SubscriptionPlanTier" AS ENUM ('STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('INCIDENT', 'SERVICE_REQUEST', 'PROBLEM');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('NEW', 'ASSESSMENT', 'APPROVAL_PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'IMPLEMENTING', 'REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('STANDARD', 'NORMAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STOCK', 'DEPLOYED', 'IN_REPAIR', 'RETIRED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ENROLLING', 'ACTIVE', 'OFFLINE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentPlatform" AS ENUM ('WINDOWS', 'LINUX', 'MACOS');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ArticleVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_COMMENTED', 'TICKET_RESOLVED', 'TICKET_CREATED', 'SLA_WARNING', 'SLA_BREACH', 'CHANGE_APPROVAL', 'CHANGE_UPDATED', 'MENTION', 'SYSTEM', 'CAB_INVITATION');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'ASSIGN', 'ESCALATE');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "CmdbCiStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'PLANNED');

-- CreateEnum
CREATE TYPE "CmdbCiType" AS ENUM ('SERVER', 'WORKSTATION', 'NETWORK_DEVICE', 'SOFTWARE', 'SERVICE', 'DATABASE', 'VIRTUAL_MACHINE', 'CONTAINER', 'OTHER');

-- CreateEnum
CREATE TYPE "CmdbCiEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'DEV', 'DR');

-- CreateEnum
CREATE TYPE "CmdbRelationshipType" AS ENUM ('DEPENDS_ON', 'HOSTS', 'CONNECTS_TO', 'RUNS_ON', 'BACKS_UP', 'VIRTUALIZES', 'MEMBER_OF');

-- CreateEnum
CREATE TYPE "CmdbChangeType" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

-- CreateEnum
CREATE TYPE "CmdbChangedBy" AS ENUM ('USER', 'AGENT', 'IMPORT');

-- CreateEnum
CREATE TYPE "CmdbTicketLinkType" AS ENUM ('AFFECTED', 'RELATED', 'CAUSED_BY');

-- CreateEnum
CREATE TYPE "CABAttendeeRole" AS ENUM ('CHAIRPERSON', 'MEMBER', 'OBSERVER');

-- CreateEnum
CREATE TYPE "RSVPStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "CABOutcome" AS ENUM ('APPROVED', 'REJECTED', 'DEFERRED', 'NEEDS_MORE_INFO');

-- CreateEnum
CREATE TYPE "CABMeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('WEB', 'MOBILE', 'DESKTOP', 'API', 'SERVICE', 'DATABASE_APP', 'MIDDLEWARE', 'INFRASTRUCTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DECOMMISSIONED', 'PLANNED', 'IN_DEVELOPMENT');

-- CreateEnum
CREATE TYPE "CriticalityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "HostingModel" AS ENUM ('ON_PREMISE', 'CLOUD', 'HYBRID', 'SAAS');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('PLANNING', 'DEVELOPMENT', 'PRODUCTION', 'RETIREMENT');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('DATA_FLOW', 'API_CALL', 'SHARED_DATABASE', 'AUTHENTICATION', 'FILE_TRANSFER', 'MESSAGE_QUEUE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ARCHITECTURE', 'API_SPEC', 'RUNBOOK', 'SLA_DOC', 'SECURITY', 'COMPLIANCE', 'USER_GUIDE', 'ADMIN_GUIDE', 'RELEASE_NOTES', 'DEPLOYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AppAssetRelationship" AS ENUM ('RUNS_ON', 'HOSTED_BY', 'USES');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('TICKET_CREATED', 'TICKET_UPDATED', 'TICKET_RESOLVED', 'TICKET_CLOSED', 'COMMENT_ADDED', 'CHANGE_CREATED', 'CHANGE_APPROVED', 'SLA_BREACH');

-- CreateEnum
CREATE TYPE "AlertChannelType" AS ENUM ('EMAIL', 'SMS', 'SLACK', 'TEAMS');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "TenantType" NOT NULL DEFAULT 'MSP',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "subdomain" TEXT,
    "backendUrl" TEXT,
    "settings" JSONB,
    "plan" "SubscriptionPlanTier" NOT NULL DEFAULT 'STARTER',
    "planLimitsJson" JSONB,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxAgents" INTEGER NOT NULL DEFAULT 0,
    "maxSites" INTEGER NOT NULL DEFAULT 1,
    "trialEndsAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_organizations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "notificationPreferences" JSONB,
    "siteId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_group_members" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userGroupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "customerOrganizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'INCIDENT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "impact" TEXT,
    "urgency" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" UUID,
    "requestedById" UUID,
    "queueId" UUID,
    "slaId" UUID,
    "categoryId" UUID,
    "slaBreachAt" TIMESTAMP(3),
    "slaResponseAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "tags" TEXT[],
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "CommentVisibility" NOT NULL DEFAULT 'PUBLIC',
    "timeSpentMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "actorId" UUID,
    "activityType" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_knowledge_articles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "knowledgeArticleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queues" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "autoAssign" BOOLEAN NOT NULL DEFAULT false,
    "defaultAssigneeId" UUID,
    "assignmentRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slas" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "p1ResponseMinutes" INTEGER NOT NULL,
    "p1ResolutionMinutes" INTEGER NOT NULL,
    "p2ResponseMinutes" INTEGER NOT NULL,
    "p2ResolutionMinutes" INTEGER NOT NULL,
    "p3ResponseMinutes" INTEGER NOT NULL,
    "p3ResolutionMinutes" INTEGER NOT NULL,
    "p4ResponseMinutes" INTEGER NOT NULL,
    "p4ResolutionMinutes" INTEGER NOT NULL,
    "businessHours" BOOLEAN NOT NULL DEFAULT true,
    "businessHoursStart" TEXT,
    "businessHoursEnd" TEXT,
    "businessDays" INTEGER[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "autoEscalate" BOOLEAN NOT NULL DEFAULT false,
    "escalateToQueueId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parentId" UUID,
    "userGroupId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPasswordEnc" TEXT,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapUser" TEXT,
    "imapPasswordEnc" TEXT,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "pollInterval" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailToTicket" BOOLEAN NOT NULL DEFAULT true,
    "defaultQueueId" UUID,
    "defaultCategoryId" UUID,
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "changeNumber" INTEGER NOT NULL,
    "type" "ChangeType" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "implementationPlan" TEXT,
    "backoutPlan" TEXT,
    "testingPlan" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "ChangeStatus" NOT NULL DEFAULT 'NEW',
    "requestedById" UUID,
    "assignedToId" UUID,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_approvals" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "changeId" UUID NOT NULL,
    "approverId" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "sequenceOrder" INTEGER NOT NULL DEFAULT 0,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_activities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "changeId" UUID NOT NULL,
    "actorId" UUID,
    "activityType" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_applications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "changeId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_assets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "changeId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cab_meetings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "meetingUrl" TEXT,
    "status" "CABMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cab_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cab_meeting_attendees" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "CABAttendeeRole" NOT NULL DEFAULT 'MEMBER',
    "rsvpStatus" "RSVPStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cab_meeting_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cab_meeting_changes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "changeId" UUID NOT NULL,
    "agendaOrder" INTEGER NOT NULL DEFAULT 0,
    "outcome" "CABOutcome",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cab_meeting_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "articleNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "visibility" "ArticleVisibility" NOT NULL DEFAULT 'INTERNAL',
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" UUID,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_units" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "managerName" TEXT,
    "managerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assetTag" TEXT,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DOUBLE PRECISION,
    "warrantyExpiry" TIMESTAMP(3),
    "assignedToId" UUID,
    "siteId" UUID,
    "hostname" TEXT,
    "operatingSystem" TEXT,
    "osVersion" TEXT,
    "cpuModel" TEXT,
    "cpuCores" INTEGER,
    "ramGb" DOUBLE PRECISION,
    "disks" JSONB,
    "networkInterfaces" JSONB,
    "softwareInventory" JSONB,
    "lastInventoryAt" TIMESTAMP(3),
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ApplicationType" NOT NULL DEFAULT 'OTHER',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "criticality" "CriticalityLevel" NOT NULL DEFAULT 'MEDIUM',
    "hostingModel" "HostingModel" NOT NULL DEFAULT 'ON_PREMISE',
    "techStack" TEXT[],
    "authMethod" TEXT,
    "dataClassification" TEXT,
    "annualCost" DOUBLE PRECISION,
    "rpo" INTEGER,
    "rto" INTEGER,
    "lifecycleStage" "LifecycleStage" NOT NULL DEFAULT 'PRODUCTION',
    "strategicRating" INTEGER,
    "description" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_dependencies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sourceApplicationId" UUID NOT NULL,
    "targetApplicationId" UUID NOT NULL,
    "dependencyType" "DependencyType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "url" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_activities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "actorId" UUID,
    "activityType" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_assets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "relationshipType" "AppAssetRelationship" NOT NULL DEFAULT 'RUNS_ON',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "platform" "AgentPlatform" NOT NULL,
    "platformVersion" TEXT,
    "agentVersion" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'ENROLLING',
    "lastHeartbeatAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_enrollment_tokens" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "maxEnrollments" INTEGER NOT NULL DEFAULT 1,
    "enrollCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_enrollment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "hostname" TEXT,
    "operatingSystem" TEXT,
    "osVersion" TEXT,
    "cpuModel" TEXT,
    "cpuCores" INTEGER,
    "ramGb" DOUBLE PRECISION,
    "disks" JSONB,
    "networkInterfaces" JSONB,
    "installedSoftware" JSONB,
    "localUsers" JSONB,
    "rawData" JSONB,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_samples" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "tags" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cmdb_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parentId" UUID,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmdb_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cmdb_configuration_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CmdbCiType" NOT NULL DEFAULT 'OTHER',
    "status" "CmdbCiStatus" NOT NULL DEFAULT 'ACTIVE',
    "environment" "CmdbCiEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "categoryId" UUID,
    "assetId" UUID,
    "agentId" UUID,
    "ownerId" UUID,
    "siteId" UUID,
    "attributesJson" JSONB,
    "discoveredAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmdb_configuration_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cmdb_relationships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "relationshipType" "CmdbRelationshipType" NOT NULL,
    "description" TEXT,
    "isDiscovered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmdb_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cmdb_change_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "changeType" "CmdbChangeType" NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" "CmdbChangedBy" NOT NULL,
    "agentId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmdb_change_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cmdb_ticket_links" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ciId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "linkType" "CmdbTicketLinkType" NOT NULL DEFAULT 'AFFECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmdb_ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_sessions" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" "SubscriptionPlanTier" NOT NULL,
    "displayName" TEXT NOT NULL,
    "monthlyPriceUsd" DOUBLE PRECISION NOT NULL,
    "annualPriceUsd" DOUBLE PRECISION NOT NULL,
    "limitsJson" JSONB NOT NULL,
    "stripePriceIdMonthly" TEXT,
    "stripePriceIdAnnual" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_subscriptions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage_snapshots" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "activeAgents" INTEGER NOT NULL DEFAULT 0,
    "ticketCount" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_notes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "vendorId" UUID,
    "name" TEXT NOT NULL,
    "contractNumber" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "notes" TEXT,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_assets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "resourceId" TEXT,
    "resource" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT,
    "variables" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_configurations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" "AlertChannelType" NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "recipients" TEXT[],
    "filters" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" "WebhookEventType"[],
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "webhookId" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" UUID NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "customer_organizations_tenantId_idx" ON "customer_organizations"("tenantId");

-- CreateIndex
CREATE INDEX "customer_organizations_tenantId_createdAt_idx" ON "customer_organizations"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_organizations_tenantId_slug_key" ON "customer_organizations"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_status_idx" ON "users"("tenantId", "status");

-- CreateIndex
CREATE INDEX "users_tenantId_createdAt_idx" ON "users"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "user_groups_tenantId_idx" ON "user_groups"("tenantId");

-- CreateIndex
CREATE INDEX "user_group_members_tenantId_idx" ON "user_group_members"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_group_members_userGroupId_userId_key" ON "user_group_members"("userGroupId", "userId");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_slug_key" ON "roles"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "user_roles_tenantId_idx" ON "user_roles"("tenantId");

-- CreateIndex
CREATE INDEX "user_roles_tenantId_userId_idx" ON "user_roles"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_tenantId_idx" ON "sessions"("tenantId");

-- CreateIndex
CREATE INDEX "sessions_tenantId_userId_idx" ON "sessions"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "tickets_tenantId_idx" ON "tickets"("tenantId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_status_idx" ON "tickets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tickets_tenantId_priority_idx" ON "tickets"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "tickets_tenantId_assignedToId_idx" ON "tickets"("tenantId", "assignedToId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_createdAt_idx" ON "tickets"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_tenantId_slaBreachAt_idx" ON "tickets"("tenantId", "slaBreachAt");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_tenantId_ticketNumber_key" ON "tickets"("tenantId", "ticketNumber");

-- CreateIndex
CREATE INDEX "ticket_comments_tenantId_idx" ON "ticket_comments"("tenantId");

-- CreateIndex
CREATE INDEX "ticket_comments_tenantId_ticketId_idx" ON "ticket_comments"("tenantId", "ticketId");

-- CreateIndex
CREATE INDEX "ticket_attachments_tenantId_idx" ON "ticket_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "ticket_attachments_tenantId_ticketId_idx" ON "ticket_attachments"("tenantId", "ticketId");

-- CreateIndex
CREATE INDEX "ticket_activities_tenantId_idx" ON "ticket_activities"("tenantId");

-- CreateIndex
CREATE INDEX "ticket_activities_tenantId_ticketId_idx" ON "ticket_activities"("tenantId", "ticketId");

-- CreateIndex
CREATE INDEX "ticket_activities_tenantId_createdAt_idx" ON "ticket_activities"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_knowledge_articles_tenantId_idx" ON "ticket_knowledge_articles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_knowledge_articles_ticketId_knowledgeArticleId_key" ON "ticket_knowledge_articles"("ticketId", "knowledgeArticleId");

-- CreateIndex
CREATE INDEX "queues_tenantId_idx" ON "queues"("tenantId");

-- CreateIndex
CREATE INDEX "slas_tenantId_idx" ON "slas"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "slas_tenantId_name_key" ON "slas"("tenantId", "name");

-- CreateIndex
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_name_key" ON "categories"("tenantId", "name");

-- CreateIndex
CREATE INDEX "email_accounts_tenantId_idx" ON "email_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "changes_tenantId_idx" ON "changes"("tenantId");

-- CreateIndex
CREATE INDEX "changes_tenantId_status_idx" ON "changes"("tenantId", "status");

-- CreateIndex
CREATE INDEX "changes_tenantId_createdAt_idx" ON "changes"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "changes_tenantId_scheduledStart_idx" ON "changes"("tenantId", "scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "changes_tenantId_changeNumber_key" ON "changes"("tenantId", "changeNumber");

-- CreateIndex
CREATE INDEX "change_approvals_tenantId_idx" ON "change_approvals"("tenantId");

-- CreateIndex
CREATE INDEX "change_approvals_tenantId_changeId_idx" ON "change_approvals"("tenantId", "changeId");

-- CreateIndex
CREATE INDEX "change_approvals_tenantId_status_idx" ON "change_approvals"("tenantId", "status");

-- CreateIndex
CREATE INDEX "change_activities_tenantId_idx" ON "change_activities"("tenantId");

-- CreateIndex
CREATE INDEX "change_activities_tenantId_changeId_idx" ON "change_activities"("tenantId", "changeId");

-- CreateIndex
CREATE INDEX "change_applications_tenantId_idx" ON "change_applications"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "change_applications_changeId_applicationId_key" ON "change_applications"("changeId", "applicationId");

-- CreateIndex
CREATE INDEX "change_assets_tenantId_idx" ON "change_assets"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "change_assets_changeId_assetId_key" ON "change_assets"("changeId", "assetId");

-- CreateIndex
CREATE INDEX "cab_meetings_tenantId_idx" ON "cab_meetings"("tenantId");

-- CreateIndex
CREATE INDEX "cab_meetings_tenantId_status_idx" ON "cab_meetings"("tenantId", "status");

-- CreateIndex
CREATE INDEX "cab_meetings_tenantId_scheduledFor_idx" ON "cab_meetings"("tenantId", "scheduledFor");

-- CreateIndex
CREATE INDEX "cab_meeting_attendees_tenantId_idx" ON "cab_meeting_attendees"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cab_meeting_attendees_meetingId_userId_key" ON "cab_meeting_attendees"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "cab_meeting_changes_tenantId_idx" ON "cab_meeting_changes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cab_meeting_changes_meetingId_changeId_key" ON "cab_meeting_changes"("meetingId", "changeId");

-- CreateIndex
CREATE INDEX "knowledge_articles_tenantId_idx" ON "knowledge_articles"("tenantId");

-- CreateIndex
CREATE INDEX "knowledge_articles_tenantId_status_idx" ON "knowledge_articles"("tenantId", "status");

-- CreateIndex
CREATE INDEX "knowledge_articles_tenantId_createdAt_idx" ON "knowledge_articles"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_tenantId_articleNumber_key" ON "knowledge_articles"("tenantId", "articleNumber");

-- CreateIndex
CREATE INDEX "sites_tenantId_idx" ON "sites"("tenantId");

-- CreateIndex
CREATE INDEX "business_units_tenantId_idx" ON "business_units"("tenantId");

-- CreateIndex
CREATE INDEX "assets_tenantId_idx" ON "assets"("tenantId");

-- CreateIndex
CREATE INDEX "assets_tenantId_status_idx" ON "assets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "assets_tenantId_createdAt_idx" ON "assets"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "applications_tenantId_idx" ON "applications"("tenantId");

-- CreateIndex
CREATE INDEX "applications_tenantId_status_idx" ON "applications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "applications_tenantId_createdAt_idx" ON "applications"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "application_dependencies_tenantId_idx" ON "application_dependencies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "application_dependencies_sourceApplicationId_targetApplicat_key" ON "application_dependencies"("sourceApplicationId", "targetApplicationId");

-- CreateIndex
CREATE INDEX "application_documents_tenantId_idx" ON "application_documents"("tenantId");

-- CreateIndex
CREATE INDEX "application_documents_tenantId_applicationId_idx" ON "application_documents"("tenantId", "applicationId");

-- CreateIndex
CREATE INDEX "application_activities_tenantId_idx" ON "application_activities"("tenantId");

-- CreateIndex
CREATE INDEX "application_activities_tenantId_applicationId_idx" ON "application_activities"("tenantId", "applicationId");

-- CreateIndex
CREATE INDEX "application_assets_tenantId_idx" ON "application_assets"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "application_assets_applicationId_assetId_key" ON "application_assets"("applicationId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_agentKey_key" ON "agents"("agentKey");

-- CreateIndex
CREATE INDEX "agents_tenantId_idx" ON "agents"("tenantId");

-- CreateIndex
CREATE INDEX "agents_tenantId_status_idx" ON "agents"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_enrollment_tokens_tokenHash_key" ON "agent_enrollment_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "agent_enrollment_tokens_tenantId_idx" ON "agent_enrollment_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_snapshots_tenantId_idx" ON "inventory_snapshots"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_snapshots_tenantId_agentId_idx" ON "inventory_snapshots"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "inventory_snapshots_tenantId_collectedAt_idx" ON "inventory_snapshots"("tenantId", "collectedAt");

-- CreateIndex
CREATE INDEX "metric_samples_tenantId_idx" ON "metric_samples"("tenantId");

-- CreateIndex
CREATE INDEX "metric_samples_tenantId_agentId_idx" ON "metric_samples"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "metric_samples_tenantId_timestamp_idx" ON "metric_samples"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "cmdb_categories_tenantId_idx" ON "cmdb_categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cmdb_categories_tenantId_slug_key" ON "cmdb_categories"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "cmdb_configuration_items_tenantId_idx" ON "cmdb_configuration_items"("tenantId");

-- CreateIndex
CREATE INDEX "cmdb_configuration_items_tenantId_status_idx" ON "cmdb_configuration_items"("tenantId", "status");

-- CreateIndex
CREATE INDEX "cmdb_configuration_items_tenantId_type_idx" ON "cmdb_configuration_items"("tenantId", "type");

-- CreateIndex
CREATE INDEX "cmdb_configuration_items_tenantId_createdAt_idx" ON "cmdb_configuration_items"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cmdb_configuration_items_tenantId_ciNumber_key" ON "cmdb_configuration_items"("tenantId", "ciNumber");

-- CreateIndex
CREATE INDEX "cmdb_relationships_tenantId_idx" ON "cmdb_relationships"("tenantId");

-- CreateIndex
CREATE INDEX "cmdb_relationships_tenantId_sourceId_idx" ON "cmdb_relationships"("tenantId", "sourceId");

-- CreateIndex
CREATE INDEX "cmdb_relationships_tenantId_targetId_idx" ON "cmdb_relationships"("tenantId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "cmdb_relationships_sourceId_targetId_relationshipType_key" ON "cmdb_relationships"("sourceId", "targetId", "relationshipType");

-- CreateIndex
CREATE INDEX "cmdb_change_records_tenantId_idx" ON "cmdb_change_records"("tenantId");

-- CreateIndex
CREATE INDEX "cmdb_change_records_tenantId_ciId_idx" ON "cmdb_change_records"("tenantId", "ciId");

-- CreateIndex
CREATE INDEX "cmdb_change_records_tenantId_createdAt_idx" ON "cmdb_change_records"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "cmdb_ticket_links_tenantId_idx" ON "cmdb_ticket_links"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "cmdb_ticket_links_ciId_ticketId_key" ON "cmdb_ticket_links"("ciId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "owner_users_email_key" ON "owner_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "owner_sessions_sessionToken_key" ON "owner_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "owner_sessions_ownerUserId_idx" ON "owner_sessions"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_subscriptions_tenantId_key" ON "tenant_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_usage_snapshots_tenantId_idx" ON "tenant_usage_snapshots"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_snapshots_tenantId_snapshotDate_key" ON "tenant_usage_snapshots"("tenantId", "snapshotDate");

-- CreateIndex
CREATE INDEX "owner_notes_tenantId_idx" ON "owner_notes"("tenantId");

-- CreateIndex
CREATE INDEX "vendors_tenantId_idx" ON "vendors"("tenantId");

-- CreateIndex
CREATE INDEX "contracts_tenantId_idx" ON "contracts"("tenantId");

-- CreateIndex
CREATE INDEX "contracts_tenantId_endDate_idx" ON "contracts"("tenantId", "endDate");

-- CreateIndex
CREATE INDEX "contract_assets_tenantId_idx" ON "contract_assets"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_assets_contractId_assetId_key" ON "contract_assets"("contractId", "assetId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_action_idx" ON "audit_logs"("tenantId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_idx" ON "notifications"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_userId_isRead_idx" ON "notifications"("tenantId", "userId", "isRead");

-- CreateIndex
CREATE INDEX "device_tokens_tenantId_idx" ON "device_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "device_tokens_tenantId_userId_idx" ON "device_tokens"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_userId_deviceId_key" ON "device_tokens"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "email_templates_tenantId_idx" ON "email_templates"("tenantId");

-- CreateIndex
CREATE INDEX "alert_configurations_tenantId_idx" ON "alert_configurations"("tenantId");

-- CreateIndex
CREATE INDEX "scheduled_reports_tenantId_idx" ON "scheduled_reports"("tenantId");

-- CreateIndex
CREATE INDEX "webhooks_tenantId_idx" ON "webhooks"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenantId_idx" ON "webhook_deliveries"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenantId_webhookId_idx" ON "webhook_deliveries"("tenantId", "webhookId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenantId_createdAt_idx" ON "webhook_deliveries"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_tenantId_idx" ON "password_reset_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_tenantId_userId_idx" ON "password_reset_tokens"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_processedAt_idx" ON "stripe_webhook_events"("processedAt");

-- AddForeignKey
ALTER TABLE "customer_organizations" ADD CONSTRAINT "customer_organizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_userGroupId_fkey" FOREIGN KEY ("userGroupId") REFERENCES "user_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_customerOrganizationId_fkey" FOREIGN KEY ("customerOrganizationId") REFERENCES "customer_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "slas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_knowledge_articles" ADD CONSTRAINT "ticket_knowledge_articles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_knowledge_articles" ADD CONSTRAINT "ticket_knowledge_articles_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_knowledge_articles" ADD CONSTRAINT "ticket_knowledge_articles_knowledgeArticleId_fkey" FOREIGN KEY ("knowledgeArticleId") REFERENCES "knowledge_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slas" ADD CONSTRAINT "slas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_userGroupId_fkey" FOREIGN KEY ("userGroupId") REFERENCES "user_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changes" ADD CONSTRAINT "changes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_approvals" ADD CONSTRAINT "change_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_activities" ADD CONSTRAINT "change_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_activities" ADD CONSTRAINT "change_activities_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_applications" ADD CONSTRAINT "change_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_applications" ADD CONSTRAINT "change_applications_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_applications" ADD CONSTRAINT "change_applications_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_assets" ADD CONSTRAINT "change_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_assets" ADD CONSTRAINT "change_assets_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_assets" ADD CONSTRAINT "change_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meetings" ADD CONSTRAINT "cab_meetings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meeting_attendees" ADD CONSTRAINT "cab_meeting_attendees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meeting_attendees" ADD CONSTRAINT "cab_meeting_attendees_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "cab_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meeting_attendees" ADD CONSTRAINT "cab_meeting_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meeting_changes" ADD CONSTRAINT "cab_meeting_changes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meeting_changes" ADD CONSTRAINT "cab_meeting_changes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "cab_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cab_meeting_changes" ADD CONSTRAINT "cab_meeting_changes_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_dependencies" ADD CONSTRAINT "application_dependencies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_dependencies" ADD CONSTRAINT "application_dependencies_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_dependencies" ADD CONSTRAINT "application_dependencies_targetApplicationId_fkey" FOREIGN KEY ("targetApplicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_activities" ADD CONSTRAINT "application_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_activities" ADD CONSTRAINT "application_activities_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assets" ADD CONSTRAINT "application_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assets" ADD CONSTRAINT "application_assets_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assets" ADD CONSTRAINT "application_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_enrollment_tokens" ADD CONSTRAINT "agent_enrollment_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_samples" ADD CONSTRAINT "metric_samples_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_samples" ADD CONSTRAINT "metric_samples_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_categories" ADD CONSTRAINT "cmdb_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_categories" ADD CONSTRAINT "cmdb_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "cmdb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_configuration_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_configuration_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cmdb_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_configuration_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_configuration_items_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_relationships" ADD CONSTRAINT "cmdb_relationships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_relationships" ADD CONSTRAINT "cmdb_relationships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "cmdb_configuration_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_relationships" ADD CONSTRAINT "cmdb_relationships_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "cmdb_configuration_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_change_records" ADD CONSTRAINT "cmdb_change_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_change_records" ADD CONSTRAINT "cmdb_change_records_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_change_records" ADD CONSTRAINT "cmdb_change_records_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_ticket_links" ADD CONSTRAINT "cmdb_ticket_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_ticket_links" ADD CONSTRAINT "cmdb_ticket_links_ciId_fkey" FOREIGN KEY ("ciId") REFERENCES "cmdb_configuration_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cmdb_ticket_links" ADD CONSTRAINT "cmdb_ticket_links_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "owner_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage_snapshots" ADD CONSTRAINT "tenant_usage_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_notes" ADD CONSTRAINT "owner_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_notes" ADD CONSTRAINT "owner_notes_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "owner_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assets" ADD CONSTRAINT "contract_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assets" ADD CONSTRAINT "contract_assets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_assets" ADD CONSTRAINT "contract_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_configurations" ADD CONSTRAINT "alert_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
