# Requirements: MeridianITSM

**Defined:** 2026-03-19
**Core Value:** An MSP can manage multiple customer organizations' IT service desks from a single platform with complete tenant isolation, paying via Stripe subscription, with the full ITSM lifecycle working end-to-end.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FNDN-01**: Monorepo initialized with pnpm workspaces and Turborepo build pipeline
- [x] **FNDN-02**: Shared database package (`packages/db`) with Prisma 7 schema covering all 50+ models
- [x] **FNDN-03**: Shared types package (`packages/types`) with Zod schemas for all API inputs/outputs
- [x] **FNDN-04**: Fastify 5 API server (`apps/api`) with plugin architecture and middleware pipeline
- [x] **FNDN-05**: Next.js 16 frontend (`apps/web`) with App Router and React 19
- [x] **FNDN-06**: Docker Compose configuration for PostgreSQL, Redis, MinIO, and MailHog
- [x] **FNDN-07**: Database seeding with default tenant, roles, categories, SLA policies, and test users

### Multi-Tenancy

- [x] **TNCY-01**: Every database table has tenantId column; every query is scoped by tenantId
- [x] **TNCY-02**: Tenant model with types (MSP, ENTERPRISE, B2C) and subscription plan fields
- [x] **TNCY-03**: CustomerOrganization model for MSP customers managing multiple client orgs
- [x] **TNCY-04**: Tenant-scoped middleware on all API routes that injects tenantId from JWT claims
- [x] **TNCY-05**: Prisma query extension or middleware that enforces tenantId on every operation
- [x] **TNCY-06**: Subdomain-based tenant routing via Cloudflare Worker and org-lookup service

### Authentication & Authorization

- [x] **AUTH-01**: User can log in with email and password (bcrypt hashed)
- [x] **AUTH-02**: JWT-based session with tenantId, userId, and roles in claims
- [x] **AUTH-03**: System roles: admin, msp_admin, agent, end_user with predefined permissions
- [x] **AUTH-04**: Custom roles with JSON permission arrays, assignable per tenant
- [x] **AUTH-05**: Permission checking via hasPermission(userId, tenantId, permission)
- [x] **AUTH-06**: Role scoping to CustomerOrganization for MSP model
- [x] **AUTH-07**: API key authentication for external integrations with scoped permissions
- [x] **AUTH-08**: Rate limiting: AUTH 5/15min, API 100/min, API_READ 300/min, API_WRITE 30/min
- [x] **AUTH-09**: Password reset flow via email link with time-limited token

### Incident Management

- [x] **TICK-01**: User can create ticket with title, description, type (incident/service_request/problem), priority, category
- [x] **TICK-02**: Ticket auto-generates sequential ticket number (e.g., TKT-00042) per tenant
- [x] **TICK-03**: Ticket status transitions: NEW → OPEN → IN_PROGRESS → PENDING → RESOLVED → CLOSED → CANCELLED
- [x] **TICK-04**: User can add comments to tickets with PUBLIC or INTERNAL visibility
- [x] **TICK-05**: User can upload file attachments to tickets (stored in MinIO/S3)
- [x] **TICK-06**: All ticket field changes are logged in an immutable audit trail (TicketActivity)
- [x] **TICK-07**: Ticket list with filtering by status, priority, assignee, category, date range, and full-text search
- [x] **TICK-08**: Ticket assignment to individual agents or user groups
- [x] **TICK-09**: Queue-based ticket routing with auto-assignment rules
- [x] **TICK-10**: Ticket can link to knowledge articles for resolution reference
- [x] **TICK-11**: Ticket can link to CMDB Configuration Items (affected CIs)
- [x] **TICK-12**: Time tracking on ticket comments (timeSpentMinutes)

### SLA Management

- [x] **SLA-01**: SLA policies define response and resolution time targets per priority level (P1-P4)
- [x] **SLA-02**: SLA timers start on ticket creation and track against configured targets
- [x] **SLA-03**: SLA breach detection with warnings at 75% and 90% thresholds
- [x] **SLA-04**: SLA timers respect business hours configuration
- [x] **SLA-05**: SLA status displayed on ticket detail with countdown visualization
- [x] **SLA-06**: Background worker monitors SLA compliance every minute

