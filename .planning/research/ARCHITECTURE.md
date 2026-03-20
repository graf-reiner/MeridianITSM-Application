# Architecture Research

**Domain:** Multi-tenant SaaS ITSM platform (MSP-focused)
**Researched:** 2026-03-19
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                        │
├──────────────────┬──────────────────┬──────────────────┬───────────────────────┤
│   Web Frontend   │   Mobile App     │  Owner Admin     │   .NET Inv. Agent     │
│   (Next.js)      │ (React Native/   │  Portal          │  (Windows/Linux/      │
│   Port 3000      │   Expo)          │  (Next.js)       │   macOS)              │
│                  │   iOS + Android  │  Port 3002       │                       │
└────────┬─────────┴────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                  │                     │
         │  REST/JSON       │  REST/JSON       │  Internal only      │  REST/JSON
         │                  │                  │  (separate JWT)     │  (API key auth)
         ▼                  ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                           │
├──────────────────────────────────────┬──────────────────────────────────────────┤
│          Tenant API Server           │         Owner API Server                 │
│          (Hono/Fastify)              │         (separate process or             │
│          Port 4000                   │          namespace, same codebase)       │
│                                      │          Port 4001                       │
│  • JWT auth (tenant JWT secret)      │  • Separate JWT secret                  │
│  • tenantId middleware (every req)   │  • No public exposure                   │
│  • RBAC: admin/msp_admin/agent/user  │  • Tenant CRUD, billing, impersonation  │
│  • planGate middleware               │  • Impersonation issues short-lived JWT  │
│  • Rate limiting per tenant          │                                          │
└──────────────────────┬───────────────┴──────────────────────────────────────────┘
                       │
         ┌─────────────┴────────────┐
         ▼                          ▼
┌─────────────────┐      ┌──────────────────────────────────┐
│  Worker Process │      │        Service Layer              │
│  (BullMQ)       │      │  (shared business logic pkg)      │
│                 │      │                                   │
│ • SLA monitor   │      │  Ticket, Change, KB, Asset,       │
│ • Email polling │      │  CMDB, SLA, Notification,         │
│ • Notifications │      │  Billing, Webhook services        │
│ • CMDB reconcil │      └──────────────────────────────────┘
│ • Webhook deliv │
│ • Report gen    │
│ • Trial/dunning │
└──────────┬──────┘
           │
┌──────────┴──────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                          │
├──────────────┬───────────────┬───────────────────────────┬──────────────────────┤
│  PostgreSQL   │   Redis       │         MinIO             │  External Services   │
│  (primary DB) │  (BullMQ      │   (file storage:          │                      │
│               │   queue +     │    attachments, reports,  │  • Stripe (billing)  │
│  All tables   │   session     │    agent packages)        │  • FCM (Android push)│
│  have tenantId│   cache)      │                           │  • APNs (iOS push)   │
│               │               │                           │  • SMTP/IMAP         │
└───────────────┴───────────────┴───────────────────────────┴──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Key Constraint |
|-----------|---------------|----------------|
| Next.js Web Frontend | Technician/admin UI, self-service portal | No direct DB access — API-only |
| React Native/Expo Mobile | Ticket management, notifications on-the-go | API-key or JWT per user, same API as web |
| Owner Admin Portal | Tenant provisioning, billing, plan changes, impersonation | Separate Next.js app, separate JWT secret, private network only |
| Tenant API Server | All business logic exposed over REST, enforces tenant isolation | tenantId middleware runs before every route handler |
| Owner API Server | Tenant CRUD, Stripe webhooks, impersonation token issuance | Never shares JWT secret with tenant API |
| BullMQ Worker Process | Background jobs: SLA timers, email polling, webhook delivery, CMDB sync, push notifications | Runs in separate process; reads tenantId from job payload |
| .NET Inventory Agent | Collects hardware/software inventory, posts to API on schedule | Authenticates with per-device API key scoped to tenant |
| PostgreSQL | Source of truth for all business data | Every table has `tenantId UUID NOT NULL`, no cross-tenant JOIN ever |
| Redis | BullMQ queue backing store + optional session/rate-limit cache | Shared instance; queue names can be prefixed per environment |
| MinIO | Object storage for attachments, exported reports, agent package distribution | Bucket path includes tenantId prefix for isolation |

## Recommended Project Structure

