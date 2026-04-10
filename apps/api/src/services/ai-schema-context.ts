/**
 * AI Schema Context — Compressed DDL for the LLM system prompt.
 *
 * This provides the database schema to the AI so it can generate SQL queries.
 * The schema is a compressed representation of the Prisma models, mapping
 * model names to PostgreSQL table/column names.
 *
 * IMPORTANT: When adding new models or fields to the Prisma schema,
 * update this file to keep the AI assistant aware of the new data.
 * Sensitive tables (auth, billing, MFA) are excluded intentionally.
 */

/** Tables the AI should NEVER query (auth secrets, billing, MFA, owner portal) */
export const EXCLUDED_TABLES = [
  'owner_users',
  'owner_sessions',
  'owner_notes',
  'owner_smtp_config',
  'subscription_plans',
  'tenant_subscriptions',
  'tenant_usage_snapshots',
  'api_keys',
  'sessions',
  'password_reset_tokens',
  'stripe_webhook_events',
  'sso_connections',
  'federated_identities',
  'tenant_auth_settings',
  'mfa_devices',
  'mfa_challenges',
  'mfa_trusted_devices',
  'recovery_codes',
  'chat_conversations',
  'chat_messages',
];

/**
 * Compressed database schema for the LLM system prompt.
 * Format: table_name (PrismaModel): column(type), ...
 * FK references shown as FK→table. Enums shown inline.
 * All column names are camelCase and MUST be double-quoted in SQL.
 */
