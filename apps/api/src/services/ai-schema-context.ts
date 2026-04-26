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
  'cmdb_migration_audit', // Phase 8: forensic per-field audit log for destructive schema migrations (CAI-01). Not user-queryable.
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
tickets: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketNumber"(int), title(text), description(text), type(INCIDENT|SERVICE_REQUEST|PROBLEM), priority(LOW|MEDIUM|HIGH|CRITICAL), impact(LOW|MEDIUM|HIGH|CRITICAL), urgency(LOW|MEDIUM|HIGH|CRITICAL), status(NEW|OPEN|IN_PROGRESS|PENDING|RESOLVED|CLOSED|CANCELLED), "assignedToId"(uuid FK→users), "assignedGroupId"(uuid FK→user_groups), "requestedById"(uuid FK→users), "categoryId"(uuid FK→categories), "queueId"(uuid FK→queues), "slaId"(uuid FK→slas), tags(text[]), source(text), resolution(text), "customFields"(jsonb), "isMajorIncident"(bool), "majorIncidentCoordinatorId"(uuid FK→users), "slaBreachAt"(timestamptz), "resolvedAt"(timestamptz), "closedAt"(timestamptz), "createdAt"(timestamptz)
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
asset_types: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), icon(text), color(text), "parentId"(uuid FK→asset_types self-ref), "createdAt"(timestamptz)

assets: id(uuid PK), "tenantId"(uuid FK→tenants), "assetTag"(text), "serialNumber"(text), manufacturer(text), model(text), status(IN_STOCK|DEPLOYED|IN_REPAIR|RETIRED|DISPOSED), "purchaseDate"(date), "purchaseCost"(decimal), "warrantyExpiry"(date), "assignedToId"(uuid FK→users), "siteId"(uuid FK→sites), "assetTypeId"(uuid FK→asset_types), notes(text), "customFields"(jsonb), "createdAt"(timestamptz)
  -- NOTE: As of Phase 8 (CASR-01), hardware/OS/software details are owned by the linked CI side.
  --       To resolve hostname/operatingSystem/cpuCount/memoryGb for an Asset:
  --         JOIN cmdb_configuration_items ci ON ci."assetId" = assets.id
  --         JOIN cmdb_ci_servers srv ON srv."ciId" = ci.id
  --       For installed software on an Asset:
  --         JOIN cmdb_configuration_items ci ON ci."assetId" = assets.id
  --         JOIN cmdb_software_installed s ON s."ciId" = ci.id

sites: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), address(text), city(text), state(text), country(text), "postalCode"(text)

-- APPLICATION PORTFOLIO --
applications: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), type(WEB|MOBILE|DESKTOP|API|SERVICE|DATABASE_APP|MIDDLEWARE|INFRASTRUCTURE|OTHER), status(ACTIVE|INACTIVE|DECOMMISSIONED|PLANNED|IN_DEVELOPMENT), criticality(LOW|MEDIUM|HIGH|CRITICAL), "hostingModel"(ON_PREMISE|CLOUD|HYBRID|SAAS), "lifecycleStage"(PLANNING|DEVELOPMENT|PRODUCTION|RETIREMENT), "techStack"(text[]), "annualCost"(decimal), rpo(text), rto(text), "primaryCiId"(uuid FK→cmdb_configuration_items NULLABLE — APM↔CMDB bridge, points at the application_instance CI that holds owners + relationships to servers/databases/endpoints/cloud/network), "supportNotes"(text — narrative runbook), "specialNotes"(text — operational quirks), "osRequirements"(text), "vendorContact"(text), "licenseInfo"(text), "createdAt"(timestamptz)

application_dependencies: id(uuid PK), "tenantId"(uuid FK→tenants), "applicationId"(uuid FK→applications), "dependsOnId"(uuid FK→applications), type(HARD|SOFT), description(text)

-- AGENTS & INVENTORY --
agents: id(uuid PK), "tenantId"(uuid FK→tenants), hostname(text), platform(WINDOWS|LINUX|MACOS), "lastHeartbeat"(timestamptz), status(ACTIVE|INACTIVE|STALE), "agentVersion"(text), "installFormat"(MSI|EXE|DEB|RPM|PKG|TARGZ nullable — package format the agent was installed from; informs which artifact the server serves on update), metadata(jsonb), "lastReconciledAt"(timestamptz nullable), "createdAt"(timestamptz)

