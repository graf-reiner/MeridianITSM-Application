# Requirements: MeridianITSM

**Defined:** 2026-03-19
**Core Value:** An MSP can manage multiple customer organizations' IT service desks from a single platform with complete tenant isolation, paying via Stripe subscription, with the full ITSM lifecycle working end-to-end.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FNDN-01**: Monorepo initialized with pnpm workspaces and Turborepo build pipeline
- [ ] **FNDN-02**: Shared database package (`packages/db`) with Prisma 7 schema covering all 50+ models
- [ ] **FNDN-03**: Shared types package (`packages/types`) with Zod schemas for all API inputs/outputs
- [ ] **FNDN-04**: Fastify 5 API server (`apps/api`) with plugin architecture and middleware pipeline
- [ ] **FNDN-05**: Next.js 16 frontend (`apps/web`) with App Router and React 19
- [ ] **FNDN-06**: Docker Compose configuration for PostgreSQL, Redis, MinIO, and MailHog
- [ ] **FNDN-07**: Database seeding with default tenant, roles, categories, SLA policies, and test users

### Multi-Tenancy

- [ ] **TNCY-01**: Every database table has tenantId column; every query is scoped by tenantId
- [ ] **TNCY-02**: Tenant model with types (MSP, ENTERPRISE, B2C) and subscription plan fields
- [ ] **TNCY-03**: CustomerOrganization model for MSP customers managing multiple client orgs
- [ ] **TNCY-04**: Tenant-scoped middleware on all API routes that injects tenantId from JWT claims
- [ ] **TNCY-05**: Prisma query extension or middleware that enforces tenantId on every operation
- [ ] **TNCY-06**: Subdomain-based tenant routing via Cloudflare Worker and org-lookup service

### Authentication & Authorization

- [ ] **AUTH-01**: User can log in with email and password (bcrypt hashed)
- [ ] **AUTH-02**: JWT-based session with tenantId, userId, and roles in claims
- [ ] **AUTH-03**: System roles: admin, msp_admin, agent, end_user with predefined permissions
- [ ] **AUTH-04**: Custom roles with JSON permission arrays, assignable per tenant
- [ ] **AUTH-05**: Permission checking via hasPermission(userId, tenantId, permission)
- [ ] **AUTH-06**: Role scoping to CustomerOrganization for MSP model
- [ ] **AUTH-07**: API key authentication for external integrations with scoped permissions
- [ ] **AUTH-08**: Rate limiting: AUTH 5/15min, API 100/min, API_READ 300/min, API_WRITE 30/min
- [ ] **AUTH-09**: Password reset flow via email link with time-limited token

### Incident Management

- [ ] **TICK-01**: User can create ticket with title, description, type (incident/service_request/problem), priority, category
- [ ] **TICK-02**: Ticket auto-generates sequential ticket number (e.g., TKT-00042) per tenant
- [ ] **TICK-03**: Ticket status transitions: NEW → OPEN → IN_PROGRESS → PENDING → RESOLVED → CLOSED → CANCELLED
- [ ] **TICK-04**: User can add comments to tickets with PUBLIC or INTERNAL visibility
- [ ] **TICK-05**: User can upload file attachments to tickets (stored in MinIO/S3)
- [ ] **TICK-06**: All ticket field changes are logged in an immutable audit trail (TicketActivity)
- [ ] **TICK-07**: Ticket list with filtering by status, priority, assignee, category, date range, and full-text search
- [ ] **TICK-08**: Ticket assignment to individual agents or user groups
- [ ] **TICK-09**: Queue-based ticket routing with auto-assignment rules
- [ ] **TICK-10**: Ticket can link to knowledge articles for resolution reference
- [ ] **TICK-11**: Ticket can link to CMDB Configuration Items (affected CIs)
- [ ] **TICK-12**: Time tracking on ticket comments (timeSpentMinutes)

### SLA Management

- [ ] **SLA-01**: SLA policies define response and resolution time targets per priority level (P1-P4)
- [ ] **SLA-02**: SLA timers start on ticket creation and track against configured targets
- [ ] **SLA-03**: SLA breach detection with warnings at 75% and 90% thresholds
- [ ] **SLA-04**: SLA timers respect business hours configuration
- [ ] **SLA-05**: SLA status displayed on ticket detail with countdown visualization
- [ ] **SLA-06**: Background worker monitors SLA compliance every minute

### Email System

- [ ] **EMAL-01**: Email account configuration for SMTP, IMAP, and POP3 with encrypted credentials
- [ ] **EMAL-02**: Inbound email polling creates tickets automatically (email-to-ticket)
- [ ] **EMAL-03**: Email reply threading matches replies to existing tickets
- [ ] **EMAL-04**: Email deduplication via Message-ID, subject ticket number, and MIME headers
- [ ] **EMAL-05**: Outbound email notifications for ticket events (created, assigned, updated, resolved, SLA breach)
- [ ] **EMAL-06**: Customizable HTML email templates with variable substitution
- [ ] **EMAL-07**: Email connection testing tool for SMTP/IMAP/POP3
- [ ] **EMAL-08**: Background worker polls email accounts every 5 minutes

