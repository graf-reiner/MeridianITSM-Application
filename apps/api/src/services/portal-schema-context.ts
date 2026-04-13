/**
 * Portal AI Schema Context — Restricted DDL for the portal AI chatbot system prompt.
 *
 * This provides a RESTRICTED subset of the database schema to the portal AI.
 * Portal users (end_users) can only see:
 * - Their own tickets (requestedById = current user)
 * - Public ticket comments on their own tickets
 * - Ticket attachments on their own tickets
 * - Service categories
 * - Published + public knowledge articles
 * - Document contents (filtered to their tickets / public KB)
 *
 * SECURITY: This context intentionally omits ALL staff, CMDB, asset, change,
 * billing, auth, and internal tables. Never add those here.
 */

/** Tables the portal AI is allowed to query */
export const PORTAL_ALLOWED_TABLES: string[] = [
  'tickets',
  'ticket_comments',
  'ticket_attachments',
  'categories',
  'knowledge_articles',
  'document_contents',
];

/**
 * Compressed database schema for the portal AI system prompt.
 * Restricted to portal-visible tables only.
 * All column names are camelCase and MUST be double-quoted in SQL.
 * $TENANT_ID and $USER_ID are placeholders replaced at execution time.
 */
export const PORTAL_SCHEMA_CONTEXT = `
DATABASE SCHEMA (PostgreSQL — column names are camelCase, use double quotes):

-- YOUR TICKETS (only tickets where "requestedById" = your user ID) --
tickets: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketNumber"(int), title(text), description(text), type(INCIDENT|SERVICE_REQUEST|PROBLEM), priority(LOW|MEDIUM|HIGH|CRITICAL), status(NEW|OPEN|IN_PROGRESS|PENDING|RESOLVED|CLOSED|CANCELLED), "requestedById"(uuid FK→users), "categoryId"(uuid FK→categories), tags(text[]), source(text), resolution(text), "customFields"(jsonb), "slaBreachAt"(timestamptz), "resolvedAt"(timestamptz), "closedAt"(timestamptz), "createdAt"(timestamptz)
  -- NOTE: You can ONLY see tickets where "requestedById" = '$USER_ID'

ticket_comments: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketId"(uuid FK→tickets), "authorId"(uuid FK→users), content(text), visibility(PUBLIC|INTERNAL), "createdAt"(timestamptz)
  -- NOTE: Only PUBLIC comments are visible

ticket_attachments: id(uuid PK), "tenantId"(uuid FK→tenants), "ticketId"(uuid FK→tickets), filename(text), "mimeType"(text), "fileSize"(int), "createdAt"(timestamptz)

categories: id(uuid PK), "tenantId"(uuid FK→tenants), name(text), description(text), "parentId"(uuid FK→categories self-ref), "createdAt"(timestamptz)

-- KNOWLEDGE BASE (PUBLISHED + PUBLIC only) --
knowledge_articles: id(uuid PK), "tenantId"(uuid FK→tenants), "articleNumber"(int), title(text), summary(text), content(text), tags(text[]), visibility(PUBLIC|INTERNAL), status(DRAFT|IN_REVIEW|PUBLISHED|RETIRED), "viewCount"(int), "helpfulCount"(int), "publishedAt"(timestamptz), "createdAt"(timestamptz)
  -- NOTE: You can ONLY see articles where status='PUBLISHED' AND visibility='PUBLIC'

document_contents: id(uuid PK), "tenantId"(uuid FK→tenants), "sourceType"(text), "sourceId"(uuid), filename(text), "extractedText"(text), "extractedAt"(timestamptz)
`.trim();

/**
 * Returns the restricted portal schema context string for injection into the AI system prompt.
 */
export function getPortalSchemaContext(): string {
  return PORTAL_SCHEMA_CONTEXT;
}
