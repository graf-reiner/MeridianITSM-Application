# Roadmap: MeridianITSM

## Overview

MeridianITSM is built in five broad phases that follow strict dependency ordering: the foundation and tenant isolation layer must be correct before anything else ships, billing must be reliable before plan enforcement gates any feature, core ITSM delivers the product value an MSP will pay for, the CMDB and change management layer adds ITIL compliance, and the agent/mobile/integration layer delivers the differentiators that retain customers. Each phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Monorepo scaffold, full database schema, tenant isolation, and authentication pipeline
- [ ] **Phase 2: Billing and Owner Admin** - Stripe subscription lifecycle, plan enforcement, and operator control plane
- [ ] **Phase 3: Core ITSM** - Incident management, SLA, email-to-ticket, knowledge base, self-service portal, settings, notifications, and reporting
- [ ] **Phase 4: CMDB, Change Management, and Asset Portfolio** - ITIL expansion with asset tracking, CMDB with relationship mapping, change management with CAB workflows, and application portfolio
- [ ] **Phase 5: Agent, Mobile, and Integrations** - .NET inventory agent with CMDB auto-discovery, React Native mobile app with push notifications, and webhook/API integration layer

## Phase Details

### Phase 1: Foundation
**Goal**: The monorepo compiles, all services start, every database query is tenant-scoped, and authentication works end-to-end with correct isolation between the tenant API and owner admin portal.
**Depends on**: Nothing (first phase)
**Requirements**: FNDN-01, FNDN-02, FNDN-03, FNDN-04, FNDN-05, FNDN-06, FNDN-07, TNCY-01, TNCY-02, TNCY-03, TNCY-04, TNCY-05, TNCY-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, AUTH-09, INFR-01, INFR-02, INFR-03, INFR-04, INFR-05, INFR-06
**Success Criteria** (what must be TRUE):
  1. A developer can clone the repo, run `docker compose up` and `pnpm dev`, and all five apps (api, web, owner, worker, mobile stub) start without errors
  2. An admin can log in to the tenant web app with email/password, receive a JWT, and access a protected route; an unauthenticated request returns 401
  3. A cross-tenant isolation test passes: Tenant B's session cannot retrieve Tenant A's records from any API endpoint
  4. The owner admin portal is reachable on port 3800 with its own separate login and JWT, and is unreachable from the public-facing domain
  5. A BullMQ worker job carries tenantId in its payload and the worker asserts that tenantId before any database access
**Plans**: 6 plans

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold: pnpm workspaces, Turborepo, all app/package stubs, Docker Compose
- [x] 01-02-PLAN.md — Database schema: Prisma 7 schema for all 61 models, tenant scoping extension, Zod types, seeding
- [x] 01-03-PLAN.md — Authentication pipeline: Fastify 5 server wiring, plugins, auth/tenant/RBAC middleware, login/refresh/password-reset routes, org-lookup service
- [x] 01-04-PLAN.md — Infrastructure: BullMQ/Redis workers, MinIO storage, AES encryption, core utilities, health check
- [x] 01-05-PLAN.md — Owner admin auth: OWNER_JWT_SECRET login, OwnerSession, protected /api/tenants route
- [x] 01-06-PLAN.md — Test infrastructure: Vitest setup, cross-tenant isolation tests, encryption/worker/auth test stubs

### Phase 2: Billing and Owner Admin
**Goal**: A new tenant can sign up, start a trial, subscribe via Stripe, and have plan limits enforced across the API; the owner can manage all tenants and subscriptions from the admin portal.
**Depends on**: Phase 1
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, OADM-01, OADM-02, OADM-03, OADM-04, OADM-05, OADM-06, OADM-07, OADM-08, OADM-09, OADM-10, OADM-11, OADM-12
**Success Criteria** (what must be TRUE):
  1. A new tenant can complete a Stripe checkout, have their subscription reflected immediately in the app without waiting for a webhook, and access plan-gated features
  2. A tenant on a STARTER plan receives a 402 response (not a 403) when attempting to use a feature gated to PROFESSIONAL or above, and the frontend shows an upgrade prompt
  3. A trial tenant receives dunning emails at trial-3d and is suspended at trial expiry; the owner can extend the trial from the admin portal
  4. The owner admin can view all tenants, see their subscription status, impersonate a tenant with a 15-minute token and visible banner, and suspend or delete a tenant
  5. Duplicate Stripe webhook events are processed exactly once (idempotency table prevents double-processing)