export const SCHEMA_CONTEXT = `
DATABASE SCHEMA (PostgreSQL — column names are camelCase, use double quotes):

-- CORE TENANCY --
tenants (Tenant): id(uuid PK), name(text), slug(text UNIQUE), type(MSP|ENTERPRISE|B2C), status(ACTIVE|INACTIVE|SUSPENDED), subdomain(text), settings(jsonb), plan(STARTER|PROFESSIONAL|BUSINESS|ENTERPRISE), "createdAt"(timestamptz)

users (User): id(uuid PK), "tenantId"(uuid FK→tenants), email(text), "firstName"(text), "lastName"(text), "displayName"(text), phone(text), "jobTitle"(text), department(text), status(ACTIVE|INACTIVE|SUSPENDED), "siteId"(uuid FK→sites), "createdAt"(timestamptz)
  -- UNIQUE("tenantId", email)

customer_organizations: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), slug(text), "primaryContactName"(text), "primaryContactEmail"(text), address(text), city(text), state(text), country(text)

user_groups: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), email(text), description(text), "isCmdbSupportGroup"(bool)

user_group_members: id(uuid PK), "tenantId"(uuid FK→tenants), "userGroupId"(uuid FK→user_groups), "userId"(uuid FK→users)

roles: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), permissions(jsonb), "isSystem"(bool)

user_roles: id(uuid PK), "tenantId"(uuid FK→tenants), "userId"(uuid FK→users), "roleId"(uuid FK→roles), "customerOrgId"(uuid FK→customer_organizations)

-- SERVICE DESK --
tickets: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketNumber"(int), title(text), description(text), type(INCIDENT|SERVICE_REQUEST|PROBLEM), priority(LOW|MEDIUM|HIGH|CRITICAL), status(NEW|OPEN|IN_PROGRESS|PENDING|RESOLVED|CLOSED|CANCELLED), "assignedToId"(uuid FK→users), "assignedGroupId"(uuid FK→user_groups), "requestedById"(uuid FK→users), "categoryId"(uuid FK→categories), "queueId"(uuid FK→queues), "slaId"(uuid FK→slas), tags(text[]), source(text), resolution(text), "customFields"(jsonb), "isMajorIncident"(bool), "majorIncidentCoordinatorId"(uuid FK→users), "slaBreachAt"(timestamptz), "resolvedAt"(timestamptz), "closedAt"(timestamptz), "createdAt"(timestamptz)
  -- UNIQUE("tenantId", "ticketNumber")

ticket_comments: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketId"(uuid FK→tickets), "authorId"(uuid FK→users), content(text), visibility(PUBLIC|INTERNAL), "createdAt"(timestamptz)

ticket_attachments: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketId"(uuid FK→tickets), "uploadedById"(uuid FK→users), filename(text), "mimeType"(text), "fileSize"(int), "storagePath"(text), "createdAt"(timestamptz)

ticket_activities: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketId"(uuid FK→tickets), "actorId"(uuid FK→users), type(text), field(text), "oldValue"(text), "newValue"(text), "createdAt"(timestamptz)

queues: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), "autoAssign"(bool), "defaultAssigneeId"(uuid FK→users), "assignmentGroupId"(uuid FK→user_groups), "createdAt"(timestamptz)

slas: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), "businessHoursStart"(text), "businessHoursEnd"(text), "businessDays"(text[]), timezone(text), "isActive"(bool), "createdAt"(timestamptz)

holidays: id(uuid PK), "tenantId"(uuid FK→tenants), date(date — the holiday date), name(text), recurring(bool — true means matches month-day every year, e.g. Christmas), "createdAt"(timestamptz) — used by SLA business-hours calc to skip working time on holidays

categories: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), "parentId"(uuid FK→categories self-ref), "createdAt"(timestamptz)

-- CHANGE MANAGEMENT --
changes: id(uuid PK), "tenantId"(uuid FK→tenants), "changeNumber"(int), title(text), description(text), type(STANDARD|NORMAL|EMERGENCY), status(DRAFT|SUBMITTED|APPROVED|REJECTED|SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED|FAILED), priority(LOW|MEDIUM|HIGH|CRITICAL), risk(LOW|MEDIUM|HIGH|CRITICAL), "requestedById"(uuid FK→users), "assignedToId"(uuid FK→users), "implementationPlan"(text), "backoutPlan"(text), "testingPlan"(text), "scheduledStart"(timestamptz), "scheduledEnd"(timestamptz), "createdAt"(timestamptz)

change_approvals: id(uuid PK), "tenantId"(uuid FK→tenants), "changeId"(uuid FK→changes), "approverId"(uuid FK→users), status(PENDING|APPROVED|REJECTED), comments(text), "createdAt"(timestamptz)

cab_meetings: id(uuid PK), "tenantId"(uuid FK→tenants), title(text), "scheduledAt"(timestamptz), status(SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED), notes(text), "createdAt"(timestamptz)

-- KNOWLEDGE BASE --
knowledge_articles: id(uuid PK), "tenantId"(uuid FK→tenants), "articleNumber"(int), title(text), summary(text), content(text — full article body), tags(text[]), visibility(PUBLIC|INTERNAL), status(DRAFT|IN_REVIEW|PUBLISHED|RETIRED), "isKnownError"(bool — true marks the article as a Known Error in the KEDB), "authorId"(uuid FK→users), "viewCount"(int), "helpfulCount"(int), "publishedAt"(timestamptz), "createdAt"(timestamptz)

ticket_knowledge_articles: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketId"(uuid FK→tickets), "articleId"(uuid FK→knowledge_articles)

-- ASSETS --
assets: id(uuid PK), "tenantId"(uuid FK→tenants), "assetTag"(text), "serialNumber"(text), manufacturer(text), model(text), status(IN_STOCK|DEPLOYED|IN_REPAIR|RETIRED|DISPOSED), hostname(text), "operatingSystem"(text), "osVersion"(text), "cpuModel"(text), "cpuCores"(int), "ramGb"(float), "purchaseDate"(date), "purchaseCost"(decimal), "warrantyExpiry"(date), "assignedToId"(uuid FK→users), "siteId"(uuid FK→sites), "customFields"(jsonb), "createdAt"(timestamptz)

sites: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), address(text), city(text), state(text), country(text), "postalCode"(text)

-- APPLICATION PORTFOLIO --
applications: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), type(WEB|MOBILE|DESKTOP|API|SERVICE|DATABASE_APP|MIDDLEWARE|INFRASTRUCTURE|OTHER), status(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED|IN_DEVELOPMENT), criticality(LOW|MEDIUM|HIGH|CRITICAL), "hostingModel"(ON_PREMISE|CLOUD|HYBRID|SAAS), "lifecycleStage"(PLANNING|DEVELOPMENT|PRODUCTION|RETIREMENT), "techStack"(text[]), "annualCost"(decimal), rpo(text), rto(text), "createdAt"(timestamptz)

application_dependencies: id(uuid PK), "tenantId"(uuid FK→tenants), "applicationId"(uuid FK→applications), "dependsOnId"(uuid FK→applications), type(HARD|SOFT), description(text)

-- AGENTS & INVENTORY --
agents: id(uuid PK), "tenantId"(uuid FK→tenants), hostname(text), "lastHeartbeat"(timestamptz), status(ACTIVE|INACTIVE|STALE), "agentVersion"(text), metadata(jsonb), "createdAt"(timestamptz)

inventory_snapshots: id(uuid PK), "tenantId"(uuid FK→tenants), "agentId"(uuid FK→agents), hostname(text), fqdn(text), "deviceType"(text), "operatingSystem"(text), "osVersion"(text), "cpuModel"(text), "cpuCores"(int), "ramGb"(float), "serialNumber"(text), manufacturer(text), model(text), "diskEncrypted"(bool), "antivirusProduct"(text), "firewallEnabled"(bool), "isVirtual"(bool), "installedSoftware"(jsonb — array of {name, version, publisher}), services(jsonb), "networkInterfaces"(jsonb), disks(jsonb), "windowsUpdates"(jsonb), "collectedAt"(timestamptz)

-- CMDB --
cmdb_ci_classes: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), label(text), icon(text), "parentId"(uuid FK→cmdb_ci_classes self-ref)

cmdb_statuses: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), label(text), category(LIFECYCLE|OPERATIONAL), color(text)

cmdb_environments: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), label(text), color(text)

cmdb_vendors: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), website(text), "supportEmail"(text), "supportPhone"(text)

cmdb_categories: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), "parentId"(uuid FK→cmdb_categories self-ref)

cmdb_configuration_items: id(uuid PK), "tenantId"(uuid FK→tenants), "ciNumber"(int), name(text), "displayName"(text), type(SERVER|WORKSTATION|NETWORK_DEVICE|SOFTWARE|SERVICE|DATABASE|VIRTUAL_MACHINE|CONTAINER|OTHER), status(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED), environment(PRODUCTION|STAGING|DEV|DR), hostname(text), fqdn(text), "ipAddress"(text), "serialNumber"(text), "assetTag"(text), criticality(LOW|MEDIUM|HIGH|CRITICAL), "businessOwnerId"(uuid FK→users), "technicalOwnerId"(uuid FK→users), "supportGroupId"(uuid FK→user_groups), "classId"(uuid FK→cmdb_ci_classes), "lifecycleStatusId"(uuid FK→cmdb_statuses), "operationalStatusId"(uuid FK→cmdb_statuses), "environmentId"(uuid FK→cmdb_environments), "categoryId"(uuid FK→cmdb_categories), "manufacturerId"(uuid FK→cmdb_vendors), "attributesJson"(jsonb), "lastVerifiedAt"(timestamptz), "createdAt"(timestamptz)

cmdb_relationships: id(uuid PK), "tenantId"(uuid FK→tenants), "sourceId"(uuid FK→cmdb_configuration_items), "targetId"(uuid FK→cmdb_configuration_items), "relationshipType"(DEPENDS_ON|HOSTS|CONNECTS_TO|RUNS_ON|BACKS_UP|VIRTUALIZES|MEMBER_OF), description(text), "confidenceScore"(float)

cmdb_change_records: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "changedBy"(text), "changeType"(text), "fieldName"(text), "oldValue"(text), "newValue"(text), "changedAt"(timestamptz)

cmdb_ticket_links: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "ticketId"(uuid FK→tickets), "linkType"(AFFECTED|CAUSED_BY|RELATED)

-- CMDB EXTENSION TABLES (one-to-one with cmdb_configuration_items via ciId) --
cmdb_ci_servers: "ciId"(uuid PK FK→cmdb_configuration_items), "osFamily"(text), "osVersion"(text), "cpuCores"(int), "ramGb"(float), "storageGb"(float), "isVirtual"(bool), "hypervisor"(text)
cmdb_ci_applications: "ciId"(uuid PK FK→cmdb_configuration_items), "appType"(text), version(text), vendor(text), "licenseType"(text), "licenseCount"(int)
cmdb_ci_databases: "ciId"(uuid PK FK→cmdb_configuration_items), engine(text), version(text), "sizeGb"(float), port(int), "clusterName"(text)
cmdb_ci_network_devices: "ciId"(uuid PK FK→cmdb_configuration_items), "deviceRole"(text), firmware(text), "portCount"(int), "managementIp"(text), "snmpCommunity"(text)
cmdb_ci_cloud_resources: "ciId"(uuid PK FK→cmdb_configuration_items), provider(text), region(text), "accountId"(text), "resourceArn"(text), "instanceType"(text), "tagsJson"(jsonb)
cmdb_ci_endpoints: "ciId"(uuid PK FK→cmdb_configuration_items), "deviceType"(text), "osFamily"(text), "osVersion"(text), "lastLogonUser"(text), "isManaged"(bool), "complianceStatus"(text)
cmdb_services: "ciId"(uuid PK FK→cmdb_configuration_items), "serviceType"(text), "slaId"(uuid FK→slas), tier(text), "supportHours"(text), "escalationPolicy"(text)

-- LINK TABLES --
cmdb_change_links: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "changeId"(uuid FK→changes), "linkType"(AFFECTED|CAUSED_BY|RELATED)
cmdb_incident_links: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "ticketId"(uuid FK→tickets), "linkType"(AFFECTED|CAUSED_BY|RELATED)
cmdb_problem_links: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "ticketId"(uuid FK→tickets), "linkType"(AFFECTED|CAUSED_BY|RELATED)

-- NOTIFICATIONS & RULES --
notifications: id(uuid PK), "tenantId"(uuid FK→tenants), "userId"(uuid FK→users), title(text), body(text), type(text), read(bool), "referenceType"(text), "referenceId"(text), "createdAt"(timestamptz)

notification_rules: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), "eventType"(text), "conditionGroups"(jsonb), actions(jsonb), "isActive"(bool)

email_accounts: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), "emailAddress"(text), type(IMAP|OAUTH_GOOGLE|OAUTH_MICROSOFT), "smtpHost"(text), "imapHost"(text), "isActive"(bool), "defaultQueueId"(uuid FK→queues), "defaultCategoryId"(uuid FK→categories)

-- VENDORS & CONTRACTS --
vendors: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), website(text), "contactName"(text), "contactEmail"(text), "contactPhone"(text), notes(text)

contracts: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), "vendorId"(uuid FK→vendors), type(WARRANTY|SUPPORT|LICENSE|LEASE|MAINTENANCE), status(ACTIVE|EXPIRED|CANCELLED|PENDING), "startDate"(date), "endDate"(date), cost(decimal), "renewalDate"(date), notes(text)

contract_assets: id(uuid PK), "tenantId"(uuid FK→tenants), "contractId"(uuid FK→contracts), "assetId"(uuid FK→assets)

-- AUDIT & TAGS --
audit_logs: id(uuid PK), "tenantId"(uuid FK→tenants), "userId"(uuid FK→users), action(text), "entityType"(text), "entityId"(text), details(jsonb), "ipAddress"(text), "createdAt"(timestamptz)

tags: id(uuid PK), "tenantId"(uuid FK→tenants), name(text UNIQUE per tenant), color(text)

-- WEBHOOKS --
webhooks: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), url(text), events(text[]), secret(text), "isActive"(bool), "createdAt"(timestamptz)

-- DOCUMENT CONTENT (extracted text from PDFs) --
document_contents: id(uuid PK), "tenantId"(uuid FK→tenants), "sourceType"(text), "sourceId"(uuid), filename(text), "extractedText"(text), "extractedAt"(timestamptz)

-- SCHEDULED REPORTS --
scheduled_reports: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), type(text), schedule(text), format(text), filters(jsonb), "isActive"(bool), "lastRunAt"(timestamptz)
`.trim();

/**
 * Returns the full schema context string for injection into the AI system prompt.
 */
export function getSchemaContext(): string {
  return SCHEMA_CONTEXT;
}