### Knowledge Base

- [ ] **KB-01**: User can create articles with title, summary, rich text content (TipTap), and tags
- [ ] **KB-02**: Article lifecycle: DRAFT → IN_REVIEW → PUBLISHED → RETIRED
- [ ] **KB-03**: Full-text search across articles
- [ ] **KB-04**: Helpful/not helpful voting on articles
- [ ] **KB-05**: Articles linkable to tickets for resolution reference
- [ ] **KB-06**: Article view count tracking

### Self-Service Portal

- [ ] **PRTL-01**: End-user portal at /portal with simplified sidebar navigation
- [ ] **PRTL-02**: End users can submit service requests via simplified form
- [ ] **PRTL-03**: End users can view their ticket status and add comments
- [ ] **PRTL-04**: End users can browse published knowledge articles
- [ ] **PRTL-05**: End users can view their assigned assets
- [ ] **PRTL-06**: Middleware auto-redirects end_user role to /portal

### Asset Management

- [ ] **ASST-01**: Asset CRUD with assetTag, serialNumber, manufacturer, model, status lifecycle
- [ ] **ASST-02**: Asset status: IN_STOCK → DEPLOYED → IN_REPAIR → RETIRED → DISPOSED
- [ ] **ASST-03**: Asset assignment to users and sites
- [ ] **ASST-04**: Asset fields populated from inventory agent data (hostname, OS, CPU, memory, disks, network, software)
- [ ] **ASST-05**: Asset purchase tracking (date, cost, warranty)

### CMDB

- [ ] **CMDB-01**: Configuration Item CRUD with ciNumber, type, status, environment, flexible attributesJson
- [ ] **CMDB-02**: CI types: SERVER, WORKSTATION, NETWORK_DEVICE, SOFTWARE, SERVICE, DATABASE, VIRTUAL_MACHINE, CONTAINER, OTHER
- [ ] **CMDB-03**: CI relationships: DEPENDS_ON, HOSTS, CONNECTS_TO, RUNS_ON, BACKS_UP, VIRTUALIZES, MEMBER_OF
- [ ] **CMDB-04**: Impact analysis: traverse CI relationship graph to identify affected upstream/downstream CIs
- [ ] **CMDB-05**: CI change history: every attribute change logged with who/what made the change
- [ ] **CMDB-06**: CI linkable to tickets (affected CIs on incidents)
- [ ] **CMDB-07**: CI linkable to assets (bridge physical inventory to logical CMDB)
- [ ] **CMDB-08**: CI linkable to agents (agent-discovered CIs)
- [ ] **CMDB-09**: CMDB relationship map visualization (ReactFlow)
- [ ] **CMDB-10**: Bulk import CIs from CSV/JSON via import wizard
- [ ] **CMDB-11**: CMDB categories with hierarchical taxonomy
- [ ] **CMDB-12**: Agent auto-discovery reconciliation: diff agent data vs CMDB, upsert CIs, log changes
- [ ] **CMDB-13**: Background worker reconciles agent discoveries every 15 minutes, marks stale CIs inactive
- [ ] **CMDB-14**: CMDB permissions: CMDB_VIEW, CMDB_EDIT, CMDB_DELETE, CMDB_IMPORT

### Change Management

- [ ] **CHNG-01**: Change request CRUD with changeNumber, type (STANDARD/NORMAL/EMERGENCY), risk level
- [ ] **CHNG-02**: Change status machine: NEW → ASSESSMENT → APPROVAL_PENDING → APPROVED → REJECTED → SCHEDULED → IMPLEMENTING → REVIEW → COMPLETED → CANCELLED
- [ ] **CHNG-03**: Change approval workflow with sequenced approvers and PENDING/APPROVED/REJECTED/CANCELLED states
- [ ] **CHNG-04**: Implementation plan, backout plan, and testing plan fields on change requests
- [ ] **CHNG-05**: Change scheduling with start/end dates and collision detection
- [ ] **CHNG-06**: Automated risk assessment scoring
- [ ] **CHNG-07**: Change linkable to assets and applications (impact scope)
- [ ] **CHNG-08**: Change activity audit trail
- [ ] **CHNG-09**: Change calendar view

### CAB Meetings

- [ ] **CAB-01**: CAB meeting CRUD with scheduling, location, meeting URL, duration
- [ ] **CAB-02**: CAB attendees with roles (CHAIRPERSON/MEMBER/OBSERVER) and RSVP status
- [ ] **CAB-03**: Link changes to meetings with agenda order and outcome recording
- [ ] **CAB-04**: iCal download and email invitation sending
- [ ] **CAB-05**: Meeting outcome: APPROVED/REJECTED/DEFERRED/NEEDS_MORE_INFO per change