**Plans**: 6 plans

Plans:
- [ ] 02-01-PLAN.md — Stripe billing backend: StripeWebhookEvent schema migration, Stripe SDK service, webhook endpoint with raw body + BullMQ enqueue, webhook worker with idempotency, usage snapshot worker
- [ ] 02-02-PLAN.md — Plan enforcement: planGate real implementation with Redis cache, plan-config types, GET /billing/plan endpoint, usePlan() frontend hook
- [ ] 02-03-PLAN.md — Checkout and billing UI: Stripe Elements embedded checkout, sync-checkout race condition resolver, custom billing management UI, trial expiry/dunning worker
- [ ] 02-04-PLAN.md — Owner admin security: TOTP MFA with otpauth, IP allowlist middleware, impersonation token generation, API write-block guard
- [ ] 02-05-PLAN.md — Owner admin portal: MRR/ARR dashboard with Recharts, tenant list/detail, lifecycle actions, impersonation trigger, internal notes, manual provisioning
- [ ] 02-06-PLAN.md — Owner admin operations: billing dashboard with payment retry, plan management CRUD, system health with queue monitoring, cross-tenant audit log

### Phase 3: Core ITSM
**Goal**: An MSP technician can manage the full ticket lifecycle with SLA enforcement, receive tickets via email, resolve them with knowledge base assistance, and end users can self-serve; all within a configurable, reportable, notified system.
**Depends on**: Phase 2
**Requirements**: TICK-01, TICK-02, TICK-03, TICK-04, TICK-05, TICK-06, TICK-07, TICK-08, TICK-09, TICK-10, TICK-11, TICK-12, SLA-01, SLA-02, SLA-03, SLA-04, SLA-05, SLA-06, EMAL-01, EMAL-02, EMAL-03, EMAL-04, EMAL-05, EMAL-06, EMAL-07, EMAL-08, KB-01, KB-02, KB-03, KB-04, KB-05, KB-06, PRTL-01, PRTL-02, PRTL-03, PRTL-04, PRTL-05, PRTL-06, SETT-01, SETT-02, SETT-03, SETT-04, SETT-05, SETT-06, SETT-07, SETT-08, SETT-09, SETT-10, SETT-11, SETT-12, NOTF-01, NOTF-02, NOTF-03, NOTF-04, REPT-01, REPT-02, REPT-03, REPT-04, REPT-05, REPT-06, REPT-07
**Success Criteria** (what must be TRUE):
  1. An agent can create a ticket, see an SLA countdown with breach warnings at 75% and 90%, assign it to a queue, add internal and public comments, and close it with a knowledge article linked — all tracked in an immutable audit trail
  2. An email sent to the configured mailbox becomes a ticket within 5 minutes; a reply to the notification email threads back onto that ticket; duplicate emails are detected and not re-created
  3. An end user can log into /portal, submit a service request, track its status, add comments, and browse knowledge articles — with the system automatically redirecting end_user roles to the portal
  4. An admin can configure SLA policies per priority with business hours, set up email accounts, manage users and roles, and view a dashboard with ticket volume, SLA compliance, and agent workload
  5. A notification (in-app, email) fires when a ticket is assigned, commented on, or breaches SLA; users can see and mark notifications in the notification center
**Plans**: TBD

Plans:
- [ ] 03-01: Ticket management — full lifecycle, audit trail, assignment, queues, time tracking, file attachments
- [ ] 03-02: SLA management — policies, timers with business hours, breach detection worker, dashboard visualization
- [ ] 03-03: Email system — SMTP/IMAP/POP3 config, inbound polling worker, reply threading, deduplication, outbound notifications, templates
- [ ] 03-04: Knowledge base — rich text editor, article lifecycle, full-text search, voting, ticket linking
- [ ] 03-05: Self-service portal — end-user portal route group, ticket submission/tracking, KB browsing, role-based redirect
- [ ] 03-06: Settings, notifications, and reporting — user/role/group/queue/SLA/category/site management, notification center, dashboards, scheduled reports