### Email System

- [x] **EMAL-01**: Email account configuration for SMTP, IMAP, and POP3 with encrypted credentials
- [x] **EMAL-02**: Inbound email polling creates tickets automatically (email-to-ticket)
- [x] **EMAL-03**: Email reply threading matches replies to existing tickets
- [x] **EMAL-04**: Email deduplication via Message-ID, subject ticket number, and MIME headers
- [x] **EMAL-05**: Outbound email notifications for ticket events (created, assigned, updated, resolved, SLA breach)
- [x] **EMAL-06**: Customizable HTML email templates with variable substitution
- [x] **EMAL-07**: Email connection testing tool for SMTP/IMAP/POP3
- [x] **EMAL-08**: Background worker polls email accounts every 5 minutes

### Knowledge Base

- [x] **KB-01**: User can create articles with title, summary, rich text content (TipTap), and tags
- [x] **KB-02**: Article lifecycle: DRAFT → IN_REVIEW → PUBLISHED → RETIRED
- [x] **KB-03**: Full-text search across articles
- [x] **KB-04**: Helpful/not helpful voting on articles
- [x] **KB-05**: Articles linkable to tickets for resolution reference
- [x] **KB-06**: Article view count tracking

### Self-Service Portal

- [x] **PRTL-01**: End-user portal at /portal with simplified sidebar navigation
- [x] **PRTL-02**: End users can submit service requests via simplified form
- [x] **PRTL-03**: End users can view their ticket status and add comments
- [x] **PRTL-04**: End users can browse published knowledge articles
- [x] **PRTL-05**: End users can view their assigned assets *(deferred to Phase 4 — requires asset CRUD from ASST-01)*
- [x] **PRTL-06**: Middleware auto-redirects end_user role to /portal

### Asset Management

- [x] **ASST-01**: Asset CRUD with assetTag, serialNumber, manufacturer, model, status lifecycle
- [x] **ASST-02**: Asset status: IN_STOCK → DEPLOYED → IN_REPAIR → RETIRED → DISPOSED
- [x] **ASST-03**: Asset assignment to users and sites
- [x] **ASST-04**: Asset fields populated from inventory agent data (hostname, OS, CPU, memory, disks, network, software)
- [x] **ASST-05**: Asset purchase tracking (date, cost, warranty)

### CMDB

- [x] **CMDB-01**: Configuration Item CRUD with ciNumber, type, status, environment, flexible attributesJson
- [x] **CMDB-02**: CI types: SERVER, WORKSTATION, NETWORK_DEVICE, SOFTWARE, SERVICE, DATABASE, VIRTUAL_MACHINE, CONTAINER, OTHER
- [x] **CMDB-03**: CI relationships: DEPENDS_ON, HOSTS, CONNECTS_TO, RUNS_ON, BACKS_UP, VIRTUALIZES, MEMBER_OF
- [x] **CMDB-04**: Impact analysis: traverse CI relationship graph to identify affected upstream/downstream CIs
- [x] **CMDB-05**: CI change history: every attribute change logged with who/what made the change
- [x] **CMDB-06**: CI linkable to tickets (affected CIs on incidents)
- [x] **CMDB-07**: CI linkable to assets (bridge physical inventory to logical CMDB)
- [x] **CMDB-08**: CI linkable to agents (agent-discovered CIs)
- [ ] **CMDB-09**: CMDB relationship map visualization (ReactFlow)
- [x] **CMDB-10**: Bulk import CIs from CSV/JSON via import wizard
- [x] **CMDB-11**: CMDB categories with hierarchical taxonomy
- [x] **CMDB-12**: Agent auto-discovery reconciliation: diff agent data vs CMDB, upsert CIs, log changes
- [x] **CMDB-13**: Background worker reconciles agent discoveries every 15 minutes, marks stale CIs inactive
- [x] **CMDB-14**: CMDB permissions: CMDB_VIEW, CMDB_EDIT, CMDB_DELETE, CMDB_IMPORT

