---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Paperwork Cleanup
status: Ready to execute
stopped_at: Completed 06-01-PLAN.md
last_updated: "2026-04-16T21:37:25.795Z"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 43
  completed_plans: 43
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-19)

**Core value:** An MSP can manage multiple customer organizations' IT service desks from a single platform with complete tenant isolation, paying via Stripe subscription, with the full ITSM lifecycle working end-to-end.
**Current focus:** Phase 05 — agent-mobile-and-integrations

## Current Position

Phase: 05 (agent-mobile-and-integrations) — EXECUTING
Plan: 8 of 9

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: ~7 min
- Total execution time: 0.75 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 6/6 | ~48 min | ~8 min |

**Recent Trend:**

- Last 6 plans: 01-01 (~11 min), 01-02 (9 min), 01-03 (~10 min), 01-04 (~10 min), 01-05 (~2 min), 01-06 (~6 min)
- Trend: Stable

*Updated after each plan completion*
| Phase 01-foundation P01 | 8 | 3 tasks | 39 files |
| Phase 01-foundation P02 | 9 | 2 tasks | 11 files |
| Phase 01-foundation P03 | 10 | 2 tasks | ~15 files |
| Phase 01-foundation P04 | 10 | 2 tasks | 14 files |
| Phase 01-foundation PP03 | 12 min | 3 tasks | 28 files |
| Phase 01-foundation P05 | 2 | 1 tasks | 6 files |
| Phase 01-foundation P06 | 6 | 2 tasks | 15 files |
| Phase 02-billing-and-owner-admin P04 | 10 | 2 tasks | 13 files |
| Phase 02-billing-and-owner-admin P01 | 15 | 3 tasks | 13 files |
| Phase 02-billing-and-owner-admin P02 | 7 | 2 tasks | 7 files |
| Phase 02-billing-and-owner-admin P05 | 11 | 3 tasks | 14 files |
| Phase 02-billing-and-owner-admin P06 | 12 | 2 tasks | 13 files |
| Phase 02-billing-and-owner-admin P03 | 16 | 3 tasks | 15 files |
| Phase 03-core-itsm P10 | 2 | 2 tasks | 6 files |
| Phase 03-core-itsm P04 | 7 | 1 tasks | 3 files |
| Phase 03-core-itsm P02 | 9 | 2 tasks | 7 files |
| Phase 03-core-itsm P06 | 8 | 2 tasks | 13 files |
| Phase 03-core-itsm P01 | 10 | 2 tasks | 8 files |
| Phase 03-core-itsm P05 | 8 | 2 tasks | 10 files |
| Phase 03-core-itsm P03 | 17 | 2 tasks | 10 files |
| Phase 03-core-itsm P07 | 8 | 2 tasks | 4 files |
| Phase 03-core-itsm P08 | 9 | 2 tasks | 7 files |
| Phase 03-core-itsm P09 | 35 | 2 tasks | 20 files |
| Phase 03-core-itsm P12 | 1 | 2 tasks | 3 files |
| Phase 03-core-itsm P11 | 5 | 2 tasks | 2 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P04 | 5 | 1 tasks | 6 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P01 | 4 | 2 tasks | 4 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P02 | 12 | 2 tasks | 3 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P03 | 12 | 3 tasks | 7 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P06 | 10 | 2 tasks | 3 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P05 | 5 | 2 tasks | 4 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P08 | 7 | 2 tasks | 4 files |
| Phase 04-cmdb-change-management-and-asset-portfolio P07 | 35 | 2 tasks | 14 files |
| Phase 05-agent-mobile-and-integrations P06 | 5 | 2 tasks | 25 files |
| Phase 05-agent-mobile-and-integrations P04 | 8 | 2 tasks | 24 files |
| Phase 05-agent-mobile-and-integrations P01 | 22 | 2 tasks | 13 files |
| Phase 05-agent-mobile-and-integrations P02 | 8 | 2 tasks | 10 files |
| Phase 05-agent-mobile-and-integrations P05 | 9 | 2 tasks | 19 files |
| Phase 05-agent-mobile-and-integrations PP07 | 10 | 2 tasks | 18 files |
| Phase 05-agent-mobile-and-integrations P03 | 12 | 2 tasks | 8 files |
| Phase 05-agent-mobile-and-integrations P09 | 13 | 2 tasks | 7 files |
| Phase 05-agent-mobile-and-integrations P08 | 15 | 2 tasks | 9 files |
| Phase 06-paperwork-cleanup P01 | 6 min | 3 tasks tasks | 6 files files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Stack locked: Fastify 5 (not Hono), Prisma 7, Next.js 16, React 19.2.1+, Expo SDK 55, BullMQ 5, Redis 7, PostgreSQL 17, .NET 9, Zod 4, pnpm 9 + Turborepo 2
- [Roadmap]: React must be 19.2.1+ due to CVE-2025-55182 RCE vulnerability — non-negotiable
- [Roadmap]: Shared-schema multi-tenancy (tenantId column) chosen over schema-per-tenant or RLS
- [Roadmap]: Phase 3 SLA and Phase 2 Billing flagged for research-phase before detailed planning
- [Phase 01-01]: fastify-type-provider-zod (unscoped) used instead of non-existent @fastify/type-provider-zod — plan spec had wrong npm package name
- [Phase 01-01]: ioredis@5.3.2 used (plan spec had invalid semver 3.1013.0) — ioredis v5 is current stable
- [Phase 01-01]: turbo added to root devDependencies — omitted from plan but required for pnpm turbo build to resolve
- [Phase 01-02]: Prisma 7 requires datasource URL in prisma.config.ts via adapter — schema.prisma datasource block has no url field (breaking change from Prisma 6)
- [Phase 01-02]: @@unique([tenantId, name]) added to SLA and Category models to support seed upsert by name
- [Phase 01-02]: 62 total models (UserGroupMember explicit join table added; plan listed 61)
- [Phase 01-04]: BullMQ connection uses plain host/port options object (not Redis instance) to avoid ioredis@5.10.1 vs @5.9.3 version conflict between worker and bullmq peer dep
- [Phase 01-04]: @types/pg pinned to 8.11.11 in packages/db to resolve structural type conflict with pg@8.20.0 bundled types
- [Phase 01-04]: Tenant model type in packages/core derived via PrismaClient return type inference (not direct @prisma/client import)
- [Phase 01-03]: ioredis v5 uses named export 'Redis' — import { Redis } from 'ioredis'
- [Phase 01-03]: planGatePreHandler is a no-op stub in Phase 1 — Phase 2 implements plan limit enforcement
- [Phase 01-03]: Org-lookup Cloudflare Worker routing deferred — dev uses localhost:4000 directly
- [Phase 01-foundation]: jose used for owner JWT (not jsonwebtoken) — Next.js middleware runs in Edge runtime which lacks Node.js crypto
- [Phase 01-foundation]: @node-rs/bcrypt used in owner app for Edge-compatible bcrypt verification
- [Phase 01-06]: BullMQ Queue mock must use class constructor syntax in vi.mock — vi.fn().mockImplementation() is not a valid constructor substitute
- [Phase 01-06]: Encryption tests use dynamic import inside it() blocks to ensure ENCRYPTION_KEY env var is set before module initialization
- [Phase 02-billing-and-owner-admin]: IMPERSONATION_JWT_SECRET used (not OWNER_JWT_SECRET) so main API only shares the impersonation key
- [Phase 02-billing-and-owner-admin]: IP allowlist optional — OWNER_ADMIN_IP_ALLOWLIST unset means no restriction (dev mode)
- [Phase 02-01]: stripe@20.4.1 used with apiVersion 2026-02-25.clover — plan had 17.x/2025-02-24.acacia which caused type errors
- [Phase 02-01]: preParsing hook captures raw webhook body without disrupting global JSON parser — avoid global addContentTypeParser
- [Phase 02-01]: vitest class syntax required for Worker/Queue/Redis constructor mocks — vi.fn().mockImplementation() not valid as constructor
- [Phase 02-02]: @meridian/core must be built (tsc) before apps/api tests resolve isFeatureResource -- workspace symlinks resolve to dist/
- [Phase 02-02]: billingPlanRoutes registered in v1 protected scope (not billing/ public scope) -- plan data requires JWT auth
- [Phase 02-billing-and-owner-admin]: SubscriptionPlanTier used as local union type in provisioning.ts — @meridian/db only exports prisma client, not Prisma enums
- [Phase 02-billing-and-owner-admin]: authHeaders typed as Record<string, string> in owner admin client components — optional Authorization property fails TypeScript HeadersInit constraint
- [Phase 02-billing-and-owner-admin]: Stripe apiVersion cast as 'any' — stripe@20.4.1 types use 2026-02-25.acacia but TS compiler rejects it without the cast
- [Phase 02-billing-and-owner-admin]: AuditLog cross-tenant query (no tenantId filter) intentionally owner-only — valid only behind owner JWT auth
- [Phase 02-billing-and-owner-admin]: BullMQ Queue instances created per-request and closed immediately in owner app — stateless, no persistent Redis connections
- [Phase 02-03]: Stripe API 2026-02-25.clover removed current_period_start/end from Subscription type — sync-checkout stores only status and cancelAtPeriodEnd; cancel.ts uses cancel_at
- [Phase 02-03]: Custom billing UI per CONTEXT.md (not Stripe Customer Portal) despite REQUIREMENTS.md BILL-05 wording — CONTEXT.md wins per plan spec
- [Phase 02-03]: zod added directly to apps/api (not via fastify-type-provider-zod) for billing route request body validation
- [Phase 03-core-itsm]: Wave 0 test scaffolds use it.todo() so vitest discovers them without failures — behavioral contract before implementation
- [Phase 03-core-itsm]: View count increment is async (void) to avoid blocking GET responses; helpfulCount decrement uses Math.max(0, n-1) for floor-zero guarantee without DB constraint
- [Phase 03-core-itsm]: getPublishedArticles hard-codes status=PUBLISHED and visibility=PUBLIC — portal endpoint cannot be weakened by query params
- [Phase 03-02]: date-fns + date-fns-tz used for business-hours math via toZonedTime/fromZonedTime for correct timezone offset handling
- [Phase 03-02]: getElapsedPercentage and getSlaStatus duplicated in worker (not imported from api) to avoid cross-app import, follows mapStripeStatus precedent
- [Phase 03-02]: SLA monitor is a cross-tenant sentinel (no tenantId scoping) that processes all active tickets in single job
- [Phase 03-02]: customFields JSON flags (sla_75_notified, sla_90_notified, sla_breached_notified) prevent duplicate notification dispatch on each minute tick
- [Phase 03-02]: Prisma 7 JSON type requires 'as any' cast for spread-constructed objects in ticket.update() customFields
- [Phase 03-06]: Category cycle detection uses raw SQL query to avoid TS7022 self-referencing type error in async while loop
- [Phase 03-06]: SSE log streaming creates a dedicated ioredis subscriber connection per request to avoid blocking the global Redis client
- [Phase 03-06]: Branding settings stored as JSON blob in tenant.settings field; logo upload stores key under {tenantId}/branding/logo-{ts}.{ext}
- [Phase 03-01]: 'tickets' added to PlanResource type; getLimitKey returns null for unlimited resources — planGate skips count check when null
- [Phase 03-01]: @fastify/multipart registered scoped to ticket plugin only (not globally) to avoid JSON content-type conflicts
- [Phase 03-01]: SLA pause stored in customFields.slaPausedAt on ticket (lightweight, no extra table)
- [Phase 03-05]: DOMPurify added for XSS-safe knowledge article HTML rendering via SafeHtml component with explicit allowlist
- [Phase 03-05]: end_user middleware redirect uses jwtVerify from jose (Edge-compatible) — consistent with Phase 01-foundation pattern
- [Phase 03-05]: Comment form forces visibility=PUBLIC client-side — belt-and-suspenders alongside server-side enforcement
- [Phase 03-core-itsm]: EmailAccount type derived via PrismaClient inference (not direct @prisma/client import) — @prisma/client not a declared dep of apps/api
- [Phase 03-core-itsm]: email-inbound service duplicated in worker/src/services/ to avoid cross-app imports — follows mapStripeStatus precedent
- [Phase 03-core-itsm]: Email polling worker concurrency 1 (cross-tenant sentinel) — all tenant mailboxes polled sequentially per job run
- [Phase 03-07]: Notification route uses userId (not id) from JWT — consistent with all other v1 routes
- [Phase 03-07]: Fire-and-forget notification pattern: void (async () => try/catch)() in ticket.service — notification failure never blocks ticket operations
- [Phase 03-core-itsm]: Queue names mirrored in report.service.ts to avoid cross-app imports from apps/worker -- follows mapStripeStatus precedent
- [Phase 03-core-itsm]: getSystemHealth creates temporary Queue instances per call and closes them -- stateless, no persistent Redis connections
- [Phase 03-09]: SlaCountdown color bands locked per CONTEXT.md: green <75%, yellow 75-89%, red 90-99%, BREACHED 100%+
- [Phase 03-09]: ArticleEditor uses DOMPurify + DOMParser document fragment for safe HTML rendering in read-only mode
- [Phase 03-09]: Dashboard layout injects QueryClientProvider so all dashboard pages share a single TanStack Query client
- [Phase 03-09]: Next.js rewrite proxy in next.config.ts routes /api/* to Fastify at API_URL — eliminates CORS, enables browser fetch calls
- [Phase 03-09]: Middleware JWT secret aligned to JWT_SECRET env var (same as API signing key); roles field supports array format
- [Phase 03-09]: Fastify auth plugin falls back to meridian_session cookie after bearer header failure for proxied browser requests
- [Phase 03-09]: Stripe service made lazy-init (getStripe()) to avoid startup crash without STRIPE_SECRET_KEY in dev environments
- [Phase 03-core-itsm]: Worker code duplication (sla-monitor, email-notification, scheduled-report duplicating logic from their API service counterparts) is an accepted architecture pattern — workers cannot import from apps/api/src/services/ due to cross-app boundary; follows mapStripeStatus precedent from Phase 02. Moving to shared packages/ deferred to future refactor.
- [Phase 03-core-itsm]: NOTF-02 satisfied — NotificationType enum has 12 values (initial verification miscounted; CAB_INVITATION was present but not counted): TICKET_ASSIGNED, TICKET_UPDATED, TICKET_COMMENTED, TICKET_RESOLVED, TICKET_CREATED, SLA_WARNING, SLA_BREACH, CHANGE_APPROVAL, CHANGE_UPDATED, MENTION, SYSTEM, CAB_INVITATION
- [Phase 03-12]: PRTL-05 and REPT-05 formally deferred to Phase 4 — incorrectly marked Complete despite depending on Phase 4 asset CRUD (ASST-01) and CMDB data (CMDB-01)
- [Phase 03-core-itsm]: Worker code duplication (sla-monitor, email-notification, scheduled-report) accepted as architecture pattern — cross-app import boundary prevents sharing; follows mapStripeStatus precedent; deferred to future packages/ refactor
- [Phase 03-core-itsm]: NOTF-02 confirmed satisfied — NotificationType enum has 12 values including CAB_INVITATION
- [Phase 04-cmdb-change-management-and-asset-portfolio]: Wave 0 scaffold pattern continued from Phase 3: it.todo() stubs ensure vitest discovers all test files without failures while documenting expected behaviors before implementation
- [Phase 04-cmdb-change-management-and-asset-portfolio]: Sequential assetTag uses FOR UPDATE lock in \ — same pattern as ticketNumber
- [Phase 04-cmdb-change-management-and-asset-portfolio]: 'me' shorthand in assignedToId resolved server-side to JWT userId — no special portal route needed
- [Phase 04-cmdb-change-management-and-asset-portfolio]: deleteCI soft-deletes (status=DECOMMISSIONED) — preserves relationship history
- [Phase 04-cmdb-change-management-and-asset-portfolio]: Impact analysis uses two separate CTEs (downstream + upstream) for clean directional semantics
- [Phase 04-cmdb-change-management-and-asset-portfolio]: cmdb.service.ts uses global prisma singleton (not passed-in tx) — consistent with ticket.service.ts pattern
- [Phase 04]: [04-03]: Asset model uses assetTag/hostname/model — no 'name' field; change service select updated accordingly
- [Phase 04]: [04-03]: /calendar route defined before /:id in Fastify changeRoutes to prevent parameterized route conflict
- [Phase 04]: [04-03]: CAB outcome APPROVED/REJECTED transition wrapped in try/catch — outcome saved regardless of whether change transition succeeds
- [Phase 04]: settings.read/settings.update used for application routes — no APP-specific permissions exist; applications are a settings-level concern
- [Phase 04-05]: cmdb-reconciliation worker changed to cross-tenant sentinel sweep (not per-agent job) — consistent with sla-monitor.ts pattern
- [Phase 04-05]: Zod 4 z.record() requires two args: z.record(z.string(), z.unknown()) not z.record(z.unknown())
- [Phase 04-05]: importCIs uses global prisma singleton (not passed-in PrismaClient) — @prisma/client not a direct dep of apps/api, consistent with cmdb.service.ts
- [Phase 04-05]: CMDB report endpoint requires both reports.read AND cmdb.view permissions for belt-and-suspenders tenant data isolation
- [Phase 04-08]: papaparse worker: false enforced per RESEARCH.md pitfall 3 (Next.js Worker scope issue)
- [Phase 04-08]: Dagre LR layout for app dependency diagram vs TB for CMDB - different visual semantics per CONTEXT.md
- [Phase 04-07]: ReactFlow component separated to RelationshipMap.tsx with dynamic ssr:false -- ReactFlow uses browser APIs unavailable during SSR
- [Phase 04-07]: mdiList does not exist in @mdi/js 7.x -- use mdiViewList for list-view toggle buttons
- [Phase 04-07]: Impact analysis overlay rendered on same relationship map (not separate view) per CONTEXT.md locked decision -- colored border/glow on affected nodes, opacity 0.3 on unaffected
- [Phase 05-06]: expo-barcode-scanner used for QR scanning; BarCodeScanner.requestPermissionsAsync() pattern for cross-platform camera permissions
- [Phase 05-06]: Zustand Axios interceptor uses getState() not React hooks — interceptors run outside React component tree
- [Phase 05-06]: Tab accent color from auth store tenantBranding.accentColor with #4f46e5 fallback — dynamic branding without re-mounting navigator
- [Phase 05-06]: QR payload parsed as JSON {serverUrl, tenantId?} with raw URL string fallback — backward compatible with simple URL QR codes
- [Phase 05-04]: [05-04]: Microsoft.Extensions.Configuration.Json/EnvironmentVariables/CommandLine added explicitly to InvAgent.CLI.csproj — Microsoft.Extensions.Hosting does not pull these extension methods into scope by default
- [Phase 05-04]: [05-04]: WmiCollector uses #if WINDOWS conditional compilation guards around System.Management calls — allows cross-platform dotnet build without runtime guard failures while keeping WMI code colocated
- [Phase 05-04]: [05-04]: PrivacyFilter.Apply uses SHA256.HashData returning first 12 hex chars for pseudonymization of hostname/MAC/IP in anonymized tier
- [Phase 05-01]: Agent routes registered in dedicated server.ts scope (not external ApiKey scope) — AgentKey header is a different auth scheme from ApiKey
- [Phase 05-01]: Queue instances created locally in agent route using REDIS_URL env var — follows billing/webhook.ts precedent, avoids cross-app imports from apps/worker
- [Phase 05-01]: CMDB merge guard queries CmdbChangeRecord per field before overwrite — changedBy=USER means skip agent update for that field (manual edits win)
- [Phase 05-02]: Webhook routes pre-existing from partial prior work; only webhook.service.ts and v1 registration needed
- [Phase 05-02]: Asset model has no 'type' field -- plan spec interface was aspirational; manufacturer used instead
- [Phase 05-05]: Microsoft.Extensions.Http.Resilience 9.3.0 requires all extension packages at 9.0.3 — pin transitive deps to resolve NU1605
- [Phase 05-05]: InvAgent.Api uses Microsoft.NET.Sdk.Web with OutputType=Library — class library with ASP.NET Core types; wwwroot included automatically by SDK
- [Phase 05-05]: LocalWebApi.StartAsync runs as background Task from Program.cs — web UI failure cannot crash the daemon
- [Phase 05-07]: @hookform/resolvers added to apps/mobile/package.json — CreateTicketScreen zodResolver requires this package omitted from 05-06 scaffold
- [Phase 05-07]: useAddComment uses FormData multipart/form-data for photo upload (not JSON) — binary blob attachment support
- [Phase 05-07]: expo-image-manipulator compresses to 1920px JPEG 0.7, retries at 1280px/0.5 if still >2MB — enforces 2MB upload limit
- [Phase 05-03]: BullMQ jobId dedup (push:userId:entityId) with 60s removeOnComplete chosen over Redis TTL key for push grouping
- [Phase 05-03]: AlertConfiguration schema has no events field — plan context listed it but actual schema does not; implemented without events
- [Phase 05-09]: qrcode package copied manually to apps/web/node_modules due to mobile app react@18.3.2 blocking pnpm workspace install; dijkstrajs/pngjs deps also copied from pnpm store
- [Phase 05-09]: Alert channel form uses URL blur validation (not submit-only) for immediate Slack hooks.slack.com / Teams https:// feedback
- [Phase 05-08]: expo-device added as explicit dependency — not installed by default despite being expo-notifications peer
- [Phase 05-08]: Offline photos not queued in useAddComment offline path — FormData binary blobs not serializable to AsyncStorage JSON
- [Phase 05-08]: useOfflineSync passes dequeue as argument to replayQueue to avoid stale Zustand closure in async for-loop
- [Phase 06-paperwork-cleanup]: AUTH_RATE_LIMIT shipped as max=50/15min is an intentional deviation from AUTH-08 spec (max=5/15min); logged in PROJECT.md Key Decisions and STATE.md Architecture Decisions during v1.0 paperwork cleanup

### Architecture Decisions

Durable cross-phase architectural decisions. Single source of truth for decisions that outlive a single phase and affect long-term product security/shape.

- **AUTH_RATE_LIMIT = { max: 50, timeWindow: '15 minutes' }** (logged 2026-04-16, Phase 6 paperwork cleanup)
  - **Spec:** AUTH-08 originally specified max=5/15min for auth endpoints (login, signup, form-login, password-reset).
  - **Shipped:** max=50/15min — ten times the spec'd value.
  - **Rationale:** 5 requests per 15 minutes was too aggressive for dev/testing cycles (login + password-reset flows routinely burn >5 attempts during feature work). 50 is the pragmatic shipped value — still two orders of magnitude stricter than the global 100/min default, still materially harder to brute-force than no rate-limit.
  - **Applied in:** `apps/api/src/plugins/rate-limit.ts` (line 5), imported and used in `apps/api/src/routes/auth/login.ts`, `signup.ts`, `form-login.ts`, `password-reset.ts`.
  - **Revisit trigger:** Tighten toward 5/15min if abuse is observed in production, or at v2.0 threat-model review if brute-force resistance is reprioritised.
  - **Source:** Intentional deviation from AUTH-08 spec; also recorded in `.planning/PROJECT.md` Key Decisions table.

### Tracked Follow-ups

- **api-key.test.ts is an `it.todo()` stub, not a real test** (logged 2026-04-16, Phase 6 paperwork cleanup)
  - **File:** `apps/api/src/__tests__/api-key.test.ts`
  - **State:** The `'rejects request without API key header'` test was swapped from a non-functional `expect(true).toBe(true)` placeholder to `it.todo('rejects request without API key header — real test tracked in STATE.md Tracked Follow-ups')`, which vitest reports as pending rather than passing-as-green-lie.
  - **Real test requires:** A protected Fastify route registered behind `apiKeyPreHandler` in the test harness, plus a mock `prisma.apiKey.findFirst` (to return active / expired / inactive / missing scenarios), plus assertions on 401 behaviour for missing header, malformed header, unknown key, inactive key, expired key, and inactive tenant. Non-trivial test infrastructure — deferred from v1.0 to avoid blocking milestone close.
  - **Target:** v2.0 QA milestone, or whichever milestone populates the Nyquist validation suite (`/gsd-validate-phase 1`, currently 0/5 phases compliant per v1.0-MILESTONE-AUDIT.md).
  - **Owner:** Unassigned (tracked in STATE.md until claimed).

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: Stripe webhook idempotency with BullMQ async processing has nuances — run /gsd:research-phase before planning Phase 2
- [Phase 3]: SLA business hours timezone + pause/resume math is non-trivial — run /gsd:research-phase before planning Phase 3
- [Phase 5]: APNs credential setup for dev/TestFlight/production environments — run /gsd:research-phase before planning Phase 5

## Session Continuity

Last session: 2026-04-16T21:37:25.609Z
Stopped at: Completed 06-01-PLAN.md
Resume file: None