### Phase 4: CMDB, Change Management, and Asset Portfolio
**Goal**: Technicians can track physical assets, manage a CI relationship map with impact analysis, submit change requests through approval workflows with CAB review, and manage the application portfolio with dependency mapping.
**Depends on**: Phase 3
**Requirements**: ASST-01, ASST-02, ASST-03, ASST-04, ASST-05, CMDB-01, CMDB-02, CMDB-03, CMDB-04, CMDB-05, CMDB-06, CMDB-07, CMDB-08, CMDB-09, CMDB-10, CMDB-11, CMDB-12, CMDB-13, CMDB-14, CHNG-01, CHNG-02, CHNG-03, CHNG-04, CHNG-05, CHNG-06, CHNG-07, CHNG-08, CHNG-09, CAB-01, CAB-02, CAB-03, CAB-04, CAB-05, APP-01, APP-02, APP-03, APP-04, APP-05, APP-06
**Success Criteria** (what must be TRUE):
  1. A technician can create an asset, assign it to a user, and link it to a CMDB configuration item; a CI relationship diagram shows the dependency map visually
  2. Clicking "impact analysis" on a CI traverses the relationship graph and shows all upstream and downstream CIs that would be affected by a change to that CI
  3. A change request moves through the full approval chain (assessment → approval → CAB review → scheduled → implementing → completed), with each approver receiving a notification and CAB attendees able to RSVP and download an iCal invite
  4. An emergency change bypasses CAB scheduling and routes directly to approval; a standard pre-approved change skips the approval chain
  5. An application can be created with its dependencies mapped to other applications and assets, visible in a visual dependency diagram on the portfolio dashboard
**Plans**: TBD

Plans:
- [ ] 04-01: Asset management — CRUD, status lifecycle, user/site assignment, purchase tracking
- [ ] 04-02: CMDB — CI types, relationships, impact analysis, change history, bulk import, visualization, reconciliation infrastructure, permissions
- [ ] 04-03: Change management and CAB — change lifecycle, approval chains, risk assessment, scheduling, CAB meetings with RSVP and iCal
- [ ] 04-04: Application portfolio — CRUD, dependency mapping, document management, asset relationships, portfolio dashboard

### Phase 5: Agent, Mobile, and Integrations
**Goal**: The .NET inventory agent auto-discovers and reconciles hardware into the CMDB, the mobile app gives field technicians ticket access with push notifications, and webhooks and API keys let external tools integrate with the platform.
**Depends on**: Phase 4
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-06, AGNT-07, AGNT-08, AGNT-09, AGNT-10, AGNT-11, AGNT-12, MOBL-01, MOBL-02, MOBL-03, MOBL-04, MOBL-05, MOBL-06, MOBL-07, MOBL-08, MOBL-09, MOBL-10, MOBL-11, MOBL-12, PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05, INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06
**Success Criteria** (what must be TRUE):
  1. An agent installed on a Windows, Linux, or macOS machine enrolls with a per-device API key, submits an inventory snapshot, and the CMDB shows a new or updated CI within 15 minutes with hardware fields auto-populated
  2. A field technician can log into the mobile app on iOS or Android, view their assigned tickets, update status, add a photo comment, and receive a push notification when a ticket is assigned to them
  3. A deep-link from a push notification opens the mobile app directly to the relevant ticket screen
  4. An external system can create and query tickets via API key authentication with rate limiting enforced
  5. A configured webhook fires within 30 seconds of a ticket event, uses HMAC-signed payloads, retries on failure with exponential backoff, and shows delivery history in the UI
**Plans**: TBD

Plans:
- [ ] 05-01: .NET inventory agent — cross-platform collectors, enrollment, heartbeat, inventory/CMDB payload submission, installers, local web UI
- [ ] 05-02: CMDB agent reconciliation — precedence policy worker, conflict review queue, CMDB auto-discovery from agent data
- [ ] 05-03: Mobile app — Expo SDK 55 React Native, navigation, ticket screens, KB browsing, camera attachments, offline caching, EAS Build
- [ ] 05-04: Push notifications — FCM/APNs service, device token lifecycle, per-user preferences, deep link payloads, receipt processing job
- [ ] 05-05: Integrations — API key CRUD, external REST endpoints, webhook CRUD with signed delivery and retry, delivery history, alert channels, scheduled exports

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 6/6 | Complete | 2026-03-20 |
| 2. Billing and Owner Admin | 0/6 | Not started | - |
| 3. Core ITSM | 0/6 | Not started | - |
| 4. CMDB, Change Management, and Asset Portfolio | 0/4 | Not started | - |
| 5. Agent, Mobile, and Integrations | 0/5 | Not started | - |
