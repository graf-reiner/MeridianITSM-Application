# Project Research Summary

**Project:** MeridianITSM
**Domain:** Multi-tenant SaaS ITSM platform for Managed Service Providers (MSPs)
**Researched:** 2026-03-19
**Confidence:** HIGH (stack, architecture, pitfalls), MEDIUM (competitor features)

## Executive Summary

MeridianITSM is a purpose-built, multi-tenant SaaS ITSM platform targeting MSPs — not a generic helpdesk or internal IT tool. The research consistently confirms that MSP-focused ITSM is a crowded market (Freshservice, ManageEngine SDP MSP, HaloITSM) with well-understood feature expectations, meaning the product must clear a high table-stakes bar before differentiation matters. The recommended technical approach is a pnpm/Turborepo monorepo with a dedicated Fastify 5 API server (separate from Next.js), PostgreSQL 17 + Prisma 7 for data, and BullMQ/Redis for background work — all running on a Debian Node.js 22 LTS server. This stack choice is non-negotiable because the .NET inventory agent and React Native mobile app require a standalone REST API, which makes tightly-coupled approaches like Next.js API routes or tRPC architecturally wrong for this product.

The most important architectural principle is that multi-tenant isolation via `tenantId` on every table and every query is the foundation on which every feature is built — it cannot be retrofitted. Research confirms that 92% of SaaS breaches originate from tenant isolation failures, making this the highest-priority correctness concern. The owner admin portal must be architecturally isolated with its own JWT secret, its own Next.js app, and private network exposure only. Every background worker (SLA monitoring, email polling, CMDB reconciliation) must carry `tenantId` in its job payload because HTTP middleware context does not propagate into async job processors.

The recommended build sequence follows strict dependency ordering: database schema and shared types first, then the service layer, then the API server, then the web frontend — with background workers, the owner portal, mobile, and the .NET agent building on top. The v1 MVP must deliver incident management, SLA tracking, email-to-ticket, self-service portal, knowledge base, RBAC, basic asset management, Stripe billing with plan enforcement, and the owner admin portal. CMDB with relationships, change management, the .NET agent, and the mobile app are validated v1.x additions — not MVP blockers. The key risk areas are billing webhook idempotency, SLA timer math with pause/resume, email-to-ticket deduplication, and push token lifecycle management — all of which have clear prevention strategies documented in the research.

---

## Key Findings

### Recommended Stack

The full stack is built around a TypeScript monorepo managed by pnpm 9.x and Turborepo 2.x. Fastify 5 (not Hono, not Express) is the API server: Hono's performance advantage only exists on edge runtimes and its Node.js adapter degrades throughput 2-3x; Express is deprecated for greenfield TypeScript work. Prisma 7 (January 2026 release, pure TypeScript engine — Rust binary removed) is preferred over Drizzle for its mature migration system and enforced type safety that prevents invalid queries across a 50+ model schema. BullMQ over Redis backs all background workers (SLA timers, email polling, CMDB reconciliation, notification dispatch, webhook delivery). Next.js 16 + React 19.2.1+ serves the web frontend — React versions below 19.2.1 have a critical RCE vulnerability (CVE-2025-55182) and must not be used. The React Native mobile app uses Expo SDK 55 (New Architecture always-on, SDK 55 = RN 0.83). The .NET inventory agent targets .NET 9 with Hardware.Info for cross-platform WMI/proc discovery.