```
meridian-itsm/                     # monorepo root
├── apps/
│   ├── web/                       # Next.js 15 App Router (technician + end-user UI)
│   │   ├── app/
│   │   │   ├── (auth)/            # login, password reset
│   │   │   ├── (portal)/          # end-user self-service
│   │   │   └── (dashboard)/       # technician/admin views
│   │   └── package.json
│   ├── api/                       # Hono or Fastify API server
│   │   ├── src/
│   │   │   ├── middleware/        # tenantId, auth, planGate, rateLimiter
│   │   │   ├── routes/            # grouped by domain (tickets, assets, cmdb...)
│   │   │   ├── services/          # business logic (import from @meridian/core)
│   │   │   └── workers/           # BullMQ queue definitions + job handlers
│   │   └── package.json
│   ├── admin/                     # Owner admin portal (isolated Next.js app)
│   │   ├── app/
│   │   │   ├── (auth)/            # separate login flow
│   │   │   └── (admin)/           # tenant list, billing, impersonation
│   │   └── package.json
│   └── mobile/                    # React Native / Expo
│       ├── app/                   # Expo Router file-based navigation
│       ├── components/
│       └── package.json
├── packages/
│   ├── core/                      # Shared business logic (services, domain types)
│   │   ├── src/
│   │   │   ├── services/          # TicketService, SLAService, etc. — pure TS
│   │   │   └── types/             # Domain types (Ticket, Asset, Tenant...)
│   │   └── package.json
│   ├── db/                        # Prisma schema + generated client + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── package.json
│   ├── shared-types/              # Zod schemas + inferred TS types (API contracts)
│   │   └── src/
│   │       ├── ticket.ts
│   │       ├── asset.ts
│   │       └── ...
│   ├── ui/                        # Shared React components (web + admin, NOT mobile)
│   │   └── src/
│   └── config/                    # ESLint, TypeScript, Prettier configs
│       ├── eslint/
│       └── typescript/
├── agent/                         # .NET inventory agent (separate from JS monorepo)
│   ├── MeridianAgent.sln
│   └── src/
├── docker-compose.yml             # Dev services: Postgres, Redis, MinIO, MailHog
├── turbo.json
└── pnpm-workspace.yaml
```

### Structure Rationale

- **apps/api — separate from apps/web:** Enables independent deployment and scaling. Mobile and .NET agent consume the same API as the web frontend, so it must be a standalone server, not Next.js API routes.
- **apps/admin — fully isolated app:** Separate Next.js process with its own env vars (different `ADMIN_JWT_SECRET`). Never co-deployed with the public web app. Ensures owner tools cannot be reached via web app routing.
- **packages/db — shared Prisma client:** Both `api` and background workers import from one place. Single source of truth for schema and migrations. Migrations run once, not per-app.
- **packages/shared-types — Zod schemas:** Single definition of API request/response shapes. API validates with Zod. Web, mobile, and admin import the same types for TypeScript safety without coupling to the ORM.
- **packages/core — business logic separate from transport:** Services in `core` receive validated input, perform queries through the Prisma client, and return typed results. Route handlers in `api` are thin orchestrators. Workers call the same service functions — no duplication.
- **agent/ — outside JS monorepo:** .NET project is a separate build system. It communicates with the API exclusively over HTTP. Keep it adjacent to the monorepo but not inside it.

## Architectural Patterns

### Pattern 1: Tenant Middleware — Mandatory First Guard

**What:** Every API request to the tenant server must resolve `tenantId` before any route handler runs. The middleware extracts the tenant from the JWT claim, validates it exists and is active, and attaches it to the request context.

**When to use:** Every route on the tenant API server without exception. The only exemption is the `/auth/login` and `/auth/register` endpoints.

**Trade-offs:** Small overhead per request (one DB lookup or cache hit). Non-negotiable for correctness — skipping it causes cross-tenant data leaks.

**Example:**
```typescript
// apps/api/src/middleware/tenant.ts
export const tenantMiddleware = async (c: Context, next: Next) => {
  const tenantId = c.get('jwtPayload')?.tenantId;
  if (!tenantId) return c.json({ error: 'Unauthorized' }, 401);

  const tenant = await tenantCache.get(tenantId) ??
    await db.tenant.findUnique({ where: { id: tenantId, status: 'ACTIVE' } });

  if (!tenant) return c.json({ error: 'Tenant not found or suspended' }, 403);
  c.set('tenant', tenant);
  return next();
};
```