### Change Management

- [x] **CHNG-01**: Change request CRUD with changeNumber, type (STANDARD/NORMAL/EMERGENCY), risk level
- [x] **CHNG-02**: Change status machine: NEW → ASSESSMENT → APPROVAL_PENDING → APPROVED → REJECTED → SCHEDULED → IMPLEMENTING → REVIEW → COMPLETED → CANCELLED
- [x] **CHNG-03**: Change approval workflow with sequenced approvers and PENDING/APPROVED/REJECTED/CANCELLED states
- [x] **CHNG-04**: Implementation plan, backout plan, and testing plan fields on change requests
- [x] **CHNG-05**: Change scheduling with start/end dates and collision detection
- [x] **CHNG-06**: Automated risk assessment scoring
- [x] **CHNG-07**: Change linkable to assets and applications (impact scope)
- [x] **CHNG-08**: Change activity audit trail
- [x] **CHNG-09**: Change calendar view

### CAB Meetings

- [x] **CAB-01**: CAB meeting CRUD with scheduling, location, meeting URL, duration
- [x] **CAB-02**: CAB attendees with roles (CHAIRPERSON/MEMBER/OBSERVER) and RSVP status
- [x] **CAB-03**: Link changes to meetings with agenda order and outcome recording
- [x] **CAB-04**: iCal download and email invitation sending
- [x] **CAB-05**: Meeting outcome: APPROVED/REJECTED/DEFERRED/NEEDS_MORE_INFO per change

### Application Portfolio

- [x] **APP-01**: Application CRUD with type (9 types), status, criticality, hosting model, tech stack
- [x] **APP-02**: Application dependency mapping (source → target with dependency type)
- [x] **APP-03**: Application document management (11 document types with URLs)
- [x] **APP-04**: Application-to-asset relationships with relationship types
- [x] **APP-05**: Application portfolio dashboard with summary statistics
- [x] **APP-06**: Visual dependency diagram

### Billing & Subscription

- [x] **BILL-01**: Stripe subscription integration with 4 tiers (STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE)
- [x] **BILL-02**: planGate middleware enforces plan limits (maxUsers, maxAgents, maxSites, features) returning 402
- [x] **BILL-03**: Trial flow: 14-day trial → dunning at trial-3d → suspension at expiry
- [x] **BILL-04**: Stripe webhook handler for subscription lifecycle events (created, updated, deleted, payment_failed, payment_succeeded)
- [x] **BILL-05**: Self-service billing portal via Stripe Customer Portal redirect
- [x] **BILL-06**: Tenant usage snapshots (daily: activeUsers, activeAgents, ticketCount, storageBytes)
- [x] **BILL-07**: Plan feature flags (CMDB, mobile, webhooks, etc.) gated by subscription tier

### Owner Admin Portal

- [x] **OADM-01**: Separate Next.js app on port 3800 with completely isolated auth (OwnerUser, bcrypt + TOTP MFA)
- [x] **OADM-02**: IP allowlist middleware; never exposed through Cloudflare or public DNS
- [x] **OADM-03**: Dashboard with MRR/ARR, trial conversions, churn, tenant counts
- [x] **OADM-04**: Tenant list with search/filter by plan, status; tenant detail with subscription and usage
- [x] **OADM-05**: Tenant lifecycle: suspend, unsuspend, delete (soft with 30-day recovery), extend trial, apply grace period
- [x] **OADM-06**: Read-only tenant impersonation with 15-minute signed token and persistent banner
- [x] **OADM-07**: Internal notes on tenants (visible only in admin app)
- [x] **OADM-08**: Billing dashboard: Stripe revenue, per-tenant billing detail, retry failed payments
- [x] **OADM-09**: Plan management: view/edit subscription plans, archive plans
- [x] **OADM-10**: System operations: worker health, maintenance broadcast, CMDB reconciliation trigger
- [x] **OADM-11**: Global cross-tenant audit log viewer
- [x] **OADM-12**: Manual tenant provisioning endpoint