**Core technologies:**
- **Fastify 5.x**: API HTTP server — 70-80k req/s on Node.js, mature plugin ecosystem, schema-first validation, official JWT/CORS/multipart plugins
- **Prisma 7.x**: ORM + migrations — pure TypeScript engine, 50+ model schema, auditable migration history, tenant middleware injection
- **PostgreSQL 17**: Primary database — JSONB for CMDB CI attributes, `pg_trgm` for KB full-text search, recursive CTEs for CI relationship traversal (no graph DB needed)
- **Redis 7 + BullMQ 5**: Queue + cache — SLA timers, email polling, webhook delivery, CMDB reconciliation, push dispatch
- **Next.js 16 + React 19.2.1+**: Tenant web app and owner portal — App Router, Turbopack default, React Compiler 1.0
- **Expo SDK 55 / React Native 0.83**: Mobile app — New Architecture always-on, EAS Build for iOS/Android distribution
- **Better Auth 1.x + @fastify/jwt 9.x**: Auth — custom JWT strategy with 15-min access tokens, 7-day refresh tokens, long-lived API keys; Better Auth organizations plugin maps to multi-tenant model
- **.NET 9 + Hardware.Info**: Inventory agent — single-file publish, cross-platform (Windows/Linux/macOS), Hardware.Info for WMI/proc/system_profiler
- **Stripe Node SDK 17.x**: Billing — subscription lifecycle, dunning, trial expiry, planGate middleware at API layer
- **MinIO + @aws-sdk/client-s3**: Object storage — S3-compatible, dev Docker Compose, production-migratable to AWS S3
- **pnpm 9 + Turborepo 2**: Monorepo — workspace-native, remote caching, pipeline dependencies

**Critical version requirements:**
- React must be 19.2.1+ (CVE-2025-55182 RCE patch)
- Fastify 5.x requires Node.js 20+; use Node.js 22 LTS
- @fastify/jwt 9.x must pair with Fastify 5 (v8 is incompatible)
- Zod 4.x requires TypeScript 5.5+; delivers 14x faster validation vs v3
- BullMQ 5.x requires Redis 6.2+ (streams); Redis 7 recommended

See `.planning/research/STACK.md` for full technology table and alternatives considered.

### Expected Features

Research confirms a high table-stakes bar for MSP ITSM. Competitors (Freshservice, ManageEngine SDP MSP, HaloITSM) all cover incident management, SLA tracking, email-to-ticket, KB, CMDB, change management, mobile apps, and role-based access. Missing any of these at launch means the product feels incomplete to MSPs, not just feature-limited.

**Must have (v1 launch — table stakes):**
- Multi-tenant isolation with tenantId scoping — security foundation, cannot be retrofitted
- Tenant provisioning (signup → provision → welcome email) — without this, no one gets in
- Stripe billing with trial flow and plan enforcement — without this, no revenue
- Incident management (full ticket lifecycle) — the core ITSM deliverable
- SLA management with breach alerting — MSPs sell SLAs; breach tracking is contractual
- Email-to-ticket (inbound IMAP) — primary ticket creation channel for clients
- Email notifications (outbound) — baseline communication expectation
- Self-service portal (end-user, simplified UI) — reduces agent load
- RBAC with role hierarchy — required from day one in multi-tenant context
- Knowledge base — supports self-service and agent efficiency
- Asset management (manual entry) — table stakes for MSP service delivery
- Owner admin portal with tenant management and impersonation — required to operate the SaaS
- Basic reporting and dashboards — MSPs demonstrate value to clients with this

**Should have (v1.x — add after first customers are retained):**
- CMDB with relationship mapping — requires asset management first; enables change impact analysis
- Change management with CAB approval workflows — ITIL compliance; complex to build correctly
- .NET cross-platform inventory agent — strong differentiator; requires CMDB to land data into
- Problem management — ITIL completeness; lower immediate MSP urgency
- Mobile app (iOS + Android) — field technician differentiator; requires API stability first
- Push notifications — tied to mobile
- Webhook system with delivery tracking — integration enabler; adds value once core is stable
- Scheduled exports (CSV/JSON) — reporting enhancement

**Defer (v2+ — after product-market fit):**
- Application portfolio management — sophisticated; defer until CMDB is mature
- CAB workbench with meeting scheduling — approval chains suffice for v1
- White-label / per-tenant branding — desirable but not a launch blocker
- SSO / OAuth2 (Azure AD, Okta, Google) — enterprise tier; explicitly deferred per PROJECT.md