### Pattern 2: Service Layer Receives tenantId Explicitly

**What:** Every service method takes `tenantId` as its first argument (or as part of a context object). The service always appends `WHERE tenantId = $1` to every query. No service method trusts caller-inferred tenant context.

**When to use:** Every database-touching function in `packages/core`. Applies equally to route handlers calling services and BullMQ workers calling services.

**Trade-offs:** Slightly more verbose function signatures. Eliminates entire class of horizontal privilege escalation bugs. TypeScript ensures callers cannot forget the argument.

**Example:**
```typescript
// packages/core/src/services/ticket.ts
export async function getTicket(
  db: PrismaClient,
  tenantId: string,
  ticketId: string
): Promise<Ticket | null> {
  return db.ticket.findFirst({
    where: { id: ticketId, tenantId },  // tenantId always explicit
  });
}
```

### Pattern 3: Owner Impersonation via Short-Lived JWT

**What:** The owner admin portal issues a time-limited JWT (15-minute TTL) that contains `{ sub: userId, tenantId, impersonatedBy: ownerUserId }`. The tenant API accepts this JWT but logs every action with `impersonatedBy`. The admin portal never directly reads tenant data — it routes through the tenant API just like the web app.

**When to use:** When an owner admin needs to debug a tenant's environment. Never for automated admin operations.

**Trade-offs:** Requires audit log on every impersonated request. Short TTL means re-issuance for long sessions. Worth the complexity to avoid a separate privileged DB path.

**Example:**
```typescript
// apps/api/src/middleware/auth.ts — impersonation audit
if (payload.impersonatedBy) {
  await auditLog.write({
    tenantId: payload.tenantId,
    actorId: payload.sub,
    impersonatedBy: payload.impersonatedBy,
    action: c.req.method + ' ' + c.req.path,
    timestamp: new Date(),
  });
}
```

### Pattern 4: BullMQ Workers Are Tenant-Aware

**What:** Every BullMQ job payload includes `tenantId`. Workers never process jobs without it. Named queues group by domain, not by tenant — one `sla-monitor` queue serves all tenants. Workers call the same service layer as route handlers, passing `tenantId` from the job data.

**When to use:** All background jobs: SLA breach detection, email polling, notification dispatch, webhook delivery, CMDB reconciliation, report generation.

**Trade-offs:** All tenants share the same Redis queue. A noisy tenant can starve others. Mitigation: BullMQ job priority + rate limiting per tenant at enqueue time.

**Example:**
```typescript
// apps/api/src/workers/sla-monitor.ts
slaQueue.process(async (job) => {
  const { tenantId, ticketId } = job.data;
  const breach = await SLAService.checkBreach(db, tenantId, ticketId);
  if (breach) {
    await notificationQueue.add('sla-breach', { tenantId, ticketId, breach });
  }
});
```

### Pattern 5: .NET Agent — API Key Auth, Push-Only

**What:** The .NET agent authenticates with a per-device, per-tenant API key stored in the agent config. The agent periodically collects inventory (hardware specs, installed software, running services) and POSTs a snapshot to `POST /api/v1/agents/inventory`. The API server validates the key, resolves `tenantId` from it, upserts the asset record, and queues a CMDB reconciliation job. The agent never polls for instructions — it only pushes data.

**When to use:** All agent-to-API communication. Simpler than bidirectional agent protocol for v1.

**Trade-offs:** No real-time remote commands in v1. Commands would require the agent to poll, which is deferred. Acceptable for asset discovery and CMDB use case.

## Data Flow

### Request Flow — Technician Creates a Ticket

```
Technician (web browser)
    │  POST /api/v1/tickets  { title, priority, assigneeId }
    ▼
Next.js Web App (apps/web)
    │  fetch() with Bearer JWT
    ▼
Tenant API Server (apps/api)
    │
    ├─ authMiddleware     → validates JWT, extracts userId + tenantId
    ├─ tenantMiddleware   → loads tenant, checks status=ACTIVE
    ├─ rbacMiddleware     → checks user role can CREATE_TICKET
    ├─ planGateMiddleware → checks ticket quota against subscription plan
    │
    ▼
    TicketService.create(db, tenantId, input)
    │  → INSERT ticket WHERE tenantId = $tenantId
    │  → INSERT sla_timer (first response deadline)
    │
    ├─ notificationQueue.add('ticket-created', { tenantId, ticketId, assigneeId })
    ▼
    HTTP 201 { ticket }
    ▼
Next.js Web App → renders updated ticket list
```