### Inventory Agent (.NET)

- [ ] **AGNT-01**: .NET 8/9 cross-platform agent with modular collector architecture
- [ ] **AGNT-02**: Platform-specific data collection: Windows (WMI), Linux (/proc, dpkg/rpm), macOS (IOKit, system_profiler)
- [ ] **AGNT-03**: Agent enrollment via token authentication
- [ ] **AGNT-04**: Periodic heartbeat to server
- [ ] **AGNT-05**: Inventory snapshot submission (OS, hardware, network, software, services)
- [ ] **AGNT-06**: CMDB CI payload submission for auto-discovery reconciliation
- [ ] **AGNT-07**: Runs as Windows Service, Linux systemd daemon, or macOS launchd daemon
- [ ] **AGNT-08**: Local web UI at 127.0.0.1:8787 (loopback only)
- [ ] **AGNT-09**: Privacy tiers: full, restricted (no PII), anonymized (hashed)
- [ ] **AGNT-10**: Export plugins: HTTP(S) with retry/backoff, AWS S3, Azure Blob Storage
- [ ] **AGNT-11**: Configuration via TOML/YAML/JSON + env vars + CLI flags
- [ ] **AGNT-12**: Cross-platform installers: MSI/NSIS (Windows), .deb/.rpm (Linux), .pkg (macOS)

### Mobile App

- [ ] **MOBL-01**: React Native + Expo app targeting iOS 16+ and Android 10+
- [ ] **MOBL-02**: QR code or manual FQDN entry for server URL configuration
- [ ] **MOBL-03**: Secure token storage via expo-secure-store
- [ ] **MOBL-04**: Bottom tab navigation: Dashboard, Tickets, Knowledge, Assets, Profile
- [ ] **MOBL-05**: Ticket list, detail, and create screens
- [ ] **MOBL-06**: Knowledge article browsing and viewing
- [ ] **MOBL-07**: Push notifications via expo-notifications (FCM for Android, APNs for iOS)
- [ ] **MOBL-08**: Device token registration and cleanup lifecycle
- [ ] **MOBL-09**: Deep linking from push notifications to relevant entity screens
- [ ] **MOBL-10**: Camera/gallery access for ticket photo attachments
- [ ] **MOBL-11**: Offline-friendly cached ticket list and KB articles via TanStack Query
- [ ] **MOBL-12**: EAS Build profiles for development, preview, and production

### Push Notifications

- [ ] **PUSH-01**: Push notification service supporting FCM (Android) and APNs (iOS)
- [ ] **PUSH-02**: Device token registration endpoint with platform identification
- [ ] **PUSH-03**: Push events: ticket assigned, status changed, new comment, SLA breach/warning, change approval, CAB invitation, @mention
- [ ] **PUSH-04**: Per-user push notification preferences (configurable which events trigger push)
- [ ] **PUSH-05**: Notification payload includes screen and entityId for deep linking

### Integrations

- [ ] **INTG-01**: API key CRUD with hashed keys, prefix identification, scoped permissions, rate limiting
- [ ] **INTG-02**: External API endpoints (/api/v1/external/) for ticket access via API key
- [ ] **INTG-03**: Webhook CRUD with event subscription, signed payloads, retry with backoff
- [ ] **INTG-04**: Webhook delivery tracking with history viewer
- [ ] **INTG-05**: Webhook test delivery endpoint
- [ ] **INTG-06**: Alert configuration (email, SMS, Slack, Teams channels)

### Reporting & Analytics

- [x] **REPT-01**: Main dashboard with ticket stats, recent activity, and notifications
- [x] **REPT-02**: Ticket reports (CSV/JSON) with date range and filter parameters
- [x] **REPT-03**: Change reports and analytics
- [x] **REPT-04**: SLA compliance reports
- [ ] **REPT-05**: CMDB inventory and relationship reports *(deferred to Phase 4 — requires CMDB data from CMDB-01)*
- [x] **REPT-06**: Scheduled report generation with email delivery
- [x] **REPT-07**: System health analytics