**Confirmed anti-features (do not build):**
- Real-time chat / live chat — turns product into chat platform; architecturally complex; out of scope
- AI ticket classification — premature without training corpus; hallucinations cause real damage
- Graph database for CMDB — PostgreSQL recursive CTEs handle MSP-scale query patterns
- Native RMM integrations — webhooks + REST API let RMM vendors build their own connectors
- Multi-currency billing — launch USD only; Stripe handles currency natively when demand exists

See `.planning/research/FEATURES.md` for full feature dependency map and competitor matrix.

### Architecture Approach

The system uses a service-oriented monorepo with physically separated concerns: a standalone Fastify API server (not Next.js API routes), a BullMQ worker process running in a separate Node.js process, an isolated owner admin Next.js app on a private network, and a .NET agent living outside the JS monorepo but communicating over HTTP. All business logic lives in a shared `packages/core` service layer consumed by both the API server and the BullMQ workers — preventing duplication of ticket, SLA, CMDB, and notification logic. Every database table carries `tenantId UUID NOT NULL`, and every service function takes `tenantId` as an explicit first argument. The architecture deliberately chooses shared-schema multi-tenancy (tenantId column, not schema-per-tenant or RLS) because it scales to hundreds of tenants without the operational complexity of per-tenant schemas or the connection-pooler conflicts of PostgreSQL RLS.

**Major components:**
1. **apps/api (Fastify 5)** — Tenant API server; auth/tenant/RBAC/planGate middleware pipeline; all REST routes; BullMQ enqueue; Zod validation on every route
2. **apps/web (Next.js 16)** — Technician/admin UI + end-user self-service portal; no direct DB access; fetches from apps/api
3. **apps/owner (Next.js 16)** — Owner admin portal; private network only; separate JWT secret; tenant CRUD, billing, impersonation
4. **apps/worker (BullMQ)** — Separate Node.js process; SLA monitoring, email polling, CMDB reconciliation, notification dispatch, webhook delivery, report generation; every job payload includes tenantId
5. **apps/mobile (Expo SDK 55)** — React Native iOS + Android; Expo Router; same API as web
6. **packages/db (Prisma 7)** — Single Prisma schema; generated client; migration history; consumed by API and workers
7. **packages/core** — Service layer (TicketService, SLAService, AssetService, etc.); pure TypeScript functions; takes tenantId explicitly
8. **packages/types (Zod 4)** — Shared API contract schemas; consumed by API validation and web/mobile TypeScript
9. **agent/ (.NET 9)** — Inventory collection; posts to POST /api/v1/agents/inventory with per-device API key; push-only in v1
10. **PostgreSQL 17 + Redis 7 + MinIO** — Data layer; all bucket paths prefixed with tenantId

**Key patterns to follow:**
- Tenant middleware runs before every route handler (except /auth/login and /auth/register)
- Every service function takes `tenantId: string` as explicit first parameter — never infer from context
- Owner impersonation issues 15-minute short-lived JWT with `impersonatedBy` claim; every impersonated action is audit-logged
- Every BullMQ job payload must include `tenantId` as a required field
- planGate middleware enforces plan limits at the API layer; frontend shows upgrade prompts, never raw 403 errors
- MinIO bucket paths always include tenantId prefix for storage isolation
- Background jobs are always async — never send email or push notifications inline in an API request

See `.planning/research/ARCHITECTURE.md` for full component build order, data flows, and anti-patterns.

### Critical Pitfalls

Research identified 10 specific pitfalls with prevention strategies. The top 6 that affect phase design:

1. **Missing tenantId scope on any query** — Enforce via Prisma middleware that automatically injects tenantId and raises an error if context is absent. Run a cross-tenant isolation test suite (Tenant B cannot see Tenant A's data) before any feature ships. This cannot be fixed retroactively. Address in Foundation phase before any feature code.

2. **Background worker tenant context leakage** — BullMQ job processors run in a different async context than HTTP request handlers. AsyncLocalStorage context is not propagated. Solution: every job payload carries `tenantId` as a required first-class field; every worker asserts its presence before any database access. Address at worker infrastructure setup, before first background job.

3. **Owner admin portal not truly isolated** — Shared JWT secrets or shared auth middleware between the tenant API and owner portal creates privilege escalation risk. Solution: separate JWT secret (`OWNER_JWT_SECRET`), separate Next.js app, separate Fastify route group or process, private network only. Must be established in Foundation phase before either portal has features.

4. **Stripe webhook race condition and non-idempotency** — Checkout redirect arrives before the webhook updates the database (race condition). The same webhook event fires multiple times on Stripe retries (non-idempotency). Solution: implement `/billing/sync-checkout` endpoint for immediate Stripe API query on redirect; store processed `stripeEventId` in a `stripe_webhook_events` table with UNIQUE constraint; process all webhook business logic in BullMQ, not inline. Both must be built alongside the webhook handler, not after.

5. **SLA timer drift with pause/resume and business hours** — Store SLA deadlines as absolute UTC timestamps calculated at ticket creation or last-resume time, never as durations. Store cumulative `pausedDuration` separately. Use database-side timestamp arithmetic (`NOW() > sla_breach_at`). Business hours must be stored per-tenant with timezone. Test the pause/resume/pause/resume sequence against a manually calculated expected value before releasing SLA monitoring.

6. **planGate enforced at API but not in UI** — Users hitting 403 errors with no context conclude the product is broken. Solution: single plan capability config (`packages/plan-config`) consumed by both the API planGate middleware and a `usePlan()` frontend hook. Every gated feature shows an upgrade prompt, not an error. UI enforcement must ship alongside API enforcement in the same phase.

Additional pitfalls documented (address in their respective phases):
- **Email-to-ticket duplicates** — Store `processed_emails` with Message-ID UNIQUE constraint; distributed Redis lock per mailbox; multi-layer reply matching
- **Push token lifecycle** — Upsert tokens on sign-in using deviceId; delete on sign-out; schedule Expo receipt processing job to deactivate invalid tokens
- **CMDB reconciliation without precedence policy** — Agent data wins on hardware fields; human edits win on relationship/ownership fields; conflicts go to review queue, never silently overwritten
- **CMDB agent using shared auth credentials** — Per-device, per-tenant API keys only; agent registration must be tenant-scoped

See `.planning/research/PITFALLS.md` for full pitfall details, security mistakes, performance traps, and recovery strategies.

---

## Implications for Roadmap

The research establishes a clear dependency ordering. The following phase structure reflects what must exist before the next component can be built, which pitfalls each phase must address, and which features belong together.

### Phase 1: Foundation — Monorepo, Database, Auth, and Tenant Isolation

**Rationale:** Every subsequent feature depends on tenant isolation being correct and the database schema being stable. This is the only phase where getting it wrong causes a catastrophic retrofit. The entire team must agree on tenantId enforcement before any feature code is written.

**Delivers:**
- Turborepo monorepo scaffold with all apps and packages stubbed
- PostgreSQL 17 schema foundations (tenants, users, roles) + Prisma 7 client in packages/db
- Fastify 5 API server with tenant middleware pipeline (auth → tenant → RBAC → planGate)
- JWT auth strategy with 15-min access / 7-day refresh / API key support
- Owner admin Next.js app scaffolded with separate JWT secret and private deployment
- Cross-tenant isolation test suite passing (Tenant B cannot access Tenant A's data)

**Key pitfalls to address:** Missing tenantId scope (Pitfall 1), Owner admin isolation (Pitfall 3), shared JWT secret anti-pattern

**Research flag:** Standard patterns — well-documented Fastify + Prisma + multi-tenant approach; skip research-phase

---

### Phase 2: Tenant Provisioning and Billing Foundation

**Rationale:** No tenant can use the product until they can sign up and pay. Stripe integration and trial flow must be reliable end-to-end before any ITSM feature is built, because plan enforcement (planGate) will be threaded through every subsequent feature. Billing bugs after launch are harder to fix than billing bugs before any customer exists.

**Delivers:**
- Stripe subscription plans, trial flow, and checkout session
- `/billing/sync-checkout` endpoint for immediate post-checkout state sync
- BullMQ-based async webhook processing with `stripe_webhook_events` idempotency table
- planGate middleware in Fastify + `usePlan()` hook in Next.js web app
- `packages/plan-config` as single source of truth for plan capability matrix
- Trial expiry worker + dunning email sequence
- Owner admin: tenant list, plan management, subscription status

**Key pitfalls to address:** Stripe webhook race condition (Pitfall 4), Stripe webhook non-idempotency (Pitfall 5), planGate UI enforcement (Pitfall 10)

**Research flag:** Standard Stripe patterns but idempotency implementation is nuanced; consider a brief research-phase spike on webhook idempotency patterns before implementation

---

### Phase 3: Core ITSM — Incident Management, SLA, and Email

**Rationale:** Incident management is the central ITSM deliverable. SLA management is contractually required by MSP clients from day one. Email-to-ticket is the primary ticket creation channel. These three are inseparable in MSP context — they ship together as the MVP core.

**Delivers:**
- Full ticket lifecycle (create, assign, prioritize, update, resolve, close) with audit trail
- RBAC with system roles (msp_admin, agent, end_user, customer_admin) enforced at middleware
- SLA management: response + resolution timers as absolute UTC deadlines, business hours per tenant with timezone, breach alerting at 75%/90%, escalation chains
- BullMQ `sla-monitor` worker polling every 60 seconds with tenant-aware job payloads
- Email-to-ticket inbound (imapflow, IMAP IDLE, per-tenant mailbox config)
- `processed_emails` table with Message-ID UNIQUE constraint; distributed Redis lock per mailbox
- Outbound email notifications (Nodemailer + React Email templates) via BullMQ worker
- Ticket assignment and routing (manual + round-robin auto-assignment)
- Ticket priorities, categorization (P1-P4, incident/request/problem types)

**Key pitfalls to address:** Background worker tenant context leakage (Pitfall 2), SLA timer drift (Pitfall 6), email-to-ticket duplicates (Pitfall 7)

**Research flag:** SLA business hours calendar implementation is non-trivial; may need research-phase to evaluate timezone library options and pause/resume math correctness

---

### Phase 4: Self-Service Portal, Knowledge Base, and Basic Asset Management

**Rationale:** These three features complete the MVP surface that a first paying MSP customer needs. End users need a way to submit and track tickets without email. MSP technicians need KB articles. Asset tracking is table stakes for MSP service delivery. All three have moderate complexity and build directly on Phase 3's incident management.

**Delivers:**
- Self-service portal: separate simplified UI within apps/web (Next.js route group), ticket submission, status tracking
- Knowledge base: rich text editor, article search (pg_trgm), article voting, ticket linking, suggested articles during ticket creation
- Asset management (manual entry): asset lifecycle status, assignment to users/organizations, hardware/software properties
- Service catalog with custom request forms
- Basic reporting and dashboards: ticket volume, SLA performance, resolution time, agent workload (per-tenant)

**Key pitfalls to address:** planGate must be functional before this phase (enforces asset quota limits per plan)

**Research flag:** Standard patterns; skip research-phase

---

### Phase 5: CMDB, Change Management, and Problem Management

**Rationale:** CMDB is the prerequisite for change impact analysis. Change management without CMDB is just an approval workflow — not ITIL-compliant change management. Problem management links to incidents already built. These three form a coherent ITIL expansion that MSPs need for compliance-sensitive clients.

**Delivers:**
- CMDB: CI types, relationship mapping (join table + PostgreSQL recursive CTEs for impact traversal), CI lifecycle status
- CMDB relationship visualization in UI
- Change management: change types (standard/normal/emergency), approval chains, CAB meeting scheduling, scheduling conflict detection
- CAB meeting object with attendee list and linked changes for review
- Problem management: link incidents to problems, root cause analysis, known errors, workarounds
- Application portfolio management (CI dependencies, owner assignment, risk scoring) — strong differentiator, schedule here since CMDB is built

**Key pitfalls to address:** PostgreSQL CTE query patterns for recursive CI traversal must be benchmarked; CMDB reconciliation infrastructure must be ready to receive agent data in Phase 6

**Research flag:** Change management CAB workflow patterns and ITIL compliance requirements warrant a research-phase spike before detailed planning

---

### Phase 6: .NET Inventory Agent and CMDB Auto-Discovery

**Rationale:** The .NET agent is a strong differentiator but requires CMDB (Phase 5) and Asset management (Phase 4) to already exist before the agent data has anywhere to land. The reconciliation policy must be specified before any agent ingestion code is written.

**Delivers:**
- .NET 9 inventory agent: Hardware.Info for cross-platform discovery (Windows/Linux/macOS), per-device API key auth, POST /api/v1/agents/inventory, scheduled collection every 4 hours
- Single-file publish for win-x64, linux-x64, osx-arm64
- Owner portal: agent package distribution per-tenant
- API: apiKeyMiddleware resolving tenantId + deviceId; Zod schema validation on inventory payload
- CMDB reconciliation worker: precedence policy (agent wins hardware fields; human edits win relationship/ownership fields); `ci_reconciliation_conflicts` review queue
- BullMQ `cmdb-reconcile` worker with full-diff logic (only write changed fields)

**Key pitfalls to address:** CMDB reconciliation without precedence policy (Pitfall 9), agent authentication with shared credentials anti-pattern

**Research flag:** .NET Hardware.Info library and single-file publish patterns are moderately documented; verify cross-platform WMI vs /proc behavior during implementation; skip research-phase

---

### Phase 7: Mobile App and Push Notifications

**Rationale:** Mobile requires a stable API contract. Building mobile before the API stabilizes creates rework. By Phase 7 the API surface covering tickets, assignments, SLA alerts, and notifications is stable. Push token lifecycle must be designed correctly from the first notification sent.

**Delivers:**
- Expo SDK 55 React Native app (iOS + Android) via EAS Build
- Expo Router file-based navigation; focused mobile UX: My Tickets, Assign/Reassign, Status Update, Comment (not full ITSM)
- JWT auth with expo-secure-store (not AsyncStorage)
- Push notifications: FCM (Android) + APNs (iOS) via Expo push service or direct native tokens
- `push_tokens` table: userId, expoPushToken, platform, deviceId, status columns; upsert on sign-in; delete on sign-out
- Expo Push Receipt processing background job (runs 15-30 min after batch sends; deactivates invalid tokens)
- Notification deep-linking: push alerts open directly to the relevant ticket

**Key pitfalls to address:** Push token lifecycle not managed (Pitfall 8); APNs development vs production credentials must be environment-specific from day one

**Research flag:** APNs credential setup and Expo EAS Build configuration for both environments warrants a research-phase to avoid environment mismatch issues in production

---

### Phase 8: Integrations — Webhooks, Scheduled Exports, and API Access

**Rationale:** Integration capabilities are MSP multipliers. Once core ITSM is stable, webhooks let MSP clients connect their RMM and monitoring tools. Scheduled exports satisfy client reporting obligations. These are v1.x differentiators, not MVP blockers.

**Delivers:**
- Webhook system: signed payloads (HMAC-SHA256), retry with exponential backoff (max 5 attempts), delivery log per webhook endpoint
- BullMQ `webhook-delivery` worker
- Tenant-configurable webhook endpoints per event type
- Scheduled report exports (CSV/JSON): configurable schedule, email delivery
- REST API public documentation (OpenAPI from @fastify/swagger)
- API key management UI in tenant settings
- Per-tenant rate limiting (@fastify/rate-limit with Redis backing)

**Key pitfalls to address:** Standard webhook patterns with well-documented retry/backoff behavior; skip research-phase

---

### Phase Ordering Rationale

The sequence is driven by three principles established across all four research files:

1. **Dependency correctness:** tenantId isolation cannot be retrofitted (every phase depends on Phase 1). Billing must be reliable before plan enforcement gates any feature (Phase 2 before all ITSM). CMDB must exist before change impact analysis (Phase 5 before Phase 6 agent). API must stabilize before mobile investment (Phase 7 after Phase 3-5).

2. **Risk-front-loading:** The two highest-risk areas (tenant isolation failures and billing webhook bugs) are addressed in Phases 1 and 2 before any customer-facing features exist. This means bugs in these areas are caught during internal testing, not during customer trials.

3. **Differentiator sequencing:** The .NET inventory agent is a strong differentiator but depends on CMDB. Mobile is a strong differentiator but depends on a stable API. Application portfolio management is a unique differentiator but depends on CMDB maturity. The sequence lets differentiators land on solid foundations rather than on incomplete infrastructure.

### Research Flags

Phases likely needing `/gsd:research-phase` before detailed planning:

- **Phase 2 (Billing):** Stripe webhook idempotency with BullMQ async processing has specific implementation nuances; a targeted spike on the idempotency table pattern and out-of-order event handling is warranted
- **Phase 3 (SLA):** Business hours timezone calendar implementation with pause/resume is mathematically non-trivial; research the best TypeScript timezone library (date-fns-tz vs Temporal API) and validate the pause/resume accumulator formula before writing timer code
- **Phase 5 (Change Management):** ITIL-compliant CAB workflow with meeting scheduling, multi-approver chains, and emergency change bypass has significant workflow complexity; research change management process requirements before detailed planning
- **Phase 7 (Mobile):** APNs certificate/key management for development vs TestFlight vs production environments, and EAS Build configuration for both platforms, has historically been a source of "works in debug but fails on TestFlight" issues

Phases with standard patterns (skip research-phase):

- **Phase 1 (Foundation):** Fastify + Prisma + pnpm monorepo patterns are extremely well-documented
- **Phase 4 (Portal, KB, Assets):** Standard CRUD UI patterns on top of established API infrastructure
- **Phase 6 (Agent):** .NET single-file publish and REST POST patterns are straightforward
- **Phase 8 (Webhooks):** HMAC-signed webhook delivery with BullMQ retry is a well-established pattern

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core choices (Fastify 5, Prisma 7, Next.js 16, Expo SDK 55) verified against official release notes, changelogs, and npm. React CVE verified against Snyk advisory. Fastify vs Hono performance difference verified against Better Stack benchmark. |
| Features | MEDIUM-HIGH | Table stakes features confirmed across ITIL standards and competitor analysis (Freshservice, ManageEngine, HaloITSM public documentation). Competitor tier details are MEDIUM confidence — based on public marketing pages as of 2026-03; verify before using in sales positioning. |
| Architecture | HIGH | Multi-tenancy patterns verified against AWS, WorkOS, and Logto architectural guides. BullMQ worker patterns verified against official BullMQ docs. Impersonation pattern verified against published enterprise multi-tenant implementations. |
| Pitfalls | HIGH | All 10 pitfalls sourced from incident reports, official Stripe documentation, Expo push docs, and CMDB reconciliation guides. Cross-tenant isolation failure rate (92%) sourced from InstaTunnel/Redis multi-tenant security research. |

**Overall confidence:** HIGH

### Gaps to Address

- **Better Auth 1.x stability:** Better Auth is a newer library with MEDIUM confidence. If organizations plugin integration with Fastify shows unexpected friction, fallback to pure `@fastify/jwt` custom implementation. Validate the organizations plugin integration in Phase 1 before depending on it.

- **Competitor feature tier details:** The competitor feature matrix (Freshservice, ManageEngine, HaloITSM) is based on public marketing pages as of March 2026. Specific tier restrictions may differ from reality. Do not use this matrix for sales claims without independent verification.

- **Business hours calendar library:** No specific library recommendation is locked in for SLA business hours / timezone handling. This gap must be resolved during Phase 3 research. Candidates: date-fns-tz, Temporal (TC39 stage 3), Luxon.

- **PostgreSQL recursive CTE performance at scale:** CTE-based CI impact traversal is the recommended approach over a graph database for v1. Performance at 10K+ CIs has not been benchmarked for this codebase. Monitor query plans during CMDB development and add indexes on the relationship join table before Phase 5 ships.

- **Hardware.Info cross-platform completeness:** Hardware.Info is documented as using WMI on Windows, /proc + /sys on Linux, and system_profiler on macOS. Edge cases for Linux distributions without standard /proc paths (some container OSes) have not been investigated. Validate during Phase 6 against representative client environments.

---

## Sources

### Primary (HIGH confidence)

- [Fastify v5 GA — OpenJS Foundation](https://openjsf.org/blog/fastifys-growth-and-success) — Fastify 5 release confirmation
- [Fastify npm (5.8.2)](https://www.npmjs.com/package/fastify) — Current version confirmed March 2026
- [Prisma 7.0 announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) — Pure TypeScript engine, January 2026 release
- [Next.js 16 blog post](https://nextjs.org/blog/next-16) — Release details, Turbopack default, React Compiler 1.0
- [React RSC RCE vulnerability — Snyk](https://snyk.io/blog/security-advisory-critical-rce-vulnerabilities-react-server-components/) — CVE-2025-55182; use React 19.2.1+
- [Zod v4 release — InfoQ](https://www.infoq.com/news/2025/08/zod-v4-available/) — 14x faster validation vs v3
- [Expo SDK 55 changelog](https://expo.dev/changelog) — SDK 55 = RN 0.83, New Architecture always-on
- [BullMQ official site](https://bullmq.io/) — Production queue with Redis
- [WorkOS: Developer's Guide to SaaS Multi-Tenant Architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [AWS: Multi-Tenant Data Isolation with PostgreSQL Row Level Security](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Stripe: Best Practices for SaaS Billing](https://stripe.com/resources/more/best-practices-for-saas-billing)
- [Expo Push Notifications FAQ — Official Docs](https://docs.expo.dev/push-notifications/faq/)

### Secondary (MEDIUM confidence)

- [Hono vs Fastify — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/) — Node.js adapter performance degradation confirmed
- [Better Auth + Fastify integration](https://better-auth.com/docs/integrations/fastify) — Official Fastify plugin, newer library
- [Better Auth multi-tenancy guide](https://peerlist.io/shrey_/articles/building-better-auth-in-fastify-multitenant-saas-and-secure-api-authentication)
- [Drizzle vs Prisma — bytebase (2026)](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Hardware.Info NuGet](https://www.nuget.org/packages/Hardware.Info)
- [Multi-Tenant Leakage: When RLS Fails in SaaS (InstaTunnel)](https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c)
- [Billing Webhook Race Condition — ExcessiveCoding](https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide)
- [Best Practices for Stripe Webhooks — Stigg](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks)
- [Expo Push Notifications: 5 Critical Setup Mistakes — Sashido](https://www.sashido.io/en/blog/expo-push-notifications-setup-caveats-troubleshooting)
- [CMDB Automated Discovery and Reconciliation — Rezolve AI](https://www.rezolve.ai/blog/automated-discovery-and-reconciliation-in-cmdb)
- Freshservice, ManageEngine SDP MSP, HaloITSM — public feature pages (March 2026)

### Tertiary (MEDIUM confidence, verify before use)

- Competitor tier feature restrictions — based on public marketing; verify before sales positioning
- tRPC vs REST analysis — inferred from architecture separation rationale; not benchmarked against this codebase

---

*Research completed: 2026-03-19*
*Ready for roadmap: yes*