### Background Flow — SLA Breach Detection

```
BullMQ Scheduler (cron: every 60s)
    │  enqueue sla-check jobs for all active tenants
    ▼
SLA Worker
    │  job.data = { tenantId, ticketId }
    │
    ├─ SLAService.checkBreach(db, tenantId, ticketId)
    │    └─ SELECT sla_timers WHERE tenantId = $1 AND deadline < NOW()
    │
    ├─ if breach:
    │    ├─ notificationQueue.add('sla-breach', { tenantId, ... })
    │    └─ webhookQueue.add('event.sla.breached', { tenantId, ... })
    ▼
Notification Worker
    │  resolves FCM/APNs tokens for assignee
    │  sends push notification
    ▼
Webhook Worker
    │  resolves tenant webhook endpoints WHERE tenantId = $1 AND event matches
    │  POST to each endpoint with HMAC-SHA256 signature
    │  on failure: exponential backoff retry (max 5 attempts)
```

### Agent Data Flow — Inventory Push

```
.NET Inventory Agent (on managed device)
    │  Scheduled task: every 4 hours
    │  Collects: hardware specs, OS, software list, running services
    │
    │  POST /api/v1/agents/inventory
    │  Authorization: ApiKey <device-api-key>
    ▼
Tenant API Server
    │
    ├─ apiKeyMiddleware → resolves tenantId + deviceId from key
    ├─ validates payload (Zod schema)
    │
    ├─ AssetService.upsertFromAgent(db, tenantId, deviceId, inventory)
    │    └─ UPSERT asset + asset_properties WHERE tenantId = $1
    │
    └─ cmdbQueue.add('reconcile', { tenantId, assetId })
    ▼
CMDB Worker
    │  detects CI changes, updates relationships
    │  flags impact on linked incidents if CI degraded
```

### Owner Admin Flow — Tenant Provisioning

```
New customer signs up at /signup (web app public route)
    │
    ▼
Tenant API → /auth/register (unauthenticated)
    │  creates Tenant record (status=TRIAL)
    │  creates first admin User
    │  enqueues 'tenant-provisioned' job
    ▼
Worker → sends welcome email, sets trial expiry
    ▼
Owner Admin Portal (apps/admin, private)
    │  Owner views new tenant in dashboard
    │  Owner can: suspend, change plan, impersonate
    │
    │  POST /owner-api/tenants/:id/impersonate
    ▼
Owner API → issues short-lived JWT { sub: targetUserId, tenantId, impersonatedBy }
    ▼
Owner admin's browser redirects to web app with impersonation JWT
    │  all subsequent requests go through normal tenant API middleware
    │  audit log records impersonatedBy on every action
```

## Multi-Tenancy Isolation Pattern

### Approach: tenantId Column on Every Table (Chosen)

Every table in the schema carries `tenantId UUID NOT NULL REFERENCES tenants(id)`. Every query in every service appends `WHERE tenantId = $tenantId`. This is application-level isolation with a shared database.

**Why not PostgreSQL Row-Level Security (RLS):** RLS is a valid enhancement but adds session-variable management complexity with connection pooling (PgBouncer in transaction mode resets `SET LOCAL`). The chosen approach of explicit `tenantId` in every query is simpler, testable in isolation, and adequate for v1. RLS can be added as a defense-in-depth layer post-launch.

**Why not separate schema per tenant:** Schema-per-tenant doesn't scale past a few hundred tenants and makes migrations exponentially harder. Shared schema with tenantId is the standard MSP SaaS approach.

### Tenant Isolation Checklist Per Route

```
For every API route handler:
  [ ] tenantMiddleware ran before this handler
  [ ] service call passes tenantId explicitly
  [ ] no raw SQL without tenantId in WHERE
  [ ] file storage path includes tenantId prefix
  [ ] BullMQ job payload includes tenantId
  [ ] audit log includes tenantId
```

## Owner Admin Isolation

The owner portal is architecturally separate in three ways:

1. **Separate process:** `apps/admin` runs on a different port and is deployed to a private network not accessible from the public internet.
2. **Separate JWT secret:** `ADMIN_JWT_SECRET` env var is different from `TENANT_JWT_SECRET`. A tenant JWT cannot be used to authenticate against the owner API and vice versa.
3. **Separate auth flow:** The admin portal has its own login page that authenticates owner-level users (stored in a separate `owner_users` table, not in the tenant `users` table). Owner users have no `tenantId` — they exist outside the tenant data model.

The owner API does read tenant data (for the admin dashboard), but it always does so with explicit `tenantId` scoping — it never reads across all tenants without pagination and filtering.

## Component Build Order (Dependencies)

This order reflects what must exist before the next component can be built:

```
1. packages/db          → Prisma schema, migrations, shared client
       ↓
2. packages/shared-types → Zod schemas + TS types derived from domain
       ↓
3. packages/core        → Service layer consuming db + shared-types
       ↓
4. apps/api             → Route handlers + middleware consuming core
   (tenant API)           Verifiable with HTTP tests immediately
       ↓
5. apps/web             → Next.js frontend consuming tenant API
       ↓
6. apps/api (workers)   → BullMQ workers (SLA, email, webhooks)
       ↓
7. apps/admin           → Owner portal consuming owner API routes
       ↓
8. apps/mobile          → React Native consuming same tenant API as web
       ↓
9. agent/               → .NET agent consuming agent-specific API routes
```

**Rationale for this order:**
- The database schema must stabilize before services, because services are shaped by data models.
- Shared types must precede both the API and frontends so the contract is defined once.
- The core service layer is the shared dependency — both the API server and background workers call it.
- The API server must be functional before any client (web, mobile, admin) can be built.
- Workers can be added incrementally alongside the API rather than as a separate phase.
- The owner admin portal has fewer features than the main app and can be built after core ITSM flows.
- Mobile is lower priority than web for the first paying customer.
- The .NET agent is independent and can be developed in parallel once API contracts for `/agents/inventory` are defined.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 tenants | Single API process, single worker process, Docker Compose in prod is fine |
| 100-1K tenants | Add horizontal API replicas behind load balancer; separate worker fleet by job type (SLA workers vs. notification workers) |
| 1K-10K tenants | Read replicas for PostgreSQL; BullMQ job priority to prevent noisy-tenant starvation; connection pooler (PgBouncer) between API and Postgres |
| 10K+ tenants | Evaluate per-module microservice extraction; consider shard keys at DB level; this is not a v1 concern |

### Scaling Priorities

1. **First bottleneck — database connections:** Node.js API servers with many replicas exhaust PostgreSQL's connection limit quickly. Add PgBouncer in transaction mode early (around 5+ API replicas).
2. **Second bottleneck — BullMQ worker throughput:** SLA timers and email polling run on cron schedules. At high tenant counts, a single worker process cannot process all jobs within the window. Horizontally scale workers; BullMQ handles distributed locking via Redis.
3. **Third bottleneck — storage costs:** Agent inventory payloads and file attachments grow linearly with tenants. MinIO bucket lifecycle policies + compression for old inventory snapshots.

## Anti-Patterns

### Anti-Pattern 1: API Routes in Next.js

**What people do:** Use Next.js `app/api/` route handlers for backend logic to avoid running a separate server.

**Why it's wrong:** Mobile app and .NET agent cannot share Next.js API routes cleanly. Next.js route handlers run in the Edge runtime with constraints, serverless scaling is different from a persistent server, and background workers cannot import Next.js-bundled code. The architectural decision is already made: separate API server.

**Do this instead:** All business logic lives in `apps/api` (Hono/Fastify). Next.js only serves React components. Next.js server components fetch from the API using the internal network address.

### Anti-Pattern 2: tenantId Inferred from Session, Not Passed Explicitly

**What people do:** Store `tenantId` in a global request context variable and have service functions read it implicitly without taking it as a parameter.

**Why it's wrong:** Implicit context is invisible in function signatures. A developer can call a service function from a background worker without setting the context, silently querying all tenants' data. TypeScript won't catch it.

**Do this instead:** Every service function takes `tenantId: string` as an explicit first parameter. Workers pass `job.data.tenantId` to service calls.

### Anti-Pattern 3: Shared JWT Secret Between Tenant API and Owner API

**What people do:** Use one `JWT_SECRET` for simplicity. Issue owner tokens and tenant tokens from the same secret.