### Settings & Configuration

- [x] **SETT-01**: User management CRUD (create, edit, disable, password reset)
- [x] **SETT-02**: Role management with permission editor
- [x] **SETT-03**: User group management
- [x] **SETT-04**: Queue management with assignment rules
- [x] **SETT-05**: SLA policy management
- [x] **SETT-06**: Category management (hierarchical with icons and colors)
- [x] **SETT-07**: Site management (physical locations)
- [x] **SETT-08**: Vendor management
- [x] **SETT-09**: Business unit management
- [x] **SETT-10**: Contract management with financials and SLA links
- [x] **SETT-11**: Tenant branding settings (logo, colors)
- [x] **SETT-12**: System/worker log viewer with SSE streaming

### Notifications

- [x] **NOTF-01**: In-app notification center with read/unread state
- [x] **NOTF-02**: Notification types covering tickets, changes, SLA, mentions, system events (12 types)
- [x] **NOTF-03**: Mark individual or all notifications as read
- [x] **NOTF-04**: Notification dispatch orchestrator coordinating email + push + in-app channels

### Infrastructure

- [x] **INFR-01**: Background workers via BullMQ: SLA monitoring, email notifications, email polling, CMDB reconciliation
- [x] **INFR-02**: Redis for queue management, caching, and rate limiting
- [x] **INFR-03**: MinIO/S3-compatible file storage for attachments
- [x] **INFR-04**: AES encryption for stored email passwords
- [x] **INFR-05**: Health check endpoint
- [x] **INFR-06**: Org lookup service for subdomain-based tenant resolution

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Security Enhancements

- **SEC-01**: OAuth2/SSO integration (Azure AD, Okta, Google) — Enterprise tier
- **SEC-02**: MFA/2FA for tenant users
- **SEC-03**: CAPTCHA on login
- **SEC-04**: CSP and HSTS security headers
- **SEC-05**: Brute force protection

### Advanced Features