inventory_snapshots: id(uuid PK), "tenantId"(uuid FK→tenants), "agentId"(uuid FK→agents), hostname(text), fqdn(text), "deviceType"(text), "operatingSystem"(text), "osVersion"(text), "cpuModel"(text), "cpuCores"(int), "ramGb"(float), "serialNumber"(text), manufacturer(text), model(text), "diskEncrypted"(bool), "antivirusProduct"(text), "firewallEnabled"(bool), "isVirtual"(bool), "installedSoftware"(jsonb — array of {name, version, publisher}), services(jsonb), "networkInterfaces"(jsonb), disks(jsonb), "windowsUpdates"(jsonb), "collectedAt"(timestamptz)

inventory_diffs: id(uuid PK), "tenantId"(uuid FK→tenants), "agentId"(uuid FK→agents), "ciId"(uuid nullable FK→cmdb_configuration_items), "fromSnapshotId"(uuid nullable — reference only, no FK, survives snapshot pruning), "toSnapshotId"(uuid nullable — reference only, no FK), "diffJson"(jsonb — structured change payload), "collectedAt"(timestamptz), "createdAt"(timestamptz)

-- CMDB --
-- Phase 7 FK contract: class / status / environment / relationship verb are REFERENCE TABLES, not enums.
-- The staff AI must JOIN these tables to resolve human-readable names. All queries MUST include tenantId scoping.

cmdb_ci_classes: id(uuid PK), "tenantId"(uuid FK→tenants), "classKey"(text), "className"(text), icon(text), description(text), "parentClassId"(uuid FK→cmdb_ci_classes self-ref), "isActive"(bool)
  -- UNIQUE("tenantId", "classKey"). JOIN target for cmdb_configuration_items.classId.
  -- Canonical seeded classKeys: server, virtual_machine, database, network_device, application,
  --                             application_instance, saas_application, business_service,
  --                             technical_service, load_balancer, storage, cloud_resource,
  --                             dns_endpoint, certificate, generic.

cmdb_statuses: id(uuid PK), "tenantId"(uuid FK→tenants), "statusType"(text — 'lifecycle' | 'operational'), "statusKey"(text), "statusName"(text), "sortOrder"(int), "isActive"(bool)
  -- UNIQUE("tenantId", "statusType", "statusKey"). JOIN target for cmdb_configuration_items.lifecycleStatusId and .operationalStatusId.
  -- Canonical lifecycle statusKeys: planned, ordered, installed, in_service, under_change, retired.
  -- Canonical operational statusKeys: online, offline, degraded, maintenance, unknown.

cmdb_environments: id(uuid PK), "tenantId"(uuid FK→tenants), "envKey"(text), "envName"(text), "sortOrder"(int), "isActive"(bool)
  -- UNIQUE("tenantId", "envKey"). JOIN target for cmdb_configuration_items.environmentId.
  -- Canonical seeded envKeys: prod, test, dev, qa, dr, lab.

cmdb_relationship_types: id(uuid PK), "tenantId"(uuid FK→tenants), "relationshipKey"(text), "relationshipName"(text), "forwardLabel"(text), "reverseLabel"(text), "isDirectional"(bool)
  -- UNIQUE("tenantId", "relationshipKey"). JOIN target for cmdb_relationships.relationshipTypeId.
  -- Canonical seeded relationshipKeys: depends_on, runs_on, hosted_on, connected_to, member_of,
  --                                     replicated_to, backed_up_by, uses, supports, managed_by,
  --                                     owned_by, contains, installed_on.

cmdb_vendors: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), website(text), "supportEmail"(text), "supportPhone"(text)

cmdb_categories: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), "parentId"(uuid FK→cmdb_categories self-ref)