**Why it's wrong:** A compromised tenant JWT secret exposes owner admin capabilities. An owner token leaked to a tenant context can escalate privileges.

**Do this instead:** Two secrets, two middleware chains, two separate token validation paths. The owner API rejects all tokens signed with the tenant secret.

### Anti-Pattern 4: BullMQ Jobs Without tenantId

**What people do:** Enqueue a job with just an entity ID (e.g., `{ ticketId }`), then fetch the ticket in the worker assuming the DB query will just work.

**Why it's wrong:** The worker must pass `tenantId` to service functions. Without it in the job payload, the worker would have to look it up — adding a DB round-trip — or worse, query without it. A bug in that lookup could process the wrong tenant's data.

**Do this instead:** Job payloads always include `tenantId`. Treat it as a required field on every job schema.

### Anti-Pattern 5: Owner Portal in Same Next.js App

**What people do:** Add an `/admin` route to the main web app, protected by role check.

**Why it's wrong:** The owner portal shares the process, the JWT secret, and the deployment with the tenant-facing app. A routing bug or auth middleware misconfiguration could expose admin routes to tenants. Defense in depth requires physical separation.

**Do this instead:** Separate `apps/admin` Next.js app, separate deployment, private network only, separate JWT secret.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Stripe | Webhook receiver in `apps/api` + Stripe SDK for subscription management | Store `stripeCustomerId` and `stripeSubscriptionId` on Tenant; planGate middleware reads plan from DB, not Stripe in real-time |
| FCM (Android push) | Worker calls Firebase Admin SDK with device token | Tokens stored per user device record with tenantId |
| APNs (iOS push) | Worker calls APNs HTTP/2 API via node-apn or firebase-admin | Same pattern as FCM; firebase-admin handles both |
| SMTP (outbound email) | Nodemailer from worker process | Queue email jobs; never send inline from API request |
| IMAP/POP3 (email-to-ticket) | Worker polls mailbox every N minutes, parses headers, creates tickets | Per-tenant mailbox config; use imapflow for IMAP |
| MinIO (object storage) | S3-compatible SDK from API and worker | Bucket path: `{tenantId}/{resource}/{filename}` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| apps/web → apps/api | HTTP REST, Bearer JWT | Next.js server components use internal URL; client components use public URL |
| apps/mobile → apps/api | HTTP REST, Bearer JWT | Same API, same auth flow; no mobile-specific API version needed for v1 |
| apps/admin → Owner API | HTTP REST, separate Bearer JWT | Private network; ADMIN_JWT_SECRET |
| apps/api → BullMQ workers | Redis queue via BullMQ | Workers in same process or separate process; same codebase |
| BullMQ workers → packages/core | Direct import (same monorepo) | No HTTP boundary; services are just TypeScript functions |
| agent/ → apps/api | HTTP REST, API key header | POST /api/v1/agents/inventory; no WS in v1 |
| apps/api → packages/db | Prisma Client (direct import) | Connection pool managed by Prisma; add PgBouncer when scaling |

## Sources

- [WorkOS: Developer's Guide to SaaS Multi-Tenant Architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [AWS: Multi-Tenant Data Isolation with PostgreSQL Row Level Security](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [BullMQ Architecture Documentation](https://docs.bullmq.io/guide/architecture)
- [Turborepo 2025 Monorepo: Next.js + React Native + Node API](https://medium.com/@TheblogStacker/2025-monorepo-that-actually-scales-turborepo-pnpm-for-next-js-ab4492fbde2a)
- [Hono + Turborepo Integration Discussion](https://github.com/orgs/honojs/discussions/2683)
- [Building Secure Impersonation for Multi-Tenant Enterprise Apps](https://medium.com/@codebyzarana/building-a-secure-user-impersonation-feature-for-multi-tenant-enterprise-applications-21e79476240c)
- [Azure: Architectural Approaches for Identity in Multitenant Solutions](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/identity)
- [Logto: Multi-Tenancy Implementation with PostgreSQL](https://blog.logto.io/implement-multi-tenancy)
- [Webhook Delivery System Architecture](https://dev.to/restdbjones/building-a-production-ready-webhook-delivery-system-in-5-minutes-5bhe)

---
*Architecture research for: Multi-tenant SaaS ITSM (MeridianITSM)*
*Researched: 2026-03-19*
