# Phase 3: Core ITSM - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the complete ITSM core: ticket lifecycle management with SLA enforcement, email-to-ticket and notification system, knowledge base with rich text editing, end-user self-service portal, admin settings/configuration, notification center, and reporting dashboards. This is the largest phase — 57 requirement IDs across 6 planned areas.

</domain>

<decisions>
## Implementation Decisions

### SLA Visualization & Behavior
- Countdown timer with color bands: green → yellow (75%) → red (90%) → breached. Compact enough for ticket header area
- Paused SLA shows "PAUSED" badge with frozen timer and reason. Resumes when ticket leaves PENDING status
- SLA breach triggers: red "BREACHED" badge on ticket, notification to assignee + their manager, configurable auto-escalation option
- Business hours configured per SLA policy with timezone support — different hours per priority level. Essential for MSPs with customers in different timezones
- SLA monitor worker (already stubbed in `apps/worker/src/workers/sla-monitor.ts`) runs every minute checking all active SLA timers

### Email System Behavior
- Per-tenant mailbox configuration — each tenant configures their own SMTP/IMAP/POP3 credentials in settings. Worker polls each tenant's mailbox independently
- Reply threading uses dual strategy: primary match on In-Reply-To/References MIME headers, fallback extracts TKT-XXXXX from subject line
- Email deduplication via Message-ID header (stored per tenant, checked before ticket creation)
- Inbound email attachments auto-extracted and stored in MinIO/S3, linked to created ticket. Size limit configurable per tenant (default 25MB per email)
- Outbound notifications use branded HTML templates with variable substitution ({{ticketNumber}}, {{status}}, {{assignee}}, etc.). Default template provided, admin can customize logo/colors
- Email polling worker (already stubbed in `apps/worker/src/workers/email-polling.ts`) runs every 5 minutes
- Email notification worker (already stubbed in `apps/worker/src/workers/email-notification.ts`) event-driven via BullMQ

### Portal & End-User Experience
- Portal shares same shadcn/ui component library and theme as dashboard — simplified sidebar with fewer items, no admin sections, cleaner forms. Same product, scoped down
- Service request form is category-driven: user picks category first (e.g., "Password Reset", "New Equipment"), then form shows category-specific fields
- End users see simplified SLA info: "We aim to respond within 4 hours" with green/yellow/red indicator. No detailed countdown — that's internal
- End-user notifications: email when ticket is updated + in-app notification bell with unread count in portal
- Middleware auto-redirects end_user role from /dashboard to /portal (PRTL-06)

### Ticket Workflow (Claude's Discretion)
- Ticket list/detail page layout, density, and interaction patterns
- Bulk actions on ticket list (if any in Phase 3 scope)
- Inline editing vs modal approach for ticket fields
- Dashboard widget arrangement and data visualization choices

### Knowledge Base (Claude's Discretion)
- TipTap editor configuration and toolbar options
- Article search implementation (full-text via PostgreSQL ts_vector or simple ILIKE)
- Article list/detail layout

### Settings & Configuration (Claude's Discretion)
- Settings page organization (tabs, sidebar nav, etc.)
- User/role/group CRUD page layouts
- Queue and category management interfaces

### Reporting (Claude's Discretion)
- Dashboard chart types and layouts
- Scheduled report format and delivery mechanism
- Report filtering and date range selection UI

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Application Specification
- `DOCUMENTATION .md` — Complete spec with all data models (50+ Prisma models), ~115 API endpoints, 55 dashboard pages, email system, SLA rules, portal pages. This is the single source of truth.

### Database Schema
- `packages/db/prisma/schema.prisma` — All Prisma models including Ticket, TicketComment, TicketActivity, SlaPolicy, SlaTimer, Queue, Category, KnowledgeArticle, EmailAccount, Notification, Site, UserGroup, ScheduledReport

### Existing API Patterns
- `apps/api/src/server.ts` — Route registration pattern: public routes, protected scope (auth → tenant → planGate → impersonation guard), external scope (API key auth)
- `apps/api/src/plugins/rbac.ts` — `requirePermission()` pattern for route-level RBAC
- `apps/api/src/plugins/plan-gate.ts` — `planGate(resource, countFn?)` for plan limit enforcement on resource-creating endpoints
- `apps/api/src/plugins/tenant.ts` — Tenant injection pattern, `request.tenantId` and `request.currentUser` available on all protected routes

### Existing Worker Patterns
- `apps/worker/src/workers/sla-monitor.ts` — SLA monitor stub (Phase 3 implements real logic)
- `apps/worker/src/workers/email-polling.ts` — Email polling stub (Phase 3 implements real logic)
- `apps/worker/src/workers/email-notification.ts` — Email notification stub (Phase 3 implements real logic)
- `apps/worker/src/workers/stripe-webhook.ts` — Reference implementation for BullMQ worker with idempotency

### Frontend Patterns
- `apps/web/src/hooks/usePlan.ts` — TanStack Query hook pattern with `hasFeature()`, `isActive()` helpers
- `apps/web/src/app/billing/page.tsx` — Reference for authenticated page with API calls

### Project Instructions
- `CLAUDE.md` — Critical design rules including multi-tenancy, icon usage, API patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `usePlan()` hook: Check feature flags and plan limits from frontend (e.g., gate KB access by plan tier)
- `requirePermission()` RBAC plugin: Route-level permission enforcement
- `planGate(resource, countFn?)`: Plan limit enforcement for resource-creating endpoints (e.g., ticket creation)
- BullMQ queue infrastructure: `apps/worker/src/queues/definitions.ts` has queue names and connection setup
- Stripe webhook worker: Pattern for idempotent BullMQ job processing with error recording

### Established Patterns
- Fastify plugin architecture: Routes registered in scoped contexts with preHandlers
- JWT auth → tenant injection → plan gate → impersonation guard middleware chain
- Prisma with tenant-scoped queries (every query MUST include tenantId)
- Worker stubs with `assertTenantId()` pattern for job data validation
- ioredis v5 with named import (`import { Redis } from 'ioredis'`)

### Integration Points
- `apps/api/src/server.ts` protected scope: Where all new v1 routes register
- `apps/api/src/routes/v1/index.ts`: Route index file for protected endpoints
- `apps/worker/src/index.ts`: Worker startup file where new workers register
- `apps/web/src/app/`: Next.js App Router pages — new dashboard and portal pages go here
- MinIO/S3 for file storage: Docker Compose already configured, need service layer for uploads

</code_context>

<specifics>
## Specific Ideas

- SLA timer should feel urgent — color bands create visual pressure without being overbearing
- Portal should feel like a simplified version of the same product, not a separate app
- Category-driven service request forms guide end users to provide the right context upfront
- Email templates should be professional and branded — this is customer-facing communication
- Business hours per SLA policy is critical for MSPs serving customers across timezones

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-core-itsm*
*Context gathered: 2026-03-20*
