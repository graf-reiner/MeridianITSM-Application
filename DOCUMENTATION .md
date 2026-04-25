# IT Service Desk - Complete Application Documentation

**Purpose:** Full documentation of the existing application to guide a clean rewrite with Claude Code/CLI.
**Generated:** 2026-03-19
**Current Completion:** ~62% (235/380 tasks)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Data Model (Prisma Schema)](#3-data-model)
4. [API Surface](#4-api-surface)
5. [Frontend Pages & Components](#5-frontend-pages--components)
6. [Backend Services & Workers](#6-backend-services--workers)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Mobile Application (React Native/Expo)](#8-mobile-application)
9. [Inventory Agent (.NET — Windows/Linux/macOS)](#9-inventory-agent)
10. [CMDB (Configuration Management Database)](#10-cmdb)
11. [SaaS Business Model & Subscription Tiers](#11-saas-business-model--subscription-tiers)
12. [Owner Admin Application](#12-owner-admin-application)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Additional Apps (Instance Manager, Org Lookup)](#14-additional-apps)
15. [End-User Portal & Mobile Routes](#15-end-user-portal--mobile-routes)
16. [Testing](#16-testing)
17. [Existing Documentation](#17-existing-documentation)
18. [Feature Inventory](#18-feature-inventory)
19. [Known Gaps & Incomplete Features](#19-known-gaps--incomplete-features)
20. [Improvement Opportunities for Rewrite](#20-improvement-opportunities)

---

## 1. Project Overview

### What It Is
An **MSP ITIL-Compliant Service Desk & Change Management System** delivered as a **multi-tenant SaaS product** with subscription-based licensing. It supports three deployment models:
- **MSP Model**: Managed Service Providers managing multiple customer organizations (highest value segment)
- **Enterprise Model**: Single organizations with their own IT service desk
- **B2C Model**: Service providers managing individual users

### Commercial Intent
The application is designed to be sold as a subscription SaaS product. The application owner manages all tenants, billing, and licensing through a **private Owner Admin application** (see Section 12) that is completely isolated from customer-facing infrastructure. Customers interact only with the main web app, mobile app, and inventory agent — they have no knowledge of or access to the owner admin layer.

### Core ITSM Capabilities
- **Incident/Service Request Management** (Ticketing)
- **Change Management** with CAB (Change Advisory Board) meetings
- **Knowledge Base** with article linking and voting
- **Asset Management** (manual + agent-collected inventory)
- **CMDB (Configuration Management Database)** with CI relationships, change impact analysis, and agent-fed auto-discovery
- **Application Portfolio Management** with dependency mapping
- **SLA Management** with automated monitoring and breach alerts
- **Email-to-Ticket** via IMAP/POP3 polling
- **Push Notifications** via Firebase Cloud Messaging (Android) and Apple Push Notification service (iOS)
- **Scheduled Reports** (CSV/JSON)
- **Webhook Integrations**
- **API Key Management** for external integrations

### Multi-Tenancy
Every database table has a `tenantId` column. **Every query must be scoped by tenantId** - this is the #1 security rule. The system uses a `Tenant` model with types: MSP, ENTERPRISE, B2C.

---

## 2. Architecture & Tech Stack

### Monorepo Structure
```
ITServiceDesk/
├── apps/
│   ├── web/                    # Main Next.js application (customer-facing)
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router (pages + API)
│   │   │   ├── components/     # React components
│   │   │   └── lib/            # Backend services, workers, utilities
│   │   ├── prisma/             # Database schema & migrations
│   │   └── public/             # Static assets
│   │   └── tests/              # Playwright E2E tests
│   ├── mobile/                 # React Native / Expo application
│   │   ├── src/
│   │   │   ├── screens/        # Screen components (iOS + Android)
│   │   │   ├── navigation/     # React Navigation stack & tab config
│   │   │   ├── components/     # Shared mobile UI components
│   │   │   ├── services/       # API client, push notification service
│   │   │   └── store/          # Zustand global state
│   │   ├── ios/                # Xcode project (CocoaPods)
│   │   ├── android/            # Android Gradle project
│   │   ├── app.json            # Expo configuration
│   │   └── eas.json            # Expo Application Services build config
│   ├── owner-admin/            # Owner-only admin portal (NEVER customer-facing)
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router (admin pages + API)
│   │   │   ├── components/     # Admin UI components
│   │   │   └── lib/            # Admin services (billing, provisioning, impersonation)
│   │   └── prisma/             # Shares main DB + owner-specific OwnerUser table
│   └── inventory-agent/        # .NET 8 cross-platform agent
│       ├── src/                # C# source code
│       └── packaging/          # Installer scripts (Windows, Linux, macOS)
├── docs/                       # Planning & architecture docs
├── infrastructure/             # Docker, Nginx, Cloudflare configs
├── pnpm-workspace.yaml         # Monorepo workspace config
├── turbo.json                  # Turborepo build config
└── docker-compose.yml          # Local dev services
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16 |
| Language | TypeScript | 5.3+ |
| UI Framework | React | 19 |
| ORM | Prisma | 6 |
| Database | PostgreSQL | 15+ |
| Cache/Queue | Redis | 7 |
| Job Queue | BullMQ | - |
| Auth | NextAuth.js | v5 (beta) |
| CSS | Tailwind CSS | 4 |
| UI Components | shadcn/ui (Radix primitives) | - |
| Icons | Material Design Icons (Pictogrammers) — `@mdi/react` + `@mdi/js` | - |
| Data Fetching | TanStack Query | v5 |
| Forms | React Hook Form + Zod | - |
| Rich Text | TipTap | - |
| E2E Testing | Playwright | - |
| Unit Testing | Vitest | - |
| Mobile | React Native + Expo | SDK 52+ |
| Mobile Nav | React Navigation | v7 |
| Mobile State | Zustand | - |
| Mobile Build | Expo Application Services (EAS) | - |
| Agent | .NET | 8/9 |
| Owner Admin Framework | Next.js (App Router) | 16 |
| Owner Admin Auth | Custom bcrypt + TOTP MFA | - |
| Billing | Stripe | - |

### Local Development Services (Docker Compose)

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | BullMQ queues, caching |
| MinIO | 9001 | S3-compatible file storage |
| MailHog | 8025 | Email testing |

---

## 3. Data Model

### Entity Relationship Overview

The database has **50+ models** organized into these domains:

#### Core Tenancy & Identity (8 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `Tenant` | Top-level organization | name, slug, type (MSP/ENTERPRISE/B2C), settings, plan (STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE), planLimitsJson, maxUsers, maxAgents, maxSites, trialEndsAt, suspendedAt, backendUrl, subdomain |
| `CustomerOrganization` | Customer orgs under a tenant (MSP model) | name, slug, primaryContact*, address fields |
| `User` | All users | email, passwordHash, firstName, lastName, displayName, phone, jobTitle, department, siteId, status, notificationPreferences |
| `UserGroup` | Groups of users for ticket assignment | name, email |
| `Role` | Permission roles | name, slug, permissions (JSON array), isSystemRole |
| `UserRole` | User-role assignments (M2M) | userId, roleId, customerOrganizationId |
| `Session` | User sessions | sessionToken, expiresAt |
| `ApiKey` | External API access | keyHash, keyPrefix, scopes (JSON), rateLimit |

#### Service Desk (9 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `Ticket` | Core tickets | ticketNumber, type (INCIDENT/SERVICE_REQUEST/PROBLEM), title, description, priority, impact, urgency, status (7 states), SLA fields, resolution |
| `TicketComment` | Comments on tickets | content, visibility (PUBLIC/INTERNAL), timeSpentMinutes |
| `TicketAttachment` | File attachments | filename, mimeType, fileSize, storagePath |
| `TicketActivity` | Audit trail | activityType (11 types), fieldName, oldValue, newValue |
| `TicketKnowledgeArticle` | Links articles to tickets (M2M) | ticketId, knowledgeArticleId |
| `Queue` | Ticket routing queues | name, autoAssign, defaultAssignee, assignmentRules (JSON) |
| `SLA` | Service Level Agreements | Priority-based response/resolution times (4 priorities × 2 targets = 8 time fields), businessHours |
| `Category` | Ticket categories (hierarchical) | name, icon, color, parentId (self-referencing), userGroupId |
| `EmailAccount` | Inbound/outbound email | SMTP/IMAP/POP3 config (host, port, user, encrypted password), email-to-ticket settings, pollInterval |

#### Change Management (7 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `Change` | Change requests | changeNumber, type (STANDARD/NORMAL/EMERGENCY), implementation/backout/testingPlan, riskLevel, status (10 states), scheduledStart/End |
| `ChangeApproval` | Approval workflow | approverId, status (PENDING/APPROVED/REJECTED/CANCELLED), sequenceOrder |
| `ChangeActivity` | Change audit trail | activityType, fieldName, oldValue, newValue |
| `ChangeApplication` | Links changes to applications (M2M) | changeId, applicationId |
| `ChangeAsset` | Links changes to assets (M2M) | changeId, assetId |
| `CABMeeting` | Change Advisory Board meetings | title, scheduledFor, durationMinutes, location, meetingUrl, status |
| `CABMeetingAttendee` | Meeting participants | userId, role (CHAIRPERSON/MEMBER/OBSERVER), rsvpStatus |
| `CABMeetingChange` | Changes discussed in meetings | agendaOrder, outcome (APPROVED/REJECTED/DEFERRED/NEEDS_MORE_INFO) |

#### Knowledge Management (1 model)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `KnowledgeArticle` | KB articles | articleNumber, title, summary, content (rich text), tags[], visibility, status (DRAFT/IN_REVIEW/PUBLISHED/RETIRED), viewCount, helpfulCount |

#### Asset & Endpoint Management (3 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `Asset` | IT assets | assetTag, serialNumber, manufacturer, model, status (IN_STOCK/DEPLOYED/IN_REPAIR/RETIRED/DISPOSED), purchaseDate/Cost, agent-collected fields (hostname, OS, CPU, memory, disks, networkInterfaces, softwareInventory) |
| `Site` | Physical locations | name, address fields, primaryContact* |
| `BusinessUnit` | Business departments | name, code, managerName/Email |

#### Application Portfolio (5 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `Application` | IT applications | name, type (9 types), status, criticality, hostingModel, techStack[], authMethod, dataClassification, annualCost, RPO/RTO, lifecycleStage, strategicRating |
| `ApplicationDependency` | App-to-app dependencies | sourceApplicationId, targetApplicationId, dependencyType (DATA_FLOW/API_CALL/SHARED_DATABASE/etc.) |
| `ApplicationDocument` | Documentation links | title, documentType (11 types), url |
| `ApplicationActivity` | App change audit trail | activityType, fieldName, oldValue, newValue |
| `ApplicationAsset` | Links apps to assets | relationshipType ("RUNS_ON"/"HOSTED_BY"/"USES"), isPrimary |

#### Agent & Inventory (4 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `Agent` | Endpoint agents | agentKey, hostname, platform (WINDOWS/LINUX/MACOS), platformVersion, agentVersion, status (ENROLLING/ACTIVE/OFFLINE/SUSPENDED) |
| `AgentEnrollmentToken` | Agent enrollment | tokenHash, scopes, maxEnrollments, expiresAt |
| `InventorySnapshot` | Point-in-time inventory | Hardware info, OS info, CPU, memory, disks, networkInterfaces, installedSoftware, localUsers, rawData |
| `MetricSample` | Time-series metrics | metricType, metricName, value, unit, tags, timestamp |

#### CMDB — Configuration Management Database (5 models) *(NEW)*
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `CmdbCategory` | CI classification taxonomy | name, slug, icon, color, parentId (self-referencing), description |
| `CmdbConfigurationItem` | Core CI record | ciNumber, name, type (SERVER/WORKSTATION/NETWORK_DEVICE/SOFTWARE/SERVICE/DATABASE/VIRTUAL_MACHINE/CONTAINER/OTHER), status (ACTIVE/INACTIVE/DECOMMISSIONED/PLANNED), environment (PRODUCTION/STAGING/DEV/DR), categoryId, assetId (optional link), agentId (optional link), ownerId, siteId, attributesJson (flexible key-value), discoveredAt, lastSeenAt, tenantId |
| `CmdbRelationship` | CI-to-CI dependency graph | sourceId, targetId, relationshipType (DEPENDS_ON/HOSTS/CONNECTS_TO/RUNS_ON/BACKS_UP/VIRTUALIZES/MEMBER_OF), description, isDiscovered |
| `CmdbChangeRecord` | CMDB audit trail for CI changes | ciId, changeType (CREATED/UPDATED/DELETED), fieldName, oldValue, newValue, changedBy (USER/AGENT/IMPORT), agentId, userId |
| `CmdbTicketLink` | Links CIs to tickets (M2M) | ciId, ticketId, linkType (AFFECTED/RELATED/CAUSED_BY) |

#### Owner Admin — Subscription & Billing (6 models) *(NEW — owner-admin app only, NOT accessible by tenants)*
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| `OwnerUser` | Application owner accounts (admin portal login) | email, passwordHash, totpSecret, totpEnabled, lastLoginAt — **no self-registration; rows seeded manually** |
| `OwnerSession` | Owner admin sessions (separate from tenant sessions) | sessionToken, ownerUserId, expiresAt, ipAddress, userAgent |
| `SubscriptionPlan` | Plan definitions | name (STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE), displayName, monthlyPriceUsd, annualPriceUsd, limitsJson (maxUsers, maxAgents, maxSites, maxTicketsPerMonth, features[]), stripePriceIdMonthly, stripePriceIdAnnual, isPublic |
| `TenantSubscription` | Active subscription per tenant | tenantId, planId, stripeCustomerId, stripeSubscriptionId, status (TRIALING/ACTIVE/PAST_DUE/CANCELED/SUSPENDED), currentPeriodStart, currentPeriodEnd, trialStart, trialEnd, cancelAtPeriodEnd |
| `TenantUsageSnapshot` | Daily usage metrics per tenant | tenantId, snapshotDate, activeUsers, activeAgents, ticketCount, storageBytes |
| `OwnerNote` | Internal notes on tenants | tenantId, ownerUserId, content, isPrivate |
| Model | Purpose |
|-------|---------|
| `Vendor` | Supplier/vendor records |
| `Contract` | Vendor contracts with financials, SLA links, compliance |
| `ContractAsset` | Contract-to-asset M2M |
| `AuditLog` | System-wide audit trail |
| `Notification` | In-app notifications |
| `DeviceToken` | Push notification device registration (platform: IOS/ANDROID, token, deviceId, appVersion) |
| `EmailTemplate` | Customizable email templates with variable support |
| `AlertConfiguration` | Alert system config (email, SMS, Slack, Teams, etc.) |
| `ScheduledReport` | Automated report generation |
| `Webhook` / `WebhookDelivery` | Outbound webhook configuration and delivery tracking |

### Key Enums

| Enum | Values |
|------|--------|
| TenantType | MSP, ENTERPRISE, B2C |
| SubscriptionPlanTier | STARTER, PROFESSIONAL, BUSINESS, ENTERPRISE |
| SubscriptionStatus | TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED |
| TicketStatus | NEW, OPEN, IN_PROGRESS, PENDING, RESOLVED, CLOSED, CANCELLED |
| TicketType | INCIDENT, SERVICE_REQUEST, PROBLEM |
| TicketPriority | LOW, MEDIUM, HIGH, CRITICAL |
| ChangeStatus | NEW, ASSESSMENT, APPROVAL_PENDING, APPROVED, REJECTED, SCHEDULED, IMPLEMENTING, REVIEW, COMPLETED, CANCELLED |
| ChangeType | STANDARD, NORMAL, EMERGENCY |
| AssetStatus | IN_STOCK, DEPLOYED, IN_REPAIR, RETIRED, DISPOSED |
| AgentStatus | ENROLLING, ACTIVE, OFFLINE, SUSPENDED |
| AgentPlatform | WINDOWS, LINUX, MACOS *(NEW)* |
| ArticleStatus | DRAFT, IN_REVIEW, PUBLISHED, RETIRED |
| NotificationType | 12 types covering tickets, changes, SLA, mentions, system |
| AuditAction | CREATE, UPDATE, DELETE, LOGIN, LOGOUT, APPROVE, REJECT, ASSIGN, ESCALATE |
| DevicePlatform | IOS, ANDROID *(NEW)* |
| CmdbCiStatus | ACTIVE, INACTIVE, DECOMMISSIONED, PLANNED *(NEW)* |
| CmdbCiType | SERVER, WORKSTATION, NETWORK_DEVICE, SOFTWARE, SERVICE, DATABASE, VIRTUAL_MACHINE, CONTAINER, OTHER *(NEW)* |
| CmdbRelationshipType | DEPENDS_ON, HOSTS, CONNECTS_TO, RUNS_ON, BACKS_UP, VIRTUALIZES, MEMBER_OF *(NEW)* |

---

## 4. API Surface

### API Routes (~115 endpoints)

All API routes are under `/api/v1/` and follow the pattern:
1. Authenticate via `auth()` (NextAuth session)
2. Scope all queries by `tenantId`
3. Return JSON responses

#### Authentication
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth.js handler (login, session, CSRF) |
| `/api/auth/error` | GET | Auth error page |
| `/api/health` | GET | Health check endpoint |

#### Tickets
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/tickets` | GET, POST | List tickets (with filters/pagination), create ticket |
| `/api/v1/tickets/[id]` | GET, PATCH, DELETE | Get/update/soft-delete ticket |
| `/api/v1/tickets/[id]/comments` | GET, POST | List/add comments |
| `/api/v1/tickets/[id]/attachments` | GET, POST | List/upload attachments |
| `/api/v1/tickets/[id]/attachments/[attachmentId]` | GET, DELETE | Download/delete attachment |
| `/api/v1/tickets/[id]/articles` | GET, POST, DELETE | Link/unlink knowledge articles |
| `/api/v1/tickets/[id]/cis` | GET, POST, DELETE | Link/unlink CMDB CIs to ticket *(NEW)* |

#### Changes
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/changes` | GET, POST | List/create changes |
| `/api/v1/changes/[id]` | GET, PATCH, DELETE | Get/update/delete change |
| `/api/v1/changes/[id]/approve` | POST | Submit approval decision |
| `/api/v1/changes/check-collision` | POST | Check schedule collisions |
| `/api/v1/changes/assess-risk` | POST | Automated risk assessment |

#### Knowledge Base
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/knowledge` | GET, POST | List/create articles (full-text search) |
| `/api/v1/knowledge/[id]` | GET, PATCH, DELETE | Get/update/delete article |
| `/api/v1/knowledge/[id]/vote` | POST | Helpful/not helpful voting |

#### Assets
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/assets` | GET, POST | List/create assets |
| `/api/v1/assets/[id]` | GET, PATCH, DELETE | Get/update/delete asset |
| `/api/v1/assets/import-agent-data` | POST | Import inventory from agent |

#### Applications
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/applications` | GET, POST | List/create applications |
| `/api/v1/applications/[id]` | GET, PATCH, DELETE | Get/update/delete application |
| `/api/v1/applications/dashboard` | GET | Application portfolio dashboard data |
| `/api/v1/applications/[id]/dependencies` | GET, POST | Manage dependencies |
| `/api/v1/applications/[id]/dependencies/[depId]` | PATCH, DELETE | Update/delete dependency |
| `/api/v1/applications/[id]/documents` | GET, POST | Manage documents |
| `/api/v1/applications/[id]/documents/[docId]` | PATCH, DELETE | Update/delete document |
| `/api/v1/applications/[id]/assets` | GET, POST | Manage asset relationships |
| `/api/v1/applications/[id]/assets/[relId]` | PATCH, DELETE | Update/delete asset relationship |

#### Agents & Inventory
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/agents` | GET, POST | List agents, agent enrollment |
| `/api/v1/agents/[id]` | GET, PATCH, DELETE | Get/update/delete agent |
| `/api/v1/agents/[id]/inventory` | GET | Get agent inventory snapshots |
| `/api/v1/agents/[id]/metrics` | GET | Get agent metrics |
| `/api/v1/agents/enroll` | POST | Agent enrollment (token auth) |
| `/api/v1/agents/heartbeat` | POST | Agent heartbeat (agent key auth) |
| `/api/v1/agents/inventory` | POST | Submit inventory snapshot (agent key auth) |
| `/api/v1/agents/cmdb-sync` | POST | Agent-triggered CMDB CI upsert *(NEW)* |
| `/api/v1/agent-tokens` | GET, POST | List/create enrollment tokens |
| `/api/v1/agent-tokens/[id]` | GET, PATCH, DELETE | Manage enrollment tokens |

#### CMDB *(NEW)*
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/cmdb/cis` | GET, POST | List/create Configuration Items |
| `/api/v1/cmdb/cis/[id]` | GET, PATCH, DELETE | Get/update/soft-delete CI |
| `/api/v1/cmdb/cis/[id]/relationships` | GET, POST | List/create CI relationships |
| `/api/v1/cmdb/cis/[id]/relationships/[relId]` | PATCH, DELETE | Update/delete relationship |
| `/api/v1/cmdb/cis/[id]/history` | GET | CI change history (audit trail) |
| `/api/v1/cmdb/cis/[id]/tickets` | GET | Tickets linked to this CI |
| `/api/v1/cmdb/cis/[id]/impact` | GET | Impact analysis: upstream/downstream CIs |
| `/api/v1/cmdb/categories` | GET, POST | List/create CI categories |
| `/api/v1/cmdb/categories/[id]` | GET, PATCH, DELETE | Manage CI category |
| `/api/v1/cmdb/import` | POST | Bulk import CIs from CSV/JSON |
| `/api/v1/cmdb/discovery/reconcile` | POST | Reconcile agent-discovered CIs with existing records |

#### Users & Groups
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/users` | GET, POST | List/create users |
| `/api/v1/users/[id]` | GET, PATCH, DELETE | Get/update/delete user |
| `/api/v1/users/[id]/send-password-reset` | POST | Send password reset email |
| `/api/v1/users/me` | GET, PATCH | Current user profile |
| `/api/v1/users/me/password` | POST | Change own password |
| `/api/v1/groups` | GET, POST | List/create user groups |
| `/api/v1/groups/[id]` | GET, PATCH, DELETE | Manage group |
| `/api/v1/roles` | GET, POST | List/create roles |

#### Configuration & Settings
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/categories` | GET, POST | List/create categories |
| `/api/v1/categories/[id]` | GET, PATCH, DELETE | Manage category |
| `/api/v1/queues` | GET, POST | List/create queues |
| `/api/v1/queues/[id]` | GET, PATCH, DELETE | Manage queue |
| `/api/v1/slas` | GET, POST | List/create SLAs |
| `/api/v1/slas/[id]` | GET, PATCH, DELETE | Manage SLA |
| `/api/v1/sites` | GET, POST | List/create sites |
| `/api/v1/sites/[id]` | GET, PATCH, DELETE | Manage site |
| `/api/v1/vendors` | GET, POST | List/create vendors |
| `/api/v1/vendors/[id]` | GET, PATCH, DELETE | Manage vendor |
| `/api/v1/contracts` | GET, POST | List/create contracts |
| `/api/v1/contracts/[id]` | GET, PATCH, DELETE | Manage contract |
| `/api/v1/business-units` | GET, POST | List/create business units |
| `/api/v1/business-units/[id]` | GET, PATCH, DELETE | Manage business unit |

#### Email
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/email-accounts` | GET, POST | List/create email accounts |
| `/api/v1/email-accounts/[id]` | GET, PATCH, DELETE | Manage email account |
| `/api/v1/email-accounts/test` | POST | Test SMTP/IMAP/POP3 connection |
| `/api/v1/email-templates` | GET, POST | List/create email templates |
| `/api/v1/email-templates/[id]` | GET, PATCH, DELETE | Manage email template |
| `/api/v1/admin/email-test` | POST | Send test email |

#### Notifications & Push
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/notifications` | GET | List notifications for current user |
| `/api/v1/notifications/[id]` | PATCH | Mark notification as read |
| `/api/v1/notifications/mark-all-read` | POST | Mark all as read |
| `/api/v1/devices/register` | POST | Register device token for push (platform: IOS \| ANDROID) |
| `/api/v1/devices/[deviceId]` | DELETE | Unregister device token |
| `/api/v1/push/devices` | GET | List registered devices |
| `/api/v1/push/send` | POST | Send push notification (admin) |
| `/api/v1/push/preferences` | GET, PATCH | Per-user push notification preferences *(NEW)* |

#### Integrations
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/api-keys` | GET, POST | List/create API keys |
| `/api/v1/api-keys/[id]` | GET, PATCH, DELETE | Manage API key |
| `/api/v1/webhooks` | GET, POST | List/create webhooks |
| `/api/v1/webhooks/[id]` | GET, PATCH, DELETE | Manage webhook |
| `/api/v1/webhooks/[id]/test` | POST | Test webhook delivery |
| `/api/v1/webhooks/[id]/deliveries` | GET | View delivery history |
| `/api/v1/alert-configurations` | GET, POST | Alert system configuration |

#### External API (API key auth)
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/external/tickets` | GET, POST | External ticket access via API key |
| `/api/v1/external/tickets/[id]` | GET, PATCH | External ticket management |
| `/api/v1/external/tickets/[id]/comments` | GET, POST | External ticket comments |

#### CAB Meetings
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/cab-meetings` | GET, POST | List/create CAB meetings |
| `/api/v1/cab-meetings/[id]` | GET, PATCH, DELETE | Manage meeting |
| `/api/v1/cab-meetings/[id]/rsvp` | POST | RSVP to meeting |
| `/api/v1/cab-meetings/[id]/ical` | GET | Download iCal file |
| `/api/v1/cab-meetings/[id]/send-invites` | POST | Send meeting invitations |

#### Analytics & Reports
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/dashboard` | GET | Main dashboard statistics |
| `/api/v1/analytics/system-health` | GET | System health metrics |
| `/api/v1/analytics/changes` | GET | Change analytics |
| `/api/v1/reports/tickets` | GET | Ticket reports (CSV/JSON) |
| `/api/v1/reports/changes` | GET | Change reports |
| `/api/v1/reports/sla-compliance` | GET | SLA compliance reports |
| `/api/v1/reports/cmdb` | GET | CMDB inventory & relationship reports *(NEW)* |
| `/api/v1/scheduled-reports` | GET, POST | Manage scheduled reports |
| `/api/v1/scheduled-reports/[id]` | GET, PATCH, DELETE | Manage individual report |

#### Billing (Customer-Facing) *(NEW)*
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/billing/portal-session` | POST | Generate Stripe Customer Portal URL for self-service billing |
| `/api/v1/billing/subscription` | GET | Current tenant subscription status, plan, and usage vs. limits |
| `/api/v1/billing/webhook` | POST | Stripe webhook receiver (subscription events, payment events) |

#### System
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/system/workers` | GET | Background worker status |
| `/api/v1/system/email-polling/trigger` | POST | Manually trigger email polling |
| `/api/v1/system/logs/stream` | GET | Server-Sent Events log stream |
| `/api/v1/org/lookup` | GET | Tenant resolution by subdomain |
| `/api/v1/settings/branding` | GET, PATCH | Tenant branding settings |
| `/api/v1/attachments/[id]` | GET | Download attachment by ID |
| `/api/v1/test-log` | POST | Test logging endpoint |

---

## 5. Frontend Pages & Components

### Dashboard Pages (55 pages)

#### Main Pages
| Path | Description |
|------|-------------|
| `/dashboard` | Main dashboard with ticket stats, recent activity, notifications |
| `/dashboard/profile` | User profile management |
| `/dashboard/analytics` | Analytics overview |
| `/dashboard/reports` | Report generation |
| `/dashboard/scheduled-reports` | Scheduled report management |

#### Ticket Management
| Path | Description |
|------|-------------|
| `/dashboard/tickets` | Ticket list with filtering and pagination |
| `/dashboard/tickets/new` | Create new ticket form |
| `/dashboard/tickets/[id]` | Ticket detail with comments, attachments, activity, linked articles, SLA status, linked CIs |

#### Change Management
| Path | Description |
|------|-------------|
| `/dashboard/changes` | Change request list |
| `/dashboard/changes/new` | Create new change request |
| `/dashboard/changes/[id]` | Change detail with approvals, timeline |
| `/dashboard/changes/calendar` | Change calendar view |

#### Knowledge Base
| Path | Description |
|------|-------------|
| `/dashboard/knowledge` | Article list with search |
| `/dashboard/knowledge/new` | Create article (TipTap rich text editor) |
| `/dashboard/knowledge/[id]` | View article |
| `/dashboard/knowledge/[id]/edit` | Edit article |

#### Assets
| Path | Description |
|------|-------------|
| `/dashboard/assets` | Asset inventory list |
| `/dashboard/assets/[id]` | Asset detail page |

#### Applications
| Path | Description |
|------|-------------|
| `/dashboard/applications` | Application portfolio list |
| `/dashboard/applications/new` | Create application |
| `/dashboard/applications/[id]` | Application detail |
| `/dashboard/applications/[id]/edit` | Edit application |
| `/dashboard/applications/dashboard` | Portfolio dashboard |
| `/dashboard/applications/dependencies` | Dependency map |

#### Agents
| Path | Description |
|------|-------------|
| `/dashboard/agents` | Agent list with status cards (platform badges: Windows/Linux/macOS) |
| `/dashboard/agents/[id]` | Agent detail (inventory, software, users, CMDB CIs tabs) |

#### CMDB *(NEW)*
| Path | Description |
|------|-------------|
| `/dashboard/cmdb` | CI list with search, filter by type/status/environment |
| `/dashboard/cmdb/new` | Create CI manually |
| `/dashboard/cmdb/[id]` | CI detail: attributes, relationships, linked tickets, change history |
| `/dashboard/cmdb/[id]/edit` | Edit CI |
| `/dashboard/cmdb/map` | Visual relationship map (ReactFlow) |
| `/dashboard/cmdb/import` | Bulk import wizard (CSV/JSON) |

#### CAB Meetings
| Path | Description |
|------|-------------|
| `/dashboard/cab-meetings` | CAB meeting list |
| `/dashboard/cab-meetings/[id]` | Meeting detail |

#### Contracts
| Path | Description |
|------|-------------|
| `/dashboard/contracts` | Contract list |
| `/dashboard/contracts/[id]` | Contract detail |

#### Settings (18 settings pages)
| Path | Description |
|------|-------------|
| `/dashboard/settings` | Settings hub |
| `/dashboard/settings/users` | User management |
| `/dashboard/settings/users/[id]/edit` | Edit user |
| `/dashboard/settings/roles` | Role management |
| `/dashboard/settings/groups` | User group management |
| `/dashboard/settings/queues` | Queue management |
| `/dashboard/settings/slas` | SLA management |
| `/dashboard/settings/categories` | Category management |
| `/dashboard/settings/sites` | Site management |
| `/dashboard/settings/vendors` | Vendor management |
| `/dashboard/settings/business-units` | Business unit management |
| `/dashboard/settings/email` | Email account management (SMTP/IMAP/POP3) |
| `/dashboard/settings/email-tester` | Email connection testing |
| `/dashboard/settings/email-templates` | Email template editor |
| `/dashboard/settings/api-keys` | API key management |
| `/dashboard/settings/webhooks` | Webhook management |
| `/dashboard/settings/alerts` | Alert configuration |
| `/dashboard/settings/branding` | Tenant branding |
| `/dashboard/settings/logs` | System/worker logs |
| `/dashboard/settings/push-tester` | Push notification tester (iOS & Android) |
| `/dashboard/settings/agent-tokens` | Agent enrollment token management |
| `/dashboard/settings/push-preferences` | Global push notification event configuration *(NEW)* |
| `/dashboard/settings/about` | System info / about page |

### Icon Library — Material Design Icons (Pictogrammers)

All icons across the web app, owner admin app, and mobile app use the **Material Design Icons** library from [Pictogrammers](https://pictogrammers.com/library/mdi/) (Apache 2.0 license — commercial use permitted).

#### Web & Owner Admin (`apps/web/`, `apps/owner-admin/`)
```bash
npm install @mdi/react @mdi/js
```
```tsx
import Icon from '@mdi/react';
import { mdiTicket, mdiAccount, mdiCog } from '@mdi/js';

<Icon path={mdiTicket} size={1} />
<Icon path={mdiAccount} size={1} color="currentColor" />
```
- `@mdi/js` is fully **tree-shakeable** — only the icons imported are included in the bundle
- `size={1}` = 24px (based on a 24px grid); use `size={0.75}` for 18px, `size={1.5}` for 36px
- Set `color="currentColor"` to inherit Tailwind text color classes
- Pass a `title` prop for screen reader accessibility: `<Icon path={mdiTicket} title="Tickets" size={1} />`
- Do **not** use the webfont (`@mdi/font`) — Pictogrammers explicitly recommends against it in favor of the SVG/JS approach

#### Mobile (`apps/mobile/`)
```bash
npm install react-native-vector-icons @mdi/js
```
```tsx
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

<MaterialCommunityIcons name="ticket" size={24} color="#000" />
```
- `MaterialCommunityIcons` within `react-native-vector-icons` is the React Native distribution of the MDI set, keeping the icon library consistent across web and mobile
- Icon names use kebab-case (e.g., `mdiTicketOutline` in `@mdi/js` → `"ticket-outline"` in `MaterialCommunityIcons`)
- Follow the [Expo vector icons setup](https://docs.expo.dev/guides/icons/) when using with Expo — add `expo-font` and configure in `app.json`

#### Icon Naming Convention
Browse and search all available icons at: **https://pictogrammers.com/library/mdi/**

| Context | `@mdi/js` import name | `MaterialCommunityIcons` name |
|---------|----------------------|------------------------------|
| Ticket | `mdiTicket` | `ticket` |
| Ticket (outline) | `mdiTicketOutline` | `ticket-outline` |
| User / Agent | `mdiAccount` | `account` |
| Settings / Cog | `mdiCog` | `cog` |
| Alert / Warning | `mdiAlert` | `alert` |
| Check / Done | `mdiCheck` | `check` |
| Dashboard | `mdiViewDashboard` | `view-dashboard` |
| Asset / Server | `mdiServer` | `server` |
| CMDB / Database | `mdiDatabase` | `database` |
| Knowledge Base | `mdiBookOpenVariant` | `book-open-variant` |
| Change Request | `mdiSwapHorizontal` | `swap-horizontal` |
| Push Notification | `mdiBell` | `bell` |
| Agent (endpoint) | `mdiDesktopClassic` | `desktop-classic` |

### UI Components (shadcn/ui - 25 components)
`alert`, `alert-dialog`, `avatar`, `badge`, `button`, `card`, `checkbox`, `collapsible`, `dialog`, `dropdown-menu`, `emoji-picker`, `form`, `input`, `label`, `progress`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `sonner`, `tooltip`

#### Feature Components
| Component | Path | Description |
|-----------|------|-------------|
| `app-sidebar` | `components/app-sidebar.tsx` | Main navigation sidebar |
| `settings-sidebar` | `components/settings/settings-sidebar.tsx` | Settings sub-navigation |
| `portal-sidebar` | `components/portal/portal-sidebar.tsx` | End-user portal nav |
| `notification-center` | `components/notifications/notification-center.tsx` | Notification dropdown |
| `tiptap-editor` | `components/tiptap-editor.tsx` | Rich text editor |
| `hydration-error-suppressor` | `components/hydration-error-suppressor.tsx` | SSR hydration fix |

#### Ticket Components
| Component | Description |
|-----------|-------------|
| `file-upload` | General file upload with progress |
| `ticket-file-upload` | Ticket-specific file upload |
| `advanced-filters` | Multi-field ticket filtering |
| `quick-actions-menu` | Quick ticket actions |
| `sla-progress-card` | SLA countdown visualization |
| `sla-timer-badge` | Inline SLA timer |
| `ticket-linked-articles` | Linked KB articles section |
| `article-link-dialog` | Search and link articles |
| `ticket-linked-cis` | Linked CMDB CIs section *(NEW)* |
| `ci-link-dialog` | Search and link CIs to ticket *(NEW)* |

#### Change Components
| Component | Description |
|-----------|-------------|
| `change-calendar` | Calendar view for scheduled changes |

#### Application Components
| Component | Description |
|-----------|-------------|
| `application-dependencies` | Dependency list management |
| `application-dependency-diagram` | Visual dependency graph |
| `asset-relationships` | Asset relationship management |
| `asset-relationship-diagram` | Visual asset map |
| `document-upload` | Application document management |

#### CMDB Components *(NEW)*
| Component | Description |
|-----------|-------------|
| `ci-list` | Filterable/searchable CI table |
| `ci-detail-card` | CI summary card with status badge |
| `ci-relationship-diagram` | ReactFlow-based CI dependency map |
| `ci-history-timeline` | Change history timeline for a CI |
| `ci-impact-panel` | Upstream/downstream impact viewer |
| `ci-import-wizard` | Step-by-step bulk import (CSV/JSON) |
| `ci-type-badge` | Color-coded CI type indicator |

#### Settings Components
| Component | Description |
|-----------|-------------|
| `user-management` | CRUD for users |
| `role-management` | CRUD for roles with permission editor |
| `group-management` | CRUD for user groups |
| `queue-management` | CRUD for ticket queues |
| `sla-management` | CRUD for SLA policies |
| `category-management` | CRUD for ticket categories |
| `site-management` | CRUD for sites |
| `vendor-management` | CRUD for vendors |
| `business-unit-management` | CRUD for business units |
| `email-management` | Email account CRUD |
| `email-tester` | SMTP/IMAP connection tester |
| `email-template-management` | Email template editor |
| `api-key-management` | API key CRUD |
| `webhook-management` | Webhook CRUD |
| `branding-management` | Tenant branding editor |
| `agent-token-management` | Agent enrollment tokens |
| `push-tester` | Push notification testing (iOS & Android) |
| `push-preferences-management` | Configure which events send push notifications *(NEW)* |
| `worker-logs` | Background worker log viewer |

#### Quick-Create Dialogs
| Component | Description |
|-----------|-------------|
| `vendor-quick-create` | Inline vendor creation |
| `contract-quick-create` | Inline contract creation |
| `site-quick-create` | Inline site creation |
| `queue-quick-create` | Inline queue creation |
| `category-quick-create` | Inline category creation |
| `business-unit-dialog` | Inline BU creation |
| `asset-dialog` | Inline asset creation |
| `scheduled-report-dialog` | Report scheduling dialog |
| `cab-meeting-dialog` | CAB meeting creation |
| `ci-quick-create` | Inline CI creation from ticket context *(NEW)* |

#### Providers
| Component | Description |
|-----------|-------------|
| `session-provider` | NextAuth session context |
| `tenant-provider` | Tenant context for multi-tenancy |
| `theme-provider` | Dark/light theme |

#### Worker Components
| Component | Description |
|-----------|-------------|
| `worker-status-indicator` | Background worker health indicator |

---

## 6. Backend Services & Workers

### Services (`lib/services/`)

| Service | File | Purpose |
|---------|------|---------|
| SLA Service | `sla-service.ts` | SLA calculation, breach detection, response/resolution time tracking |
| Email Service | `email-service.ts` | SMTP email sending via nodemailer |
| Email Polling | `email-polling.service.ts` | IMAP/POP3 email polling, email-to-ticket conversion |
| Notification Service | `notification.service.ts` | In-app notification creation and delivery |
| Push Notification | `push-notification.service.ts` | Firebase Cloud Messaging (Android) + APNs (iOS) integration |
| Webhook Service | `webhook.service.ts` | Webhook event dispatch and delivery |
| Ticket Validation | `ticket-validation.service.ts` | Ticket field validation rules |
| Change Lifecycle | `change-lifecycle.service.ts` | Change status state machine |
| Change Collision | `change-collision.service.ts` | Schedule overlap detection |
| Risk Assessment | `risk-assessment.service.ts` | Automated change risk scoring |
| Worker Logger | `worker-logger.ts` | Structured logging for background workers |
| CMDB Service | `cmdb.service.ts` | CI upsert, relationship management, impact analysis *(NEW)* |
| CMDB Discovery | `cmdb-discovery.service.ts` | Reconciles agent snapshots into CI records *(NEW)* |

### Background Workers (`lib/workers/`)

| Worker | File | Schedule | Purpose |
|--------|------|----------|---------|
| SLA Monitoring | `sla-monitoring.worker.ts` | Every minute | Checks for SLA breaches, sends warnings at 80% threshold |
| Email Notifications | `email-notifications.worker.ts` | Event-driven | Sends email notifications for ticket/change events |
| Email Polling | `email-polling.worker.ts` | Every 5 minutes | Polls IMAP/POP3 accounts, creates tickets from emails |
| CMDB Reconciliation | `cmdb-reconciliation.worker.ts` | Every 15 minutes | Reconciles new agent snapshots into CMDB CI records, marks stale CIs *(NEW)* |
| Auto-Start | `auto-start.ts` | On app init | Automatically starts all workers in development |
| Worker Index | `index.ts` | - | Worker registry and status tracking |

### Queue Configuration (`lib/queues/`)

| File | Purpose |
|------|---------|
| `config.ts` | BullMQ queue definitions and Redis connection |
| `email-queue-helper.ts` | Helper for enqueuing email notifications |

### Utility Files (`lib/`)

| File | Purpose |
|------|---------|
| `auth.ts` | NextAuth.js v5 configuration (credentials provider, JWT strategy) |
| `db.ts` | Prisma client singleton |
| `redis.ts` | Redis connection singleton |
| `permissions.ts` | RBAC permission checking utilities |
| `api-key-auth.ts` | API key authentication for external endpoints |
| `rate-limit.ts` | Redis token-bucket rate limiting (AUTH: 5/15min, API: 100/min, API_READ: 300/min, API_WRITE: 30/min, EXPENSIVE: 5/min) |
| `url-helpers.ts` | URL construction utilities |
| `version.ts` | Application version info |
| `utils.ts` | General utilities (cn, etc.) |
| `utils/encryption.ts` | AES encryption for email passwords |
| `utils/file-storage.ts` | MinIO/S3 file storage |
| `utils/email-tester.ts` | SMTP/IMAP/POP3 connection testing |
| `utils/pop3-test.ts` | POP3-specific testing utility |
| `notifications/index.ts` | Notification dispatch orchestrator (email + push + in-app) |

---

## 7. Authentication & Authorization

### Authentication
- **Provider**: NextAuth.js v5 (beta) with credentials provider
- **Strategy**: JWT (not database sessions for active auth)
- **Login**: Email + password (bcrypt hashed)
- **Session Data**: `user.id`, `user.tenantId`, `user.roles[]`
- **Middleware**: API routes check `auth()` for session validity

### Authorization (RBAC)
- **System Roles**: `admin`, `msp_admin`, `agent`, `end_user`
- **Custom Roles**: Tenant-specific roles with JSON permission arrays
- **Permission Check**: `hasPermission(userId, tenantId, PERMISSIONS.TICKETS_DELETE)`
- **Role Assignment**: Users can have multiple roles, optionally scoped to a CustomerOrganization
- **CMDB Permissions**: `CMDB_VIEW`, `CMDB_EDIT`, `CMDB_DELETE`, `CMDB_IMPORT` *(NEW)*

### External API Auth
- **API Keys**: Hashed keys with prefix identification, scoped permissions, rate limiting
- **Usage**: External integrations use `/api/v1/external/` endpoints with API key in header
- **Agent Auth**: Agent-specific key auth used for enrollment, heartbeat, and inventory endpoints

### What's Missing
- Password reset flow (partially implemented)
- OAuth2 providers (Azure AD, Okta, Google)
- MFA/2FA
- CAPTCHA on login
- Brute force protection
- Session invalidation on password change

---

## 8. Mobile Application

### Overview
The mobile application is a **true cross-platform native app** targeting both **iOS** and **Android**, built with **React Native and Expo**. It replaces the previous Capacitor-based WebView approach and provides a genuine native experience: native navigation, native UI controls, native push notifications (APNs on iOS, FCM on Android), and offline-capable screens with background sync.

### Technology
| Layer | Technology |
|-------|-----------|
| Framework | React Native (via Expo SDK 52+) |
| Build System | Expo Application Services (EAS Build) |
| Navigation | React Navigation v7 (Stack + Bottom Tabs) |
| State | Zustand + TanStack Query |
| Push (Android) | Firebase Cloud Messaging (FCM) |
| Push (iOS) | Apple Push Notification service (APNs) via Expo Notifications |
| Push Abstraction | `expo-notifications` (unified API across platforms) |
| Auth | Secure token storage via `expo-secure-store` |
| Deep Linking | Expo Linking + React Navigation |
| Storage | `expo-secure-store` (tokens), `@react-native-async-storage` (cache) |
| Camera | `expo-camera`, `expo-image-picker` |
| QR Scanning | `expo-barcode-scanner` |
| HTTP Client | Axios with tenant-aware interceptors |
| UI | React Native Paper + custom components |
| Icons | Material Design Icons — `react-native-vector-icons/MaterialCommunityIcons` + `@mdi/js` |

### Platform Support
| Platform | Min Version | Build Output |
|----------|------------|-------------|
| iOS | iOS 16+ | `.ipa` via EAS Build (App Store / TestFlight) |
| Android | Android 10 (API 29)+ | `.apk` / `.aab` via EAS Build |

### Architecture

```
apps/mobile/
├── src/
│   ├── screens/
│   │   ├── auth/           # Login, org selection
│   │   ├── dashboard/      # Home dashboard
│   │   ├── tickets/        # Ticket list, detail, create
│   │   ├── knowledge/      # KB browse and article view
│   │   ├── assets/         # Asset list
│   │   ├── notifications/  # Full notification history
│   │   └── profile/        # Profile, preferences, push settings
│   ├── navigation/
│   │   ├── RootNavigator.tsx    # Auth gating
│   │   ├── TabNavigator.tsx     # Bottom tab bar
│   │   └── TicketStack.tsx      # Nested stack navigators
│   ├── components/
│   │   ├── TicketCard.tsx
│   │   ├── NotificationBadge.tsx
│   │   ├── SlaTimerBadge.tsx
│   │   └── ...
│   ├── services/
│   │   ├── api.ts               # Axios API client
│   │   ├── push.service.ts      # Push token registration + handling
│   │   └── auth.service.ts      # Token management
│   └── store/
│       ├── useAuthStore.ts      # Auth state (Zustand)
│       └── useNotificationStore.ts
├── ios/                     # Xcode workspace (CocoaPods)
├── android/                 # Gradle project
├── app.json                 # Expo config (bundle IDs, permissions, icons)
└── eas.json                 # EAS build profiles (development, preview, production)
```

### Key Features
- QR code scanning for server URL configuration on first launch
- Manual FQDN entry option
- Server URL and auth token persisted in `expo-secure-store`
- Camera + gallery access for ticket photo attachments
- **Push notifications on both iOS and Android** (see Push Notifications section below)
- Offline-friendly: cached ticket list and KB articles via TanStack Query `staleTime`
- All native API calls are platform-guarded via `Platform.OS`

### Push Notifications

#### Architecture
Push notifications are delivered end-to-end through a unified pipeline:

```
Main Web App Event
        │
        ▼
Notification Service (push-notification.service.ts)
        │
        ├──── FCM (Firebase Cloud Messaging) ──────► Android Device
        │
        └──── APNs (Apple Push Notification service) ► iOS Device
```

#### Platform Configuration

| Platform | Service | Credentials Needed |
|----------|---------|-------------------|
| Android | Firebase Cloud Messaging (FCM) | `google-services.json` in `/android/app/` |
| iOS | Apple Push Notification service (APNs) | APNs key (`.p8`) or certificate, Team ID, Bundle ID |

Both platforms use `expo-notifications` as the unified JavaScript API. Token generation and registration are handled transparently by Expo.

#### Device Registration Flow
1. On app launch, `push.service.ts` calls `Notifications.registerForPushNotificationsAsync()`
2. Expo returns an `ExpoPushToken` (or a native FCM/APNs token for bare workflow)
3. The token is `POST`-ed to `/api/v1/devices/register` along with `platform: "IOS" | "ANDROID"` and `deviceId`
4. The server stores the token in `DeviceToken` (scoped by `userId`, `tenantId`)
5. On logout, the token is deleted via `DELETE /api/v1/devices/[deviceId]`

#### Triggered Push Events
The following main-application events trigger push notifications to registered mobile devices:

| Event | Notification Title | Condition |
|-------|--------------------|-----------|
| Ticket assigned to user | "Ticket Assigned" | Assignee has registered device |
| Ticket status changed | "Ticket Updated" | Requester or assignee has device |
| New comment on ticket | "New Comment" | Requester or assignee has device |
| SLA breach warning (80%) | "SLA Warning" | Assigned agent has device |
| SLA breached | "SLA Breached" | Tenant admins with devices |
| Change approval required | "Approval Required" | Approvers with devices |
| Change approved / rejected | "Change Decision" | Change owner has device |
| CAB meeting invitation | "Meeting Invitation" | Invitees with devices |
| Mention in comment | "@Mention" | Mentioned user has device |

Users can configure which events they receive push notifications for in `/dashboard/settings/push-preferences` (web) or **Profile → Notification Settings** (mobile).

#### Handling Incoming Notifications (Mobile)
- **Foreground**: Displayed as an in-app banner using `Notifications.setNotificationHandler`
- **Background / Killed**: Handled natively by iOS/Android; tap opens the app and deep-links to the relevant entity (e.g., `/tickets/[id]`)
- **Deep Linking**: Notification payload includes `screen` and `entityId` fields; `RootNavigator` reads these to navigate on app resume

#### Notification Payload Schema
```json
{
  "to": "<expo-push-token | fcm-token | apns-token>",
  "title": "Ticket Assigned",
  "body": "TKT-00042 has been assigned to you",
  "data": {
    "screen": "TicketDetail",
    "entityId": "clxyz123",
    "entityType": "TICKET",
    "tenantSlug": "acme-corp"
  },
  "sound": "default",
  "badge": 1
}
```

### Build & Distribution

#### EAS Build Profiles (`eas.json`)
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "apk" }
    }
  }
}
```

#### Build Commands
```bash
# iOS build
eas build --platform ios --profile production

# Android build
eas build --platform android --profile production

# Local Android debug APK
cd apps/mobile/android && ./gradlew assembleDebug

# Run on simulator
npx expo run:ios
npx expo run:android
```

#### APK Download Endpoint
A signed Android APK for internal distribution is still available at `/apkinstall` for environments without Play Store access.

---

## 9. Inventory Agent (.NET — Windows / Linux / macOS)

### Technology
- **.NET 8/9** cross-platform modular application
- Runs as **Windows Service**, **Linux systemd daemon**, or **macOS launchd daemon**

### Platform Support

| Platform | Service Manager | Install Command |
|----------|----------------|----------------|
| Windows | Windows Service (LocalService account) | `invagent service install` |
| Linux | systemd | `invagent service install` |
| macOS | launchd (`~/Library/LaunchAgents` or `/Library/LaunchDaemons`) | `invagent service install` |

### Architecture (10 C# projects)
```
apps/inventory-agent/
├── src/
│   ├── InvAgent.Core/          # Models, interfaces, configuration
│   ├── InvAgent.Collectors/    # Platform-specific data collectors
│   │   ├── Windows/            # WMI, registry, Windows APIs
│   │   ├── Linux/              # /proc, /sys, dpkg/rpm, systemd
│   │   └── MacOS/              # IOKit, system_profiler, Homebrew, launchctl
│   ├── InvAgent.Serialization/ # JSON/YAML/TOML serialization
│   ├── InvAgent.Storage/       # SQLite storage with EF Core
│   ├── InvAgent.Storage.Sqlite/# SQLite implementation
│   ├── InvAgent.Exporters/     # Export plugins (HTTP, S3, Azure Blob)
│   ├── InvAgent.WebUI/         # Local web interface (port 8787, loopback only)
│   ├── InvAgent.Service/       # Background service/daemon host
│   └── InvAgent.CLI/           # Command-line interface
├── packaging/
│   ├── windows/                # MSI / NSIS installer scripts
│   ├── linux/                  # .deb, .rpm, .sh packages
│   └── macos/                  # .pkg installer, notarized .dmg
└── Agent Build Instructions.md
```

### Data Collection

| Category | Windows | Linux | macOS |
|----------|---------|-------|-------|
| OS Info | WMI `Win32_OperatingSystem` | `/etc/os-release`, `uname` | `sw_vers`, `system_profiler SPSoftwareDataType` |
| Identity | Registry, WMI | `/etc/hostname`, `/etc/machine-id` | `scutil --get ComputerName`, IOKit UUID |
| Hardware | WMI, SMBIOS | `/proc/cpuinfo`, `/sys/class` | `system_profiler SPHardwareDataType`, IOKit |
| Network | `netsh`, WMI | `ip addr`, `/etc/resolv.conf` | `networksetup`, `ifconfig` |
| Software | Registry (Add/Remove Programs) | `dpkg`/`rpm`/`pacman` | Homebrew, `/Applications`, `pkgutil` |
| Services | SCM (Service Control Manager) | `systemctl` | `launchctl`, `launchd` plists |
| Cloud | IMDSv2 (AWS), IMDS (Azure/GCP) | Same | Same |

### Features
- **Privacy Tiers**: `full`, `restricted` (no PII), `anonymized` (hashed)
- **Local Web UI**: `127.0.0.1:8787` with tabs (Overview, Hardware, Apps, Services, Network, Raw JSON)
- **Export Plugins**: HTTP(S) with retry/backoff, AWS S3, Azure Blob Storage
- **Storage**: JSON snapshots + optional SQLite with 30-run retention
- **Schedule**: Every 24h with configurable jitter, plus CLI `--run-once`
- **Config**: TOML/YAML/JSON + env vars + CLI flags
- **Service Install**: `invagent service install` (cross-platform)
- **Docker Support**: Multi-stage Dockerfile with Alpine runtime

### Communication with Server
- Enrolls via `POST /api/v1/agents/enroll` with enrollment token
- Sends heartbeats via `POST /api/v1/agents/heartbeat`
- Submits inventory snapshot via `POST /api/v1/agents/inventory`
- **Triggers CMDB sync via `POST /api/v1/agents/cmdb-sync`** *(NEW)* — the agent submits a normalized CI payload after each inventory run; the server reconciles this into `CmdbConfigurationItem` records

### CMDB Data Feeding *(NEW)*

After each inventory collection run, the agent constructs and submits a **CMDB CI Payload** — a structured representation of the endpoint suitable for ingestion into the CMDB. This is separate from the raw `InventorySnapshot` and contains only normalized, schema-aligned fields.

#### CMDB CI Payload Schema
```json
{
  "agentKey": "agt_...",
  "schemaVersion": "v1",
  "collectedAt": "2026-03-19T12:00:00Z",
  "ci": {
    "name": "WORKSTATION-042",
    "type": "WORKSTATION",
    "environment": "PRODUCTION",
    "status": "ACTIVE",
    "attributes": {
      "os": "Windows 11 Pro 23H2",
      "cpuModel": "Intel Core i7-13700",
      "ramGb": 32,
      "diskGb": 512,
      "ipAddresses": ["10.0.1.42"],
      "macAddresses": ["AA:BB:CC:DD:EE:FF"],
      "domain": "corp.example.com",
      "serialNumber": "SN1234567",
      "manufacturer": "Dell",
      "model": "OptiPlex 7090"
    }
  },
  "relationships": [
    {
      "targetCiName": "DC-PROD-01",
      "targetCiType": "SERVER",
      "relationshipType": "CONNECTS_TO"
    }
  ]
}
```

#### Reconciliation Logic (Server-Side)
1. `POST /api/v1/agents/cmdb-sync` is received (agent key auth)
2. `cmdb-discovery.service.ts` looks up an existing `CmdbConfigurationItem` linked to this `agentId`
3. If **not found**: creates a new CI record, logs `CREATED` in `CmdbChangeRecord`
4. If **found**: diffs current attributes vs stored attributes; updates changed fields, logs each changed field in `CmdbChangeRecord` with `changedBy: AGENT`
5. `lastSeenAt` is always updated
6. `CmdbReconciliation` BullMQ worker runs every 15 minutes to mark CIs where `lastSeenAt` is older than the configured threshold as `INACTIVE`

### JSON Schema (v1)
```json
{
  "schemaVersion": "v1",
  "runId": "uuid",
  "collectedAt": "ISO8601",
  "os": { "platform", "version", "arch" },
  "identity": { "hostname", "uuid", "domain" },
  "network": [{ "ifName", "mac", "ip", "dns" }],
  "hardware": { "cpu": { "model", "cores", "speed" }, "memoryBytes" },
  "installedApps": [{ "name", "version", "publisher", "installDate" }],
  "services": [{ "name", "status", "pid", "port" }]
}
```

---

## 10. CMDB (Configuration Management Database) *(NEW)*

### Overview
The CMDB is a structured repository of **Configuration Items (CIs)** — the IT components that underpin business services — and the **relationships** between them. It is populated via three channels:

1. **Agent Auto-Discovery**: The inventory agent on Windows, Linux, and macOS automatically feeds CI data after each run (see Section 9)
2. **Manual Entry**: Staff create and manage CIs directly in the web UI
3. **Bulk Import**: CSV or JSON import via the import wizard

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Configuration Item (CI)** | Any IT component tracked in the CMDB: servers, workstations, network devices, software, services, databases, VMs, containers |
| **CI Type** | Classification: `SERVER`, `WORKSTATION`, `NETWORK_DEVICE`, `SOFTWARE`, `SERVICE`, `DATABASE`, `VIRTUAL_MACHINE`, `CONTAINER`, `OTHER` |
| **Environment** | `PRODUCTION`, `STAGING`, `DEV`, `DR` |
| **Status** | `ACTIVE`, `INACTIVE`, `DECOMMISSIONED`, `PLANNED` |
| **Relationship** | Directed edge between two CIs: `DEPENDS_ON`, `HOSTS`, `CONNECTS_TO`, `RUNS_ON`, `BACKS_UP`, `VIRTUALIZES`, `MEMBER_OF` |
| **Impact Analysis** | Given a CI, traverse the relationship graph upstream/downstream to identify affected services |
| **Change Record** | Every attribute change is logged with field name, old/new value, and who/what made the change (user, agent, or import) |

### Integration Points

#### Linked to Assets
A CI can be linked to an existing `Asset` record (`assetId` foreign key). This bridges the physical asset inventory with the logical CMDB view of the same device.

#### Linked to Tickets
When creating or updating a ticket, staff can link one or more CIs via `CmdbTicketLink`. This enables:
- "Which CIs are affected by this incident?"
- "Which tickets are related to this server before this change window?"

#### Linked to Agents
When an agent auto-creates or updates a CI, the `agentId` is stored on the CI. The agent detail page shows a **CMDB CIs** tab listing all CIs discovered by that agent.

### Web UI Screens

| Screen | Description |
|--------|-------------|
| **CI List** (`/dashboard/cmdb`) | Search, filter, paginate CIs by type/status/environment/site |
| **CI Detail** (`/dashboard/cmdb/[id]`) | Full CI view: attributes, relationships table, linked tickets, change history timeline |
| **Relationship Map** (`/dashboard/cmdb/map`) | Full-screen ReactFlow graph of all CIs and their relationships, filterable by environment or CI type |
| **Impact Analysis** | From any CI detail page, click "View Impact" to see a highlighted sub-graph of affected upstream/downstream CIs |
| **Import Wizard** (`/dashboard/cmdb/import`) | Upload CSV or JSON, map columns, preview, and import |

### Permissions

| Permission | Description |
|-----------|-------------|
| `CMDB_VIEW` | Read CIs, relationships, history |
| `CMDB_EDIT` | Create and update CIs and relationships |
| `CMDB_DELETE` | Soft-delete CIs |
| `CMDB_IMPORT` | Bulk import CIs |

By default, `admin` and `msp_admin` system roles have all CMDB permissions. The `agent` role has `CMDB_VIEW` only. Staff agents can be granted `CMDB_EDIT` via custom roles.

---

## 11. SaaS Business Model & Subscription Tiers

### Target Customer Segments

| Segment | Description | Monetization Lever |
|---------|-------------|-------------------|
| **MSPs** | IT managed service providers managing multiple client orgs | Per-technician seat or per managed org; highest ACV |
| **Enterprise IT** | Single organizations running internal help desks | Per-seat or flat monthly; high volume, lower ACV |
| **B2C** (future) | Service providers managing individual end users | Not recommended until MSP/Enterprise segments are stable |

### Subscription Tiers

| Tier | Target | Key Limits | Approximate Price |
|------|--------|-----------|------------------|
| **Starter** | Small IT teams / evaluation | 5 agent seats, 1 site, no CMDB, no mobile app, email only | $49–$99 / mo |
| **Professional** | SMB IT departments | 25 agent seats, 5 sites, CMDB, mobile app, API access | $199–$399 / mo |
| **Business** | MSPs / larger orgs | Unlimited seats, unlimited sites, full CMDB, webhooks, scheduled reports, multi-tenant | $599–$999 / mo |
| **Enterprise** | Large MSPs / enterprise | Custom limits, SSO/Azure AD, SLA guarantees, dedicated support, custom branding per tenant | Custom / $1,500+ / mo |

### Plan Feature Matrix

| Feature | Starter | Professional | Business | Enterprise |
|---------|---------|-------------|----------|------------|
| Agent seats | 5 | 25 | Unlimited | Custom |
| Sites | 1 | 5 | Unlimited | Custom |
| CMDB | ✗ | ✓ | ✓ | ✓ |
| Mobile app (iOS + Android) | ✗ | ✓ | ✓ | ✓ |
| API access | ✗ | ✓ | ✓ | ✓ |
| Webhooks | ✗ | ✗ | ✓ | ✓ |
| Scheduled reports | ✗ | ✗ | ✓ | ✓ |
| Custom branding | ✗ | ✗ | ✗ | ✓ |
| SSO / Azure AD / Okta | ✗ | ✗ | ✗ | ✓ |
| Dedicated support | ✗ | ✗ | ✗ | ✓ |
| Multi-tenant (MSP model) | ✗ | ✗ | ✓ | ✓ |

### Plan Enforcement Architecture

Plan limits are enforced at the **API middleware layer** in the main web app. Every request to a resource-creating endpoint passes through a `planGate` middleware function that reads the tenant's active plan from `TenantSubscription`, compares current usage from the latest `TenantUsageSnapshot`, and returns `402 Payment Required` with a structured error body when limits are exceeded.

```
Incoming API Request
        │
        ▼
 Auth Middleware (tenantId resolved)
        │
        ▼
 planGate(resource: 'agents' | 'users' | 'sites' | 'cmdb' | ...)
        │
        ├── Fetch TenantSubscription (cached in Redis, TTL 60s)
        ├── Fetch TenantUsageSnapshot (latest daily snapshot)
        ├── Compare usage vs. planLimitsJson
        │
        ├── OVER LIMIT → 402 { error: 'PLAN_LIMIT_EXCEEDED', limit: 5, current: 5, feature: 'agents' }
        └── WITHIN LIMIT → proceed to route handler
```

Feature flags (CMDB, mobile, webhooks, etc.) are stored as a `features[]` array in `planLimitsJson` on the `SubscriptionPlan` record. The `planGate` middleware checks feature flags for non-CRUD gates (e.g., attempting to register a mobile device on Starter returns `402`).

### Trial Flow

1. New tenant is provisioned → `TenantSubscription` created with `status: TRIALING`, `trialEnd` set to `now + 14 days`
2. A cron job runs daily; at `trialEnd - 3 days`, a dunning email is sent prompting the customer to add a payment method via Stripe Customer Portal
3. At `trialEnd`, if no active Stripe subscription: `status → SUSPENDED`, tenant login blocked with a paywall page
4. If payment is added before `trialEnd`: Stripe webhook fires → `status → ACTIVE`
5. A 3-day grace period can be manually applied by the owner via the Owner Admin app

### Self-Service Billing Portal

Customers manage their own subscriptions via **Stripe Customer Portal** (hosted by Stripe, linked from within the app's settings). This covers:
- Credit card entry and updates
- Plan upgrades and downgrades
- Invoice history and PDF downloads
- Subscription cancellation

The application triggers the portal redirect via `POST /api/v1/billing/portal-session`, which calls the Stripe API and returns a short-lived portal URL.

### Stripe Webhook Events Handled

| Stripe Event | Action |
|-------------|--------|
| `customer.subscription.created` | Set `TenantSubscription.status = ACTIVE` |
| `customer.subscription.updated` | Sync plan tier, period dates |
| `customer.subscription.deleted` | Set status to `CANCELED`, begin offboarding |
| `invoice.payment_failed` | Set status to `PAST_DUE`, send dunning email |
| `invoice.payment_succeeded` | Clear `PAST_DUE`, update period dates |
| `customer.subscription.trial_will_end` | Send trial ending reminder email (also handled by cron) |

---

## 12. Owner Admin Application

### Overview

The Owner Admin app is a **completely separate Next.js application** accessible only to the application owner (you). It runs on a different port, a different internal domain, is never exposed through Cloudflare or public DNS, and uses its own authentication table (`OwnerUser`) that has no relationship to the tenant user system. Customers have no knowledge of its existence.

**Golden rule**: No code path in the main web app (`apps/web/`) can authenticate to or call the owner admin app. They share the same PostgreSQL database but use different schemas/table prefixes for owner-specific tables and completely separate JWT secrets and cookie domains.

### Why a Separate App (Not a Hidden Page)

Hiding an admin panel inside the main app behind a role check is insufficient because:
- A misconfigured permission could expose routes to a tenant admin
- Shared JWT secrets mean a customer's session token is theoretically valid against admin endpoints
- A future developer could accidentally expose a route
- It conflates the security boundary between owner and customer

A separate app on a **VPN-gated or IP-allowlisted internal domain** (`admin.internal.yourdomain.com`) means there is no network route from the public internet to the admin panel at all.

### Architecture

```
apps/owner-admin/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/          # Owner login (email + TOTP MFA)
│   │   ├── (admin)/
│   │   │   ├── dashboard/      # MRR/ARR overview, key metrics
│   │   │   ├── tenants/        # Tenant list and management
│   │   │   ├── tenants/[id]/   # Tenant detail: subscription, usage, notes, impersonation
│   │   │   ├── billing/        # Stripe revenue dashboard
│   │   │   ├── plans/          # Plan definitions and limits
│   │   │   ├── system/         # Worker health, global operations
│   │   │   └── audit/          # Global cross-tenant audit log
│   │   └── api/
│   │       └── admin/          # Owner-only API routes (separate from /api/v1/)
│   ├── components/
│   │   ├── TenantTable.tsx
│   │   ├── RevenueChart.tsx
│   │   ├── UsageGauge.tsx
│   │   ├── ImpersonationBanner.tsx
│   │   └── ...
│   └── lib/
│       ├── owner-auth.ts        # Separate auth (bcrypt + TOTP, OwnerUser table)
│       ├── stripe-admin.ts      # Stripe admin operations
│       ├── provisioning.ts      # Tenant provisioning/suspension workflows
│       ├── impersonation.ts     # Read-only tenant impersonation logic
│       └── usage.ts             # Usage aggregation queries
└── package.json                 # Independent dependencies
```

### Authentication

The owner admin uses its own **completely separate authentication stack**:

- **User table**: `OwnerUser` — populated only by manual database seed; no registration endpoint exists
- **Password**: bcrypt-hashed, minimum 16 characters enforced
- **MFA**: TOTP (Google Authenticator / Authy) required for all accounts — no bypass path
- **Session**: Separate JWT secret (not shared with the main app), stored in an `HttpOnly` cookie scoped to the admin domain
- **Session duration**: 4 hours with sliding expiry; re-authentication required after idle
- **IP allowlist**: Middleware rejects requests from IPs not in a configured CIDR allowlist (e.g., your home/office IP or VPN exit node)
- **No "forgot password" flow**: Password resets are done by the owner directly in the database — there is no email-based reset attack surface

### Admin Pages & Features

#### Dashboard (`/dashboard`)
- **MRR** (Monthly Recurring Revenue) and **ARR** across all tenants
- New signups this month, trial conversions, churn
- Active vs. trialing vs. suspended vs. canceled tenant counts
- Failed payment count (requiring attention)
- Recent tenant activity feed

#### Tenant Management (`/tenants`)
| Feature | Description |
|---------|-------------|
| Tenant list | Searchable by name, domain, email; filterable by plan, status |
| Tenant detail | Full view: subscription info, usage vs. limits, active users, agent count, last activity |
| Plan assignment | Change a tenant's plan; optionally override individual limits |
| Trial extension | Manually extend a trial by N days |
| Grace period | Apply a 3-day grace period to a past-due tenant |
| Suspend tenant | Immediately block tenant logins; tenant data preserved |
| Unsuspend tenant | Restore access |
| Delete tenant | Soft-delete with 30-day recovery window, then hard delete |
| Internal notes | Add private notes visible only in the admin app (e.g., "on annual contract, do not auto-suspend") |
| Impersonation | Enter a read-only view of the tenant's dashboard for support triage (see below) |

#### Tenant Impersonation
The owner can enter a **read-only impersonation session** for any tenant. This generates a short-lived (15-minute) signed token that grants read-only access to the tenant's data in the main web app. A persistent banner is displayed during impersonation: `"Admin view — read only. Exiting in 14:23"`. Write operations are blocked at the API layer when an impersonation token is detected.

#### Billing (`/billing`)
- Stripe revenue dashboard: MRR, churn, LTV per tenant
- Per-tenant: subscription status, Stripe customer ID, payment method on file, last invoice
- Failed payment list with one-click retry trigger
- Manually apply credit or discount to a Stripe customer
- Link/unlink a Stripe customer ID to a tenant record
- View invoice history across all tenants

#### Plan Management (`/plans`)
- View and edit `SubscriptionPlan` records (name, price, limits, feature flags)
- Changes to a plan propagate immediately to all tenants on that plan (limits are read at request time, not cached on the tenant)
- Archive a plan (hides from new signups, existing tenants grandfathered)

#### System Operations (`/system`)
- Background worker health across all instances (BullMQ queue depths, last run times, error counts)
- Trigger global CMDB reconciliation
- Broadcast maintenance notice to all tenant dashboards (stored in Redis, read by the main app on page load)
- Manage global agent enrollment token templates (pre-seeded for new tenant provisioning)
- View Redis queue depths and flush stuck jobs

#### Global Audit Log (`/audit`)
- Cross-tenant audit log viewer (reads from `AuditLog` table, unscoped by tenantId — owner-only capability)
- Filter by tenant, user, action, date range
- Useful for compliance investigations and support escalations

### Owner Admin API Routes

All routes live under `/api/admin/` in the `apps/owner-admin/` app — completely separate from the main app's `/api/v1/`.

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/admin/auth/login` | POST | Email + TOTP login |
| `/api/admin/auth/logout` | POST | Invalidate session |
| `/api/admin/dashboard` | GET | Aggregate MRR, churn, signup metrics |
| `/api/admin/tenants` | GET | List all tenants with plan/status/usage |
| `/api/admin/tenants/[id]` | GET, PATCH | Get tenant detail, update plan/status/limits |
| `/api/admin/tenants/[id]/suspend` | POST | Suspend tenant |
| `/api/admin/tenants/[id]/unsuspend` | POST | Restore tenant access |
| `/api/admin/tenants/[id]/delete` | POST | Soft-delete tenant |
| `/api/admin/tenants/[id]/extend-trial` | POST | Extend trial by N days |
| `/api/admin/tenants/[id]/grace-period` | POST | Apply payment grace period |
| `/api/admin/tenants/[id]/notes` | GET, POST | Get/add internal owner notes |
| `/api/admin/tenants/[id]/impersonate` | POST | Generate read-only impersonation token |
| `/api/admin/tenants/[id]/usage` | GET | Historical usage snapshots |
| `/api/admin/billing` | GET | Stripe revenue summary |
| `/api/admin/billing/tenants/[id]` | GET | Per-tenant billing detail |
| `/api/admin/billing/retry-payment` | POST | Retry failed Stripe invoice |
| `/api/admin/plans` | GET, POST | List/create subscription plans |
| `/api/admin/plans/[id]` | GET, PATCH, DELETE | Manage plan |
| `/api/admin/system/workers` | GET | Global worker health |
| `/api/admin/system/maintenance` | POST, DELETE | Set/clear maintenance notice |
| `/api/admin/system/cmdb-reconcile` | POST | Trigger global CMDB reconciliation |
| `/api/admin/audit` | GET | Cross-tenant audit log |
| `/api/admin/provision` | POST | Manually provision a new tenant |

### Deployment & Access Control

| Property | Value |
|----------|-------|
| Port | 3800 (separate from main app port 3000) |
| Domain | `admin.internal.yourdomain.com` (private DNS, not public Cloudflare) |
| Network | VPN-only or IP allowlist via Nginx `allow` directives |
| TLS | Internal certificate (Let's Encrypt via cert-manager or self-signed with local trust) |
| Cloudflare | **Never** proxied through Cloudflare — direct server access only |
| JWT Secret | Completely separate env var (`OWNER_JWT_SECRET`) from main app (`NEXTAUTH_SECRET`) |
| Cookie Domain | `.internal.yourdomain.com` (cannot be read by main app cookies) |

### Provisioning a New Tenant (Workflow)

When a new customer signs up (either via self-service or manually):

```
1. Owner Admin POST /api/admin/provision
       │
       ├── Create Tenant record (main DB)
       ├── Create TenantSubscription (status: TRIALING, trialEnd: now + 14d)
       ├── Create Stripe Customer (via Stripe API)
       ├── Seed default roles, categories, SLA policies for new tenant
       ├── Create initial admin User for the tenant
       ├── Send welcome email with login URL and setup instructions
       └── Optionally: create agent enrollment token pre-seeded for this tenant
```

Eventually, steps 2–8 run automatically when a customer completes self-service signup (outside the admin app). The owner admin can always trigger manual provisioning for enterprise customers onboarded off-channel.

---

## 13. Infrastructure & Deployment

### Production Environment
| Item | Value |
|------|-------|
| Server IP | 10.3.200.104 |
| Service Port | 3000 |
| Public URL | https://servicedeskbeta.msaas.online/ |
| Service Manager | systemd (`servicedesk.service`) |
| SSL/CDN | Cloudflare |

### Deployment Architecture
```
Internet → Cloudflare (SSL/DDoS/CDN) → 10.3.200.104:3000 (Next.js — main app)
                                         ├── PostgreSQL (local, shared)
                                         ├── Redis (local, shared)
                                         └── MinIO (local)

VPN / IP Allowlist → 10.3.200.104:3800 (Next.js — owner admin app)
                      └── PostgreSQL (same DB, owner-admin tables isolated)
```

### Docker Configuration
- **Dockerfile**: Multi-stage build (builder → runner)
- **docker-compose.yml**: PostgreSQL, Redis, MinIO, MailHog for local dev
- **Entrypoint**: Runtime configuration script

### Multi-Tenant Routing
- **Cloudflare Worker**: Routes subdomains to tenant backends
- **Nginx Config**: Multi-tenant reverse proxy rules
- **Instance Manager**: Orchestration for multi-server deployments
- **Org Lookup Service**: Resolves tenant by subdomain (`/api/v1/org/lookup`)

### Default Credentials
| Role | Email | Password |
|------|-------|----------|
| MSP Admin | admin@msp.local | Admin123! |
| Agent | agent@msp.local | Agent123! |
| End User | user@customer.local | User123! |

---

## 14. Additional Apps

### Instance Manager (`apps/instance-manager/`)
- **Purpose**: Multi-tenant instance orchestration service
- **Port**: 3700
- **Stack**: Next.js 16, React 19, Prisma, BullMQ, Firebase Admin
- **Key Feature**: Docker orchestration via `dockerode` package
- **Extras**: Stripe integration for billing (`stripe@^17.7.0`)
- **Use Case**: Provisions and manages separate service desk instances per tenant

### Org Lookup Service (`apps/org-lookup/`)
- **Purpose**: Tenant resolution by subdomain/domain
- **Port**: 3600
- **Stack**: Next.js 15, React 19, Prisma (lighter dependencies than main app)
- **Use Case**: Routes incoming requests to the correct tenant backend
- **Public Endpoint**: Unauthenticated lookup for mobile app and subdomain routing

### Cloudflare Worker Router (`cloudflare-worker-router.js`)
- Routes subdomain requests (e.g., `customer1.servicedesk.example.com`) to correct tenant backends
- Used in conjunction with org-lookup service

---

## 15. End-User Portal & Mobile Routes

### Portal (End-User Self-Service)
Located at `/portal/` with a simplified sidebar. End users are auto-redirected here by middleware.

| Path | Description |
|------|-------------|
| `/portal` | Portal home with stats, quick actions |
| `/portal/tickets` | My service requests list |
| `/portal/tickets/new` | Submit a new request (simplified form) |
| `/portal/tickets/[id]` | View request status, add comments |
| `/portal/knowledge` | Browse published articles |
| `/portal/knowledge/[id]` | Read article |
| `/portal/assets` | My assigned assets |
| `/portal/profile` | Profile preferences |

### Mobile Deep Link Routes
The React Native app handles deep links under the `servicedesk://` scheme (and HTTPS universal/app links). Navigation is handled by React Navigation; these are the route names resolved from incoming push notification payloads:

| Screen Name | Deep Link | Description |
|-------------|-----------|-------------|
| `Dashboard` | `servicedesk://dashboard` | Home dashboard |
| `TicketList` | `servicedesk://tickets` | All tickets |
| `TicketDetail` | `servicedesk://tickets/:id` | Specific ticket (from push notification) |
| `TicketCreate` | `servicedesk://tickets/new` | New ticket form |
| `KnowledgeList` | `servicedesk://knowledge` | KB browse |
| `KnowledgeDetail` | `servicedesk://knowledge/:id` | Specific article |
| `AssetList` | `servicedesk://assets` | Asset list |
| `Notifications` | `servicedesk://notifications` | Notification history |
| `Profile` | `servicedesk://profile` | Profile & push preferences |

### Middleware Routing Logic (`middleware.ts`)
- Protects all routes except `/login`, external API routes, OPTIONS
- **Role-based routing**: End-users → `/portal`, Staff → `/dashboard`
- **Subdomain support**: MSP multi-tenancy via `X-Forwarded-Host`
- **CORS handling**: For external API endpoints and mobile app requests
- Note: Mobile User-Agent redirect to `/mobile` is removed — mobile clients now use the native React Native app and call the `/api/v1/` REST endpoints directly

---

## 16. Testing

### Playwright E2E Tests
Located in `apps/web/tests/` (13 test files) + 5 root-level tests:

| Test File | What It Tests |
|-----------|---------------|
| `application-add-new.spec.ts` | Create new application with validation |
| `application-edit.spec.ts` | Edit existing applications |
| `application-form.spec.ts` | Application form fields/dropdowns |
| `asset-ticket-add-new.spec.ts` | Create asset-related tickets |
| `comprehensive-app-test.spec.ts` | Full application workflow |
| `debug-worker-api.spec.ts` | Background worker API endpoints |
| `debug-worker-logs-sse.spec.ts` | Server-Sent Events for worker logs |
| `debug-worker-status.spec.ts` | Worker status endpoint |
| `email-template-recipient-type.spec.ts` | Email template recipient types |
| `queue-assignment.spec.ts` | Queue assignment functionality |
| `verify-email-fix.spec.ts` | Email system fixes |
| `worker-logs-test.spec.ts` | Background worker logging |
| `complete-email-test.spec.ts` | Email account form (root) |

- **Base URL**: `http://localhost:3500`
- **Test credentials**: `admin@msp.local` / `Admin123!`
- **No Playwright config file** - runs with defaults (headless, Chromium)
- **Vitest installed** (`vitest@^4.0.8`) but **no unit tests written**

### Mobile Testing (Planned)
- **Unit**: Jest + React Native Testing Library (`@testing-library/react-native`)
- **E2E**: Detox for iOS and Android end-to-end flows
- **Push Notifications**: Manual device testing via EAS build `preview` profile + Expo push notification tool

---

## 17. Existing Documentation

The project has extensive planning documents:

| File | Size | Purpose |
|------|------|---------|
| `README.md` | 7 KB | Project overview, quick start |
| `CLAUDE.md` | 11 KB | Claude Code instructions |
| `PROGRESS_TRACKER.md` | 19 KB | Development progress (9 phases) |
| `SETUP_INSTRUCTIONS.md` | 4 KB | Environment setup |
| `QUICKSTART.md` | 14 KB | 15-minute quick start |
| `DEPLOYMENT.md` | 11 KB | Production deployment |
| `BUILD_GUIDE.md` | 13 KB | Build instructions |
| `COMPLETE_BUILD_GUIDE.md` | 54 KB | Comprehensive build guide |
| `IMPLEMENTATION_PLAN.md` | 22 KB | 9-phase development roadmap |
| `DATABASE_SCHEMA.md` | 57 KB | Schema documentation |
| `API_SPECIFICATION.md` | 31 KB | REST API endpoint docs |
| `FEATURE_BREAKDOWN.md` | 25 KB | Component-level breakdown |
| `AGENT_SPECIFICATION.md` | 35 KB | .NET agent implementation |
| `TASK_ORIENTED_BUILD_GUIDE.md` | 48 KB | Task-based build approach |
| `EMAIL_SYSTEM_IMPLEMENTATION.md` | 25 KB | Email integration details |
| `MULTI_TENANT_ROUTING.md` | 5 KB | Multi-tenant architecture |
| `SLA_TIMER_BADGES_DOCUMENTATION.md` | 12 KB | SLA implementation |
| `SESSION_SUMMARY.md` | 13 KB | Session notes |
| `CMDB_SPECIFICATION.md` | *(planned)* | CMDB data model & discovery logic |
| `MOBILE_SPECIFICATION.md` | *(planned)* | React Native app build guide |
| `OWNER_ADMIN_SPECIFICATION.md` | *(planned)* | Owner admin app architecture, auth, billing integration |
| `SAAS_BILLING_SPECIFICATION.md` | *(planned)* | Subscription tiers, plan enforcement, Stripe integration, trial flow |
| 14x `msp_design_*.md` | Various | MSP design specifications |

---

## 18. Feature Inventory

### Fully Implemented (>80%)
1. **Project Foundation** - Next.js setup, Prisma, Docker, shadcn/ui
2. **Authentication** - Login, sessions, JWT, credentials auth
3. **Multi-Tenancy** - Tenant isolation, tenant-scoped queries
4. **Ticket CRUD** - Create, list, view, update, delete with filters
5. **Ticket Comments & Attachments** - Full comment/file support
6. **Ticket Activity/Audit Trail** - All changes logged
7. **SLA Management** - Configuration, monitoring, breach alerts
8. **Knowledge Base** - Articles with rich text, search, voting, ticket linking
9. **Change Management** - CRUD with approval workflow
10. **Email Configuration** - SMTP/IMAP/POP3 accounts with encryption
11. **Email-to-Ticket** - Automated ticket creation from emails
12. **Email Templates** - Customizable HTML templates with variables
13. **Background Workers** - SLA monitoring, email notifications, email polling
14. **Agent Infrastructure** - Enrollment tokens, heartbeat, inventory ingestion (Windows + Linux)
15. **Agent Management UI** - List, detail, suspend, delete, auto-refresh
16. **Push Notifications (Android)** - FCM integration, device registration
17. **API Key Management** - External API access with rate limiting
18. **Webhook System** - Event-driven webhooks with delivery tracking
19. **Application Portfolio** - Full CRUD with dependencies, documents, assets
20. **CAB Meetings** - Meeting management with RSVP, iCal, invitations
21. **Settings Management** - All entity types have settings pages
22. **Notification Center** - In-app notifications with read/unread

### Partially Implemented (40-80%)
1. **Change Calendar** - Basic calendar view exists, needs collision detection UI
2. **Dashboard** - Basic stats shown, needs charts (Recharts)
3. **Reports** - Report generation API exists, needs builder UI
4. **Asset Management** - Schema + basic CRUD, needs bulk import, QR codes
5. **Mobile App (Android)** - Capacitor WebView build exists; migration to React Native in progress
6. **CMDB** - Data model and agent CMDB payload defined; UI and reconciliation worker in progress
7. **Stripe Billing (Instance Manager)** - Stripe is wired into the Instance Manager; needs to be unified with subscription enforcement in the main app

### Not Yet Implemented (<40%)
1. **Owner Admin Application** - Not yet built; data models defined, architecture specified in Section 12
2. **Subscription Plan Enforcement** - `plan` and `maxUsers` fields exist on `Tenant` but no `planGate` middleware enforces limits at the API layer
3. **Trial Flow** - No trial expiry, dunning emails, or paywall page
4. **Self-Service Stripe Billing Portal** - No customer-facing billing portal or `/api/v1/billing/portal-session` endpoint
5. **Tenant Provisioning Automation** - Manual process; no signup → provision → welcome email flow
6. **Metrics Collection** - Schema exists, no agent implementation
7. **Alerting Engine** - Configuration exists, no evaluation engine
8. **End-User Portal** - Separate simplified UI for end users
9. **Report Builder** - Visual report construction interface
10. **Performance Dashboards** - CPU/memory/disk charts
11. **iOS Mobile App** - React Native iOS target configured, EAS build profile ready; APNs credentials and TestFlight pipeline pending
12. **macOS Agent Support** - macOS collector classes defined; launchd packaging and Homebrew tap pending
13. **CMDB Relationship Map** - ReactFlow visualization not yet built
14. **CMDB Bulk Import** - Import wizard UI not yet built
15. **OAuth/SSO** - Azure AD, Okta, Google providers
16. **Rate Limiting** - Code exists but not applied to all endpoints
17. **Security Hardening** - CAPTCHA, CSP headers, brute force protection
18. **CI/CD Pipeline** - No GitHub Actions configured

---

## 19. Known Gaps & Incomplete Features

### Critical for Production
- [ ] No password reset flow
- [ ] No OAuth2/SSO integration
- [ ] No rate limiting on public endpoints
- [ ] No CAPTCHA on login
- [ ] No security headers (CSP, HSTS)
- [ ] No brute force protection
- [ ] No CI/CD pipeline
- [ ] Minimal test coverage (1 E2E test exists)
- [ ] No error boundaries in React
- [ ] **No plan enforcement** — `plan`/`maxUsers` fields exist but no middleware blocks over-limit usage
- [ ] **No trial expiry flow** — tenants can use the app indefinitely without paying
- [ ] **Owner Admin app does not exist** — required before first paying customer

### Important but Non-Blocking
- [ ] No ticket status transition validation (any status can go to any status)
- [ ] No ticket escalation logic
- [ ] No change lifecycle state machine enforcement
- [ ] No configurable approval rules per tenant
- [ ] No article version history
- [ ] No article publishing workflow
- [ ] No end-user portal (simplified UI)
- [ ] No report builder interface
- [ ] No chart/visualization library integrated
- [ ] No asset bulk import (CSV)
- [ ] No dark mode toggle
- [ ] No theme customization per tenant
- [ ] iOS mobile build not yet submitted to App Store / TestFlight
- [ ] APNs credentials (.p8 key, Team ID) not yet configured
- [ ] macOS agent launchd installer and .pkg packaging not yet built
- [ ] CMDB relationship map (ReactFlow) not yet built
- [ ] CMDB bulk import wizard UI not yet built
- [ ] CMDB `CMDB_SPECIFICATION.md` documentation not yet written
- [ ] No self-service billing portal (Stripe Customer Portal integration)
- [ ] No tenant provisioning automation (signup → provision → welcome email)
- [ ] No dunning email workflow for failed payments or trial expiry
- [ ] No maintenance broadcast system (owner → all tenants)
- [ ] No tenant impersonation capability for support triage

### Technical Debt
- [ ] N+1 queries likely in many list endpoints (no explicit `include` optimization audit)
- [ ] No Redis caching for frequently accessed data
- [ ] No code splitting optimization
- [ ] Missing database indexes (no audit performed)
- [ ] Some duplicate enum values in schema (`DocumentType` has both TECHNICAL_SPEC and TECHNICAL_DOC, both API_DOCS and API_DOC)
- [ ] Email passwords stored with AES encryption (encryption key management unclear)
- [ ] No database migration strategy for production
- [ ] `PROGRESS_TRACKER.md` last updated 2025-01-22 (14+ months stale)
- [ ] Capacitor Android project still exists in `apps/web/android/` — should be removed once React Native app is complete
- [ ] Stripe integration currently lives in `apps/instance-manager/` — needs to be unified with `apps/owner-admin/` billing layer

---

## 20. Improvement Opportunities for Rewrite

### Architecture
1. **Separate API from Frontend**: Consider a standalone API server (Hono/Fastify) separate from the Next.js frontend for better scaling, clearer boundaries, and independent deployment
2. **Event-Driven Architecture**: Replace direct function calls for side effects (notifications, webhooks, audit logs) with an event bus pattern — this is especially important now that push notifications and CMDB reconciliation add more side-effect consumers
3. **Service Layer**: Formalize business logic into a proper service layer instead of having it inline in API routes
4. **Repository Pattern**: Abstract Prisma calls behind repositories for testability and potential ORM migration
5. **Better State Machine**: Use XState or similar for ticket/change status transitions with enforced rules

### Data Model
6. **Normalize Agent Data**: The Asset model has agent-collected fields mixed with manual asset fields - separate these concerns (CMDB CIs are now the canonical home for agent-collected endpoint data)
7. **Clean Up Enums**: Remove duplicate enum values, consolidate similar enums
8. **Soft Delete Consistency**: Some entities use soft delete (isActive), others are hard-deleted - standardize
9. **Audit Trail**: Unify TicketActivity, ChangeActivity, ApplicationActivity, AuditLog, and CmdbChangeRecord into a single polymorphic activity stream
10. **Custom Fields**: Extend the customFields JSON approach or move to a proper EAV (Entity-Attribute-Value) pattern (CMDB already uses `attributesJson` as a stopgap)

### Security
11. **Password Reset**: Implement proper token-based password reset flow
12. **OAuth2/SSO**: Add Azure AD, Okta, Google authentication (Enterprise plan gate)
13. **MFA**: Two-factor authentication support
14. **API Rate Limiting**: Apply consistently across all endpoints
15. **Input Validation**: Centralized Zod schemas for all API inputs (currently ad-hoc)
16. **Secrets Management**: Proper encryption key management (not env vars) — especially important for APNs `.p8` key storage and `OWNER_JWT_SECRET`

### Frontend
17. **Server Components**: Maximize Next.js server components for better performance
18. **Optimistic Updates**: Use TanStack Query mutations with optimistic UI
19. **Error Boundaries**: Add React error boundaries for graceful failure
20. **Loading States**: Skeleton screens and loading indicators everywhere
21. **Accessibility**: WCAG 2.1 compliance audit
22. **Internationalization**: Add i18n support (currently hardcoded English)
23. **Trial / Paywall UI**: Add trial expiry banner, upgrade prompts, and a graceful suspension page in the main app

### Testing
24. **Unit Tests**: Add Vitest tests for all services and utilities
25. **E2E Tests**: Playwright tests for all critical user flows
26. **API Tests**: Integration tests for all API endpoints
27. **Load Testing**: k6 or Artillery performance testing
28. **Mobile Unit Tests**: Jest + React Native Testing Library for screen components
29. **Mobile E2E Tests**: Detox tests for critical mobile flows (login, create ticket, push notification tap)
30. **Owner Admin Tests**: Separate Playwright suite for admin portal (tenant CRUD, billing flows, impersonation)

### DevOps
31. **CI/CD**: GitHub Actions for lint, test, build, deploy — include EAS Build triggers for iOS and Android
32. **Database Migrations**: Proper migration strategy with rollback capability
33. **Monitoring**: Sentry for errors, OpenTelemetry for tracing — include React Native Sentry SDK for mobile crash reporting
34. **Container Orchestration**: Kubernetes manifests or Docker Swarm
35. **Backup Strategy**: Automated database and file storage backups

### Mobile
36. **Offline Support**: Local-first architecture for mobile with background sync — ticket list and KB articles cached via TanStack Query; full offline creation queue is a future milestone
37. **Biometric Auth**: Face ID / Touch ID / fingerprint unlock using `expo-local-authentication`
38. **Push Notification Analytics**: Track delivery rates, open rates per notification type via FCM/APNs delivery receipts
39. **App Store Deployment**: Configure App Store Connect (iOS) and Google Play Console (Android) for production distribution via EAS Submit

### CMDB
40. **Graph Database Option**: Evaluate Neo4j or a PostgreSQL recursive CTE approach for deep CI relationship traversal at scale
41. **ITIL Alignment**: Map CI types and relationship types to ITIL 4 service configuration standards
42. **Discovery Completeness**: Add network sweep / SNMP-based discovery (separate from the endpoint agent) for network devices, switches, and printers
43. **Change Impact Gating**: Block change approvals if affected CIs are flagged as critical without explicit acknowledgment

### SaaS / Monetization
44. **Plan Enforcement First**: `planGate` middleware is the single most important piece to build before taking any paying customers — without it, plan tiers are fictional
45. **Feature Flag Service**: Replace hardcoded plan checks with a proper feature flag service (LaunchDarkly or a simple in-house Redis-backed config) so plan features can be toggled without deploys
46. **Usage Metering**: Instrument ticket creation, agent registration, and storage consumption to feed accurate real-time usage data into `TenantUsageSnapshot`
47. **Stripe Unification**: Consolidate the existing Stripe integration in `apps/instance-manager/` into the new `apps/owner-admin/` billing layer — two Stripe integrations will cause billing discrepancies
48. **Self-Service Signup Flow**: Build a public signup page (`/signup`) that handles new customer onboarding end-to-end without owner intervention (long-term goal)
49. **Annual Billing Discount**: Offer 2 months free on annual plans (standard SaaS practice) — Stripe supports this natively via coupon codes
50. **Customer Success Tooling**: Add health score per tenant in the owner admin (based on last login, ticket volume, agent count) to identify at-risk accounts before they churn

---

## Appendix A: Key Dependency Versions (apps/web)

| Package | Version |
|---------|---------|
| next | 16.0.1 |
| react / react-dom | 19.2.0 |
| @prisma/client | ^6.19.0 |
| next-auth | 5.0.0-beta.30 |
| @tanstack/react-query | ^5.90.7 |
| react-hook-form | ^7.66.0 |
| zod | ^4.1.12 |
| bullmq | ^5.63.0 |
| ioredis | ^5.8.2 |
| nodemailer | ^7.0.10 |
| @mdi/react | ^1.6.1 |
| @mdi/js | ^7.4.47 |
| firebase-admin | ^13.6.0 |
| @playwright/test | ^1.56.1 |
| vitest | ^4.0.8 |
| tailwindcss | ^4 |
| typescript | ^5 |
| recharts | (installed) |
| reactflow | (installed) |

## Appendix B: Key Dependency Versions (apps/mobile) *(NEW)*

| Package | Version |
|---------|---------|
| expo | ~52.0.0 |
| react-native | 0.76.x (via Expo) |
| @react-navigation/native | ^7.0.0 |
| @react-navigation/bottom-tabs | ^7.0.0 |
| @react-navigation/native-stack | ^7.0.0 |
| expo-notifications | ~0.29.0 |
| expo-secure-store | ~13.0.0 |
| expo-camera | ~15.0.0 |
| expo-barcode-scanner | ~13.0.0 |
| expo-image-picker | ~15.0.0 |
| expo-local-authentication | ~14.0.0 |
| react-native-vector-icons | ^10.0.0 |
| @mdi/js | ^7.4.47 |
| @tanstack/react-query | ^5.0.0 |
| zustand | ^4.5.0 |
| axios | ^1.7.0 |
| react-native-paper | ^5.12.0 |
| @testing-library/react-native | ^12.0.0 |

## Appendix C: Key Dependency Versions (apps/owner-admin)

| Package | Version |
|---------|---------|
| next | 16.0.1 |
| react / react-dom | 19.2.0 |
| @prisma/client | ^6.19.0 |
| @mdi/react | ^1.6.1 |
| @mdi/js | ^7.4.47 |
| stripe | ^17.7.0 |
| otplib | ^12.0.1 |
| bcrypt | ^5.1.0 |
| zod | ^4.1.12 |
| @tanstack/react-query | ^5.90.7 |
| recharts | (installed) |
| tailwindcss | ^4 |
| typescript | ^5 |
| @playwright/test | ^1.56.1 |

## Appendix D: File Counts

| Category | Count |
|----------|-------|
| API Route Files (web) | ~115 |
| API Route Files (owner-admin) | ~25 |
| Dashboard Pages (web) | 55 |
| Admin Pages (owner-admin) | ~12 |
| React Components (web) | 90+ |
| React Components (owner-admin) | ~20 |
| Library/Service Files (web) | 34 |
| Library/Service Files (owner-admin) | ~6 |
| Prisma Models | 55+ |
| Prisma Enums | 37+ |
| Database Migrations | Multiple |
| Total TypeScript Files (web) | ~270+ |
| Total TypeScript Files (owner-admin) | ~60+ |
| Mobile Screen Files | ~15 |
| Mobile Component Files | ~20 |
| Agent C# Projects | 10 |