cmdb_configuration_items: id(uuid PK), "tenantId"(uuid FK→tenants), "ciNumber"(int), name(text), "displayName"(text), description(text), "classId"(uuid FK→cmdb_ci_classes NOT NULL), "lifecycleStatusId"(uuid FK→cmdb_statuses NOT NULL), "operationalStatusId"(uuid FK→cmdb_statuses NOT NULL), "environmentId"(uuid FK→cmdb_environments NOT NULL), hostname(text), fqdn(text), "ipAddress"(text), "serialNumber"(text), "assetTag"(text), criticality(LOW|MEDIUM|HIGH|CRITICAL), "businessOwnerId"(uuid FK→users), "technicalOwnerId"(uuid FK→users), "supportGroupId"(uuid FK→user_groups), "categoryId"(uuid FK→cmdb_categories), "manufacturerId"(uuid FK→cmdb_vendors), "assetId"(uuid FK→assets), "attributesJson"(jsonb), "lastVerifiedAt"(timestamptz), "createdAt"(timestamptz)
  -- Phase 7 FK contract: class / lifecycle / operational / environment are reference-table FKs (NOT enums).
  -- To resolve the human-readable class name, JOIN cmdb_ci_classes ON cmdb_ci_classes.id = cmdb_configuration_items."classId".
  -- To resolve lifecycle status: JOIN cmdb_statuses ON cmdb_statuses.id = cmdb_configuration_items."lifecycleStatusId" WHERE cmdb_statuses."statusType"='lifecycle'.
  -- To resolve operational status: JOIN cmdb_statuses ON cmdb_statuses.id = cmdb_configuration_items."operationalStatusId" WHERE cmdb_statuses."statusType"='operational'.
  -- To resolve environment: JOIN cmdb_environments ON cmdb_environments.id = cmdb_configuration_items."environmentId".
  -- Canonical classKeys: server, virtual_machine, database, network_device, application,
  --                      application_instance, saas_application, business_service,
  --                      technical_service, load_balancer, storage, cloud_resource,
  --                      dns_endpoint, certificate, generic.
  -- EXAMPLE — "how many servers do we have?":
  --   SELECT COUNT(*) FROM cmdb_configuration_items ci
  --     JOIN cmdb_ci_classes c ON c.id = ci."classId"
  --    WHERE c."classKey" = 'server' AND ci."tenantId" = $TENANT_ID AND ci."isDeleted" = false;
  -- NOTE: The legacy columns "type"/"status"/"environment" (enum strings) still exist on the table
  --       through Phase 14 for read-side backward compatibility, but NOTHING writes to them.
  --       All filters and joins SHOULD use the FK columns above.

cmdb_relationships: id(uuid PK), "tenantId"(uuid FK→tenants), "sourceId"(uuid FK→cmdb_configuration_items), "targetId"(uuid FK→cmdb_configuration_items), "relationshipTypeId"(uuid FK→cmdb_relationship_types NOT NULL), description(text), "confidenceScore"(float)
  -- Phase 7 FK contract: relationship verb is a reference-table FK (NOT an enum).
  -- To resolve verb name, JOIN cmdb_relationship_types ON cmdb_relationship_types.id = cmdb_relationships."relationshipTypeId".
  -- Canonical relationshipKeys: depends_on, runs_on, hosted_on, connected_to, member_of,
  --                              replicated_to, backed_up_by, uses, supports, managed_by,
  --                              owned_by, contains, installed_on.
  -- NOTE: The legacy column "relationshipType" (enum string) still exists through Phase 14 for
  --       read-side backward compatibility; writers MUST use relationshipTypeId.

cmdb_change_records: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "changedBy"(text), "changeType"(text), "fieldName"(text), "oldValue"(text), "newValue"(text), "changedAt"(timestamptz)

cmdb_ticket_links: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), "ticketId"(uuid FK→tickets), "linkType"(AFFECTED|CAUSED_BY|RELATED)

-- CMDB EXTENSION TABLES (one-to-one with cmdb_configuration_items via ciId) --
cmdb_ci_servers: "ciId"(uuid PK FK→cmdb_configuration_items), "osFamily"(text), "osVersion"(text), "cpuCores"(int), "cpuModel"(text), "ramGb"(float), "storageGb"(float), "disksJson"(jsonb), "networkInterfacesJson"(jsonb), "isVirtual"(bool), "hypervisor"(text)
  -- Phase 8 (CASR-02) NEW: cpuModel, disksJson, networkInterfacesJson.
  --   These columns moved from assets.* to cmdb_ci_servers in Phase 8.
  --   Join back to Asset via cmdb_configuration_items."assetId".

cmdb_software_installed: id(uuid PK), "tenantId"(uuid FK→tenants), "ciId"(uuid FK→cmdb_configuration_items), name(text), version(text), vendor(text), publisher(text), "installDate"(timestamptz), source(text — 'agent'|'manual'|'import'), "lastSeenAt"(timestamptz), "createdAt"(timestamptz), "updatedAt"(timestamptz)
  -- Phase 8 (CASR-03) NEW TABLE: one-to-many from a CI to each installed software item.
  -- UNIQUE("ciId", name, version). licenseKey column EXISTS on the table but is intentionally
  --   OMITTED from this AI context (sensitive). Reports surface licenseKey ONLY via the
  --   CI-scoped /api/v1/cmdb/cis/:id/software endpoint, gated by the cmdb.view permission.
  -- EXAMPLE — "which CIs have Microsoft Office installed?":
  --   SELECT ci."ciNumber", ci.name, s.name AS software_name, s.version
  --     FROM cmdb_software_installed s
  --     JOIN cmdb_configuration_items ci ON ci.id = s."ciId"
  --    WHERE s."tenantId" = $TENANT_ID AND s.name ILIKE '%Microsoft Office%';
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