- **ADV-01**: Biometric auth (Face ID / Touch ID) for mobile
- **ADV-02**: White-label per-tenant branding with custom domains
- **ADV-03**: Self-service signup flow (public /signup page)
- **ADV-04**: Push notification analytics (delivery rates, open rates)
- **ADV-05**: Service catalog with custom request forms
- **ADV-06**: Internationalization (i18n)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat | High complexity, not core to ITSM value; structured ticketing is the product |
| AI ticket auto-resolution | Premature without training data corpus; hallucination risk in ITSM context |
| Graph database for CMDB | PostgreSQL recursive CTEs sufficient at MSP scale; avoids ops complexity |
| Native RMM integration | Per-vendor API maintenance burden; webhooks + API let RMM tools push to Meridian |
| Built-in telephony/CTI | Marginal use case vs. development cost; integration-ready via webhooks |
| Multi-currency billing | Launch USD only; add via Stripe's native support when demand justifies |
| Built-in project management | Separate product category; task management within changes is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDN-01 | Phase 1 | Complete |
| FNDN-02 | Phase 1 | Complete |
| FNDN-03 | Phase 1 | Complete |
| FNDN-04 | Phase 1 | Complete |
| FNDN-05 | Phase 1 | Complete |
| FNDN-06 | Phase 1 | Complete |
| FNDN-07 | Phase 1 | Complete |
| TNCY-01 | Phase 1 | Complete |
| TNCY-02 | Phase 1 | Complete |
| TNCY-03 | Phase 1 | Complete |
| TNCY-04 | Phase 1 | Complete |
| TNCY-05 | Phase 1 | Complete |
| TNCY-06 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| AUTH-06 | Phase 1 | Complete |
| AUTH-07 | Phase 1 | Complete |
| AUTH-08 | Phase 1 | Complete |
| AUTH-09 | Phase 1 | Complete |
| INFR-01 | Phase 1 | Complete |
| INFR-02 | Phase 1 | Complete |
| INFR-03 | Phase 1 | Complete |
| INFR-04 | Phase 1 | Complete |
| INFR-05 | Phase 1 | Complete |
| INFR-06 | Phase 1 | Complete |
| BILL-01 | Phase 2 | Complete |
| BILL-02 | Phase 2 | Complete |
| BILL-03 | Phase 2 | Complete |
| BILL-04 | Phase 2 | Complete |
| BILL-05 | Phase 2 | Complete |
| BILL-06 | Phase 2 | Complete |
| BILL-07 | Phase 2 | Complete |
| OADM-01 | Phase 2 | Complete |
| OADM-02 | Phase 2 | Complete |
| OADM-03 | Phase 2 | Complete |
| OADM-04 | Phase 2 | Complete |
| OADM-05 | Phase 2 | Complete |
| OADM-06 | Phase 2 | Complete |
| OADM-07 | Phase 2 | Complete |
| OADM-08 | Phase 2 | Complete |
| OADM-09 | Phase 2 | Complete |
| OADM-10 | Phase 2 | Complete |
| OADM-11 | Phase 2 | Complete |
| OADM-12 | Phase 2 | Complete |
| TICK-01 | Phase 3 | Complete |
| TICK-02 | Phase 3 | Complete |
| TICK-03 | Phase 3 | Complete |
| TICK-04 | Phase 3 | Complete |
| TICK-05 | Phase 3 | Complete |
| TICK-06 | Phase 3 | Complete |
| TICK-07 | Phase 3 | Complete |
| TICK-08 | Phase 3 | Complete |
| TICK-09 | Phase 3 | Complete |
| TICK-10 | Phase 3 | Complete |
| TICK-11 | Phase 3 | Complete |
| TICK-12 | Phase 3 | Complete |
| SLA-01 | Phase 3 | Complete |
| SLA-02 | Phase 3 | Complete |
| SLA-03 | Phase 3 | Complete |
| SLA-04 | Phase 3 | Complete |
| SLA-05 | Phase 3 | Complete |
| SLA-06 | Phase 3 | Complete |
| EMAL-01 | Phase 3 | Complete |
| EMAL-02 | Phase 3 | Complete |
| EMAL-03 | Phase 3 | Complete |
| EMAL-04 | Phase 3 | Complete |
| EMAL-05 | Phase 3 | Complete |
| EMAL-06 | Phase 3 | Complete |
| EMAL-07 | Phase 3 | Complete |
| EMAL-08 | Phase 3 | Complete |
| KB-01 | Phase 3 | Complete |
| KB-02 | Phase 3 | Complete |
| KB-03 | Phase 3 | Complete |
| KB-04 | Phase 3 | Complete |
| KB-05 | Phase 3 | Complete |
| KB-06 | Phase 3 | Complete |
| PRTL-01 | Phase 3 | Complete |
| PRTL-02 | Phase 3 | Complete |
| PRTL-03 | Phase 3 | Complete |
| PRTL-04 | Phase 3 | Complete |
| PRTL-05 | Phase 4 | Deferred |
| PRTL-06 | Phase 3 | Complete |
| SETT-01 | Phase 3 | Complete |
| SETT-02 | Phase 3 | Complete |
| SETT-03 | Phase 3 | Complete |
| SETT-04 | Phase 3 | Complete |
| SETT-05 | Phase 3 | Complete |
| SETT-06 | Phase 3 | Complete |
| SETT-07 | Phase 3 | Complete |
| SETT-08 | Phase 3 | Complete |
| SETT-09 | Phase 3 | Complete |
| SETT-10 | Phase 3 | Complete |
| SETT-11 | Phase 3 | Complete |
| SETT-12 | Phase 3 | Complete |
| NOTF-01 | Phase 3 | Complete |
| NOTF-02 | Phase 3 | Complete |
| NOTF-03 | Phase 3 | Complete |
| NOTF-04 | Phase 3 | Complete |
| REPT-01 | Phase 3 | Complete |
| REPT-02 | Phase 3 | Complete |
| REPT-03 | Phase 3 | Complete |
| REPT-04 | Phase 3 | Complete |
| REPT-05 | Phase 4 | Deferred |
| REPT-06 | Phase 3 | Complete |
| REPT-07 | Phase 3 | Complete |
| ASST-01 | Phase 4 | Complete |
| ASST-02 | Phase 4 | Complete |
| ASST-03 | Phase 4 | Complete |
| ASST-04 | Phase 4 | Complete |
| ASST-05 | Phase 4 | Complete |
| CMDB-01 | Phase 4 | Complete |
| CMDB-02 | Phase 4 | Complete |
| CMDB-03 | Phase 4 | Complete |
| CMDB-04 | Phase 4 | Complete |
| CMDB-05 | Phase 4 | Complete |
| CMDB-06 | Phase 4 | Complete |
| CMDB-07 | Phase 4 | Complete |
| CMDB-08 | Phase 4 | Complete |
| CMDB-09 | Phase 4 | Pending |
| CMDB-10 | Phase 4 | Complete |
| CMDB-11 | Phase 4 | Complete |
| CMDB-12 | Phase 4 | Complete |
| CMDB-13 | Phase 4 | Complete |
| CMDB-14 | Phase 4 | Complete |
| CHNG-01 | Phase 4 | Complete |
| CHNG-02 | Phase 4 | Complete |
| CHNG-03 | Phase 4 | Complete |
| CHNG-04 | Phase 4 | Complete |
| CHNG-05 | Phase 4 | Complete |
| CHNG-06 | Phase 4 | Complete |
| CHNG-07 | Phase 4 | Complete |
| CHNG-08 | Phase 4 | Complete |
| CHNG-09 | Phase 4 | Complete |
| CAB-01 | Phase 4 | Complete |
| CAB-02 | Phase 4 | Complete |
| CAB-03 | Phase 4 | Complete |
| CAB-04 | Phase 4 | Complete |
| CAB-05 | Phase 4 | Complete |
| APP-01 | Phase 4 | Complete |
| APP-02 | Phase 4 | Complete |
| APP-03 | Phase 4 | Complete |
| APP-04 | Phase 4 | Complete |
| APP-05 | Phase 4 | Complete |
| APP-06 | Phase 4 | Complete |
| AGNT-01 | Phase 5 | Pending |
| AGNT-02 | Phase 5 | Pending |
| AGNT-03 | Phase 5 | Pending |
| AGNT-04 | Phase 5 | Pending |
| AGNT-05 | Phase 5 | Pending |
| AGNT-06 | Phase 5 | Pending |
| AGNT-07 | Phase 5 | Pending |
| AGNT-08 | Phase 5 | Pending |
| AGNT-09 | Phase 5 | Pending |
| AGNT-10 | Phase 5 | Pending |
| AGNT-11 | Phase 5 | Pending |
| AGNT-12 | Phase 5 | Pending |
| MOBL-01 | Phase 5 | Pending |
| MOBL-02 | Phase 5 | Pending |
| MOBL-03 | Phase 5 | Pending |
| MOBL-04 | Phase 5 | Pending |
| MOBL-05 | Phase 5 | Pending |
| MOBL-06 | Phase 5 | Pending |
| MOBL-07 | Phase 5 | Pending |
| MOBL-08 | Phase 5 | Pending |
| MOBL-09 | Phase 5 | Pending |
| MOBL-10 | Phase 5 | Pending |
| MOBL-11 | Phase 5 | Pending |
| MOBL-12 | Phase 5 | Pending |
| PUSH-01 | Phase 5 | Pending |
| PUSH-02 | Phase 5 | Pending |
| PUSH-03 | Phase 5 | Pending |
| PUSH-04 | Phase 5 | Pending |
| PUSH-05 | Phase 5 | Pending |
| INTG-01 | Phase 5 | Pending |
| INTG-02 | Phase 5 | Pending |
| INTG-03 | Phase 5 | Pending |
| INTG-04 | Phase 5 | Pending |
| INTG-05 | Phase 5 | Pending |
| INTG-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 182 total (note: original header said 148; actual count from requirement definitions is 182)
- Mapped to phases: 182
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability populated after roadmap creation*