### Application Portfolio

- [ ] **APP-01**: Application CRUD with type (9 types), status, criticality, hosting model, tech stack
- [ ] **APP-02**: Application dependency mapping (source → target with dependency type)
- [ ] **APP-03**: Application document management (11 document types with URLs)
- [ ] **APP-04**: Application-to-asset relationships with relationship types
- [ ] **APP-05**: Application portfolio dashboard with summary statistics
- [ ] **APP-06**: Visual dependency diagram

### Billing & Subscription

- [ ] **BILL-01**: Stripe subscription integration with 4 tiers (STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE)
- [ ] **BILL-02**: planGate middleware enforces plan limits (maxUsers, maxAgents, maxSites, features) returning 402
- [ ] **BILL-03**: Trial flow: 14-day trial → dunning at trial-3d → suspension at expiry
- [ ] **BILL-04**: Stripe webhook handler for subscription lifecycle events (created, updated, deleted, payment_failed, payment_succeeded)
- [ ] **BILL-05**: Self-service billing portal via Stripe Customer Portal redirect
- [ ] **BILL-06**: Tenant usage snapshots (daily: activeUsers, activeAgents, ticketCount, storageBytes)
- [ ] **BILL-07**: Plan feature flags (CMDB, mobile, webhooks, etc.) gated by subscription tier

### Owner Admin Portal

- [ ] **OADM-01**: Separate Next.js app on port 3800 with completely isolated auth (OwnerUser, bcrypt + TOTP MFA)
- [ ] **OADM-02**: IP allowlist middleware; never exposed through Cloudflare or public DNS
- [ ] **OADM-03**: Dashboard with MRR/ARR, trial conversions, churn, tenant counts
- [ ] **OADM-04**: Tenant list with search/filter by plan, status; tenant detail with subscription and usage
- [ ] **OADM-05**: Tenant lifecycle: suspend, unsuspend, delete (soft with 30-day recovery), extend trial, apply grace period
- [ ] **OADM-06**: Read-only tenant impersonation with 15-minute signed token and persistent banner
- [ ] **OADM-07**: Internal notes on tenants (visible only in admin app)
- [ ] **OADM-08**: Billing dashboard: Stripe revenue, per-tenant billing detail, retry failed payments
- [ ] **OADM-09**: Plan management: view/edit subscription plans, archive plans
- [ ] **OADM-10**: System operations: worker health, maintenance broadcast, CMDB reconciliation trigger
- [ ] **OADM-11**: Global cross-tenant audit log viewer
- [ ] **OADM-12**: Manual tenant provisioning endpoint

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

- [ ] **REPT-01**: Main dashboard with ticket stats, recent activity, and notifications
- [ ] **REPT-02**: Ticket reports (CSV/JSON) with date range and filter parameters
- [ ] **REPT-03**: Change reports and analytics
- [ ] **REPT-04**: SLA compliance reports
- [ ] **REPT-05**: CMDB inventory and relationship reports
- [ ] **REPT-06**: Scheduled report generation with email delivery
- [ ] **REPT-07**: System health analytics

### Settings & Configuration

- [ ] **SETT-01**: User management CRUD (create, edit, disable, password reset)
- [ ] **SETT-02**: Role management with permission editor
- [ ] **SETT-03**: User group management
- [ ] **SETT-04**: Queue management with assignment rules
- [ ] **SETT-05**: SLA policy management
- [ ] **SETT-06**: Category management (hierarchical with icons and colors)
- [ ] **SETT-07**: Site management (physical locations)
- [ ] **SETT-08**: Vendor management
- [ ] **SETT-09**: Business unit management
- [ ] **SETT-10**: Contract management with financials and SLA links
- [ ] **SETT-11**: Tenant branding settings (logo, colors)
- [ ] **SETT-12**: System/worker log viewer with SSE streaming

### Notifications

- [ ] **NOTF-01**: In-app notification center with read/unread state
- [ ] **NOTF-02**: Notification types covering tickets, changes, SLA, mentions, system events (12 types)
- [ ] **NOTF-03**: Mark individual or all notifications as read
- [ ] **NOTF-04**: Notification dispatch orchestrator coordinating email + push + in-app channels

### Infrastructure

- [ ] **INFR-01**: Background workers via BullMQ: SLA monitoring, email notifications, email polling, CMDB reconciliation
- [ ] **INFR-02**: Redis for queue management, caching, and rate limiting
- [ ] **INFR-03**: MinIO/S3-compatible file storage for attachments
- [ ] **INFR-04**: AES encryption for stored email passwords
- [ ] **INFR-05**: Health check endpoint
- [ ] **INFR-06**: Org lookup service for subdomain-based tenant resolution

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
| (populated by roadmapper) | | |

**Coverage:**
- v1 requirements: 148 total
- Mapped to phases: 0
- Unmapped: 148

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after initial definition*
