# Stack Research

**Domain:** Multi-tenant SaaS ITSM platform (separate API + Next.js frontend + React Native mobile + .NET agent)
**Researched:** 2026-03-19
**Confidence:** HIGH (core stack), MEDIUM (mobile layer), HIGH (backing services)

---

## Recommended Stack

### Monorepo Structure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| pnpm | 9.x | Package manager | Workspace-native, fastest installs, symlinked node_modules prevent phantom dependencies |
| Turborepo | 2.x | Build orchestration | Remote caching, parallel task execution, pipeline dependencies — standard for pnpm monorepos with multiple apps |
| TypeScript | 5.7+ | Language across all packages | Full end-to-end type safety; strict mode required |

**Monorepo layout (confirmed pattern for this stack):**
```
apps/
  web/          → Next.js 16 (tenant portal, agent portal)
  api/          → Fastify 5 (REST API server)
  owner/        → Next.js 16 (owner admin portal — fully isolated)
  mobile/       → Expo SDK 55 (React Native iOS + Android)
packages/
  db/           → Prisma schema + generated client
  types/        → Shared TypeScript types and Zod schemas
  config/       → Shared ESLint, TypeScript, Prettier configs
```

---

### Core API Server

**Decision: Fastify 5 over Hono**

Confidence: HIGH

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Fastify | 5.8.x | API HTTP server | Node.js-native; 70-80k req/s vs Hono's adapter overhead in Node; mature plugin ecosystem; first-class TypeScript; JSON schema validation with Zod via `@fastify/type-provider-zod` |
| @fastify/cors | 10.x | CORS handling | Official plugin, production-tested |
| @fastify/jwt | 9.x | JWT verification | Official plugin; integrates with request lifecycle |
| @fastify/multipart | 9.x | File uploads | Ticket attachments, agent binary uploads |
| @fastify/rate-limit | 10.x | Rate limiting | Per-tenant rate limiting for API key consumers |
| @fastify/swagger | 9.x | OpenAPI docs | Auto-generates API spec from schemas for .NET agent and integrations |
| @fastify/type-provider-zod | 4.x | Zod + Fastify bridge | Route-level request/response validation using same Zod schemas as frontend |

**Why Fastify over Hono:** Hono's performance advantage is on edge/serverless runtimes. In the Node.js environment (this platform runs on a Debian server, not Cloudflare Workers), Hono uses a Web Standard API adapter that causes 2-3x throughput degradation vs Fastify. Fastify 5 (current: 5.8.2 as of March 2026) runs Node.js 20+, has a 10+ year plugin ecosystem, and is the production standard for high-throughput Node.js APIs. The schema-first validation model also maps cleanly to the multi-tenant request pipeline.

**Why Fastify over Express:** Express is single-threaded blocking middleware with no built-in TypeScript, no schema validation, and 3-4x lower throughput. It's deprecated for greenfield in 2025.

---

### Frontend — Tenant Web App & Owner Portal

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.x | React framework | App Router stable; Turbopack default; React Compiler 1.0 built-in; PPR for ITSM dashboard performance; use 16.0.7+ for RSC security patch |
| React | 19.2.1+ | UI library | Stable; Server Components reduce JS bundle; required by Next.js 16. Use 19.2.1+ (patches CVE-2025-55182 RCE in RSC Flight protocol) |
| Tailwind CSS | 4.x | Utility CSS | Removed config file overhead in v4; CSS-native; standard for Next.js UI in 2025 |
| shadcn/ui | latest | Component primitives | Headless, copy-paste components; Radix UI base; no version lock-in; works with Tailwind 4 |
| @mdi/react + @mdi/js | 1.x + 7.x | Icons | Project-mandated Material Design Icons; tree-shakeable SVG; no webfont |
| Zustand | 5.x | Client state | Minimal boilerplate; replaces Redux for ITSM dashboards; server state handled by TanStack Query |
| TanStack Query | 5.x | Server state / cache | Data fetching, cache invalidation, optimistic updates for ticket lists, SLA dashboards |
| React Hook Form | 7.x | Form management | Uncontrolled forms with Zod resolver; handles complex ticket/change forms without re-render overhead |
| Zod | 4.x | Validation | Shared with API package; 14x faster runtime validation vs v3; built-in JSON Schema conversion for OpenAPI |

**Owner portal** uses the same Next.js 16 + Tailwind 4 stack but in `apps/owner/`. It runs on a separate domain/port with its own JWT secret — never exposed publicly. Shares `packages/types` but has zero code dependency on the tenant app.

---

### Authentication

**Decision: Custom JWT implementation on the API, Better Auth optional enhancement**

Confidence: MEDIUM (custom JWT is HIGH confidence; Better Auth integration is MEDIUM — newer library)

The architecture is a **separate API server** consuming tokens from a Next.js frontend. Auth.js/NextAuth is tightly coupled to Next.js routes and cannot serve the .NET agent or React Native app directly. Better Auth has first-class Fastify support and native multi-tenancy (organizations plugin), but adds complexity.

**Recommended approach: Custom JWT with @fastify/jwt + Better Auth for session management**

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @fastify/jwt | 9.x | JWT signing + verification | Signs access tokens on login; verifies on every request via preHandler hook; handles API keys as long-lived JWTs |
| Better Auth | 1.x | Session management + organizations | Organizations plugin maps to multi-tenant model; built-in rate limiting, MFA hooks, invitation flows; Fastify integration documented |
| bcrypt (via @node-rs/bcrypt) | 1.x | Password hashing | WASM-native bcrypt; faster than pure-JS; no native binding compile step |

**JWT strategy:**
- Access tokens: 15-minute expiry, signed with tenant-scoped secret
- Refresh tokens: 7-day, stored in database (revocable)
- API keys: Long-lived JWTs with `type: "api_key"` claim, stored hashed in DB
- Owner portal: Separate JWT secret, separate `/owner` auth routes, never share tokens with tenant API
- .NET agent: Machine token issued at registration, rotated periodically

**Why not Auth0/Clerk/Supabase Auth:** External auth SaaS adds per-MAU cost that conflicts with the MSP multi-tenant model where tenants have hundreds of users. Also eliminates control over tenant isolation logic.

---

### Database + ORM

**Decision: PostgreSQL 17 + Prisma 7**

Confidence: HIGH

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PostgreSQL | 17.x | Primary database | JSONB for CMDB CI attributes; recursive CTEs for CI relationships (replacing graph DB); pg_trgm for full-text search on KB articles; proven multi-tenant with tenantId scoping |
| Prisma ORM | 7.x | ORM + migrations | Pure TypeScript engine in v7 (Rust removed); 85-90% smaller bundle; 70% faster type checking; migration system handles 50+ model schema; generates types in `packages/db` |
| Redis | 7.x | Cache + queue backing store | Session cache, rate limit counters, BullMQ job queues |

**Why Prisma 7 over Drizzle:**
- Prisma 7 (released January 2026) eliminated the Rust engine — the primary complaint against Prisma (binary size, cold starts, native compilation) is gone
- Prisma's migration system is mature and auditable — critical for a 50+ model schema that will evolve across paid tiers
- Drizzle's type safety gaps (you can write invalid queries) are unacceptable for a multi-tenant platform where a bad query can leak cross-tenant data
- Drizzle RLS support requires PostgreSQL RLS setup (adds operational complexity); Prisma with tenantId-on-every-query is simpler to audit and enforce at the middleware level
- The 50+ Prisma models already documented in the spec transfer directly; rewriting to Drizzle's TypeScript schema provides no net benefit

**Multi-tenancy enforcement pattern:**
```typescript
// packages/db/src/middleware.ts
prisma.$use(async (params, next) => {
  // Inject tenantId on every query — enforced at ORM middleware layer
  if (ctx.tenantId && params.model !== 'Tenant') {
    params.args.where = { ...params.args.where, tenantId: ctx.tenantId };
  }
  return next(params);
});
```

---

### Background Workers + Queue

**Decision: BullMQ (Redis-backed)**

Confidence: HIGH

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| BullMQ | 5.x | Job queue | Redis-backed; handles SLA monitoring, email dispatch, IMAP polling, CMDB reconciliation, webhook delivery, scheduled reports; retry with exponential backoff; job prioritization |
| BullMQ Board (or Bull Board) | latest | Queue monitoring UI | Admin visibility into worker queues during development and ops |

**Why BullMQ over pg-boss:** Redis is already required (cache, rate limiting). BullMQ delivers better throughput for high-frequency SLA monitoring jobs (scanning all open tickets every minute). pg-boss makes sense only when Redis is absent — it's not absent here.

**Worker processes:**
- `apps/worker/` — Standalone Node.js process (not part of Fastify API); runs BullMQ workers
- Separate deployment unit — scales independently from API
- Queues: `sla-monitor`, `email-outbound`, `email-inbound`, `cmdb-reconcile`, `webhook-delivery`, `reports`

---

### Email

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Nodemailer | 7.x | SMTP outbound | Production email dispatch; supports OAuth2 SMTP; simple API |
| imapflow | 1.x | IMAP inbound (email-to-ticket) | Modern IMAP client; handles IMAP IDLE for near-real-time polling; BullMQ schedules fallback polling |
| React Email | 3.x | Email templates | Component-based HTML email templates; renders to HTML string for Nodemailer |

---

### File Storage

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| MinIO | latest | S3-compatible object storage | Dev server already running MinIO via Docker Compose; identical API to AWS S3 for production migration; handles ticket attachments, KB media, report exports |
| @aws-sdk/client-s3 | 3.x | S3 client | Works with MinIO and real S3; single client for dev and prod |

---

### Mobile App

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Expo SDK | 55.x | React Native framework | Current stable (SDK 55 = RN 0.83); New Architecture always-on in SDK 55; EAS Build for iOS/Android distribution |
| React Native | 0.83.x | Mobile runtime | Bundled with Expo SDK 55; New Architecture (Fabric + JSI) stable |
| expo-notifications | latest | Push notifications | Handles FCM (Android) + APNs (iOS) via Expo push service or direct native tokens |
| expo-secure-store | latest | Token storage | Secure, hardware-backed storage for JWT tokens (replaces AsyncStorage for auth) |
| TanStack Query | 5.x | API data fetching | Same library as web; consistent caching patterns; works with React Native |
| react-native-vector-icons | 10.x | Icons | Project constraint: MDI via react-native-vector-icons on mobile |
| Expo Router | 4.x | File-based navigation | File-system routing (same mental model as Next.js App Router); deep linking; works with Expo SDK 55 |

**Why Expo over bare React Native:** EAS Build eliminates the Xcode/Android Studio local dependency for CI. Expo SDK 55 has New Architecture always-on — no legacy bridge. Push notification credential management through EAS is significantly simpler than maintaining APNs certificates manually.

---

### .NET Inventory Agent

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| .NET | 9.0 | Runtime | LTS-aligned; cross-platform Windows/Linux/macOS; single-file publish for agent distribution |
| Hardware.Info | 101.x | Hardware discovery | .NET Standard 2.0 library; WMI on Windows, /proc + /sys on Linux, system_profiler on macOS; zero external dependencies |
| System.Net.Http (HttpClient) | built-in | API reporting | Ships with .NET 9; posts inventory payloads to Fastify API with machine JWT |
| Microsoft.Extensions.Hosting | 9.x | Windows Service / systemd | Same hosting abstraction for Windows Service and Linux systemd service |

**Distribution:** Single-file publish (`dotnet publish -r win-x64 --self-contained -p:PublishSingleFile=true`). Repeat for `linux-x64` and `osx-arm64`. Owner portal hosts download links per-tenant.

---

### Billing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Stripe | Node SDK 17.x | Subscription billing | Standard for SaaS; handles subscription lifecycle, dunning, trial expiry, webhook events |
| stripe-webhook-parser | or raw | Webhook verification | Verify `stripe-signature` header before processing; built into Stripe SDK |

**planGate middleware pattern:**
```typescript
// Fastify preHandler: checks tenant.plan against feature flags
fastify.addHook('preHandler', planGateHook);
```
Plan enforcement at the API layer — not the frontend. Frontend can show upgrade prompts, but the API enforces limits.

---

### Infrastructure (Dev + Production Path)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Docker Compose | v2 | Dev backing services | PostgreSQL 17, Redis 7, MinIO, MailHog — already configured on Debian dev server |
| Node.js | 22.x (LTS) | API + worker runtime | Current LTS; required by Fastify 5 (Node 20+ minimum); 22 is the 2025-2026 LTS |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Hono (on Node.js) | Uses Web Standard API adapter in Node.js environment; 2-3x throughput loss vs Fastify; advantage only exists on edge runtimes (Cloudflare Workers, Deno Deploy) — this platform runs on Node.js | Fastify 5 |
| Express | No TypeScript, no schema validation, 3-4x slower than Fastify, no longer recommended for greenfield | Fastify 5 |
| Auth.js / NextAuth | Tightly coupled to Next.js routes; cannot authenticate .NET agent or React Native app against a separate API; session management requires Next.js to be in the auth path | Custom @fastify/jwt + Better Auth |
| Drizzle ORM (alone) | Type safety gaps allow writing invalid queries — unacceptable in multi-tenant data isolation; no migration story comparable to Prisma for 50+ model schemas | Prisma 7 |
| Prisma 6 | Rust engine (binary download, native compilation issues, large bundle) — already obsolete; Prisma 7 (pure TypeScript) released January 2026 | Prisma 7 |
| tRPC | Excellent for monolithic Next.js apps but wrong for this architecture: .NET agent and React Native app need standard REST/JSON; tRPC client cannot run in .NET; adds coupling between API and frontend | REST + Zod for type sharing |
| AsyncStorage (React Native) | Not encrypted; not suitable for storing JWT tokens; deprecated for sensitive data | expo-secure-store |
| Bull (v3) | Predecessor to BullMQ; no longer maintained; BullMQ is the successor with breaking API changes | BullMQ 5.x |
| Next.js 15 (for new start) | Already at 16.x stable; no reason to start on previous major | Next.js 16.x |
| React 19.0.x, 19.1.x | Critical RCE vulnerability (CVE-2025-55182) in RSC Flight protocol; patched in 19.2.1 | React 19.2.1+ |

---

## Alternatives Considered

| Category | Recommended | Alternative | When Alternative Makes Sense |
|----------|-------------|-------------|------------------------------|
| API Framework | Fastify 5 | Hono | Building for Cloudflare Workers or Deno Deploy (edge runtime), not a persistent Node.js server |
| API Framework | Fastify 5 | NestJS | Large enterprise team that wants Angular-style DI and decorators; adds ~40% boilerplate overhead for an MVP |
| ORM | Prisma 7 | Drizzle | Starting fresh with <10 models and no migration history; team is SQL-proficient and wants thin abstraction |
| Queue | BullMQ | pg-boss | Redis is not in the stack at all; simpler deployments where Postgres is the only backing service |
| Queue | BullMQ | Temporal | Complex multi-step workflows with human approval (CAB meetings); overkill for v1 SLA monitoring |
| Auth | @fastify/jwt + Better Auth | Clerk | Fully managed auth where per-MAU cost is acceptable; eliminates auth implementation entirely |
| Frontend | Next.js 16 | Remix | Prefer Web standard APIs and loader/action pattern; less ecosystem for ITSM dashboard complexity |
| Mobile | Expo SDK 55 | Bare React Native | Need full native module control outside Expo ecosystem; adds significant CI/CD complexity |
| Email | Nodemailer + imapflow | Postmark/SendGrid | High-volume transactional email where SMTP limits apply; adds per-email cost |

---

## Stack Patterns by Variant

**For Owner Admin Portal (fully isolated):**
- Separate Next.js 16 app in `apps/owner/`
- Separate JWT secret (`OWNER_JWT_SECRET`) — never shared with tenant API
- Separate Fastify route group `/owner/*` or separate Fastify instance on different port
- Never expose owner portal routes publicly; reverse proxy restricts to VPN/internal

**For Email-to-Ticket ingest:**
- BullMQ recurring job polls IMAP every 60 seconds using imapflow
- IMAP IDLE for near-real-time when the mail server supports it
- Each tenant has its own IMAP credentials stored encrypted in DB

**For SLA monitoring:**
- BullMQ `sla-monitor` queue: delayed jobs set at ticket creation
- Job fires when SLA breach time arrives; marks breach, sends alert
- Re-queued on ticket update if SLA window changes

**For CMDB recursive relationships:**
- PostgreSQL recursive CTEs (`WITH RECURSIVE`) for CI impact chain traversal
- No graph database needed for v1 (confirmed out-of-scope decision)
- Prisma raw queries for the CTE path; typed result via `$queryRaw`

---

## Version Compatibility Matrix

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 16.x | React 19.2.1+ | Next.js 16 requires React 19; use 19.2.1+ for RSC security patch |
| Fastify 5.x | Node.js 20+ | Node.js 22 LTS recommended; drops Node 18 support |
| Prisma 7.x | PostgreSQL 12+ | Pure TypeScript engine; no Rust binary; works with PG 17 |
| Expo SDK 55 | React Native 0.83 | New Architecture always-on; no opt-out |
| BullMQ 5.x | Redis 6.2+ | Requires Redis streams; Redis 7.x recommended |
| Zod 4.x | TypeScript 5.5+ | Improved type inference; 14x faster validation vs v3 |
| Better Auth 1.x | Fastify 5 | Official Fastify integration documented; organizations plugin for multi-tenancy |
| @fastify/jwt 9.x | Fastify 5 | Peer dependency on Fastify 5; do not use v8 with Fastify 5 |

---

## Installation (Monorepo Bootstrap)

```bash
# Root
pnpm init
pnpm add -D turborepo typescript @types/node

# API (apps/api)
pnpm add fastify @fastify/jwt @fastify/cors @fastify/multipart @fastify/rate-limit @fastify/swagger @fastify/type-provider-zod
pnpm add better-auth @node-rs/bcrypt

# Database (packages/db)
pnpm add prisma @prisma/client
pnpm add -D prisma

# Queue (apps/worker)
pnpm add bullmq ioredis

# Email
pnpm add nodemailer imapflow react-email

# Storage
pnpm add @aws-sdk/client-s3

# Billing
pnpm add stripe

# Web (apps/web, apps/owner)
pnpm add next react react-dom tailwindcss @tanstack/react-query zustand react-hook-form zod @hookform/resolvers @mdi/react @mdi/js

# Shared types (packages/types)
pnpm add zod

# Mobile (apps/mobile)
pnpm add expo expo-router expo-notifications expo-secure-store @tanstack/react-query react-native-vector-icons
```

---

## Sources

- [Hono vs Fastify — Better Stack](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/) — Confirmed Node.js adapter performance degradation for Hono; MEDIUM confidence
- [Fastify v5 GA — OpenJS Foundation](https://openjsf.org/blog/fastifys-growth-and-success) — Fastify 5 release confirmation; HIGH confidence
- [Fastify npm (5.8.2)](https://www.npmjs.com/package/fastify) — Current version as of March 2026; HIGH confidence
- [Prisma 7.0 announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) — Pure TypeScript engine, January 2026 release; HIGH confidence
- [Prisma Rust-free production ready](https://www.prisma.io/blog/rust-free-prisma-orm-is-ready-for-production) — Confirmed production-ready; HIGH confidence
- [Next.js 16 blog post](https://nextjs.org/blog/next-16) — Release details, Turbopack default; HIGH confidence
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16) — Breaking changes; HIGH confidence
- [React RSC RCE vulnerability](https://snyk.io/blog/security-advisory-critical-rce-vulnerabilities-react-server-components/) — CVE-2025-55182; HIGH confidence — use patched versions
- [Better Auth + Fastify integration](https://better-auth.com/docs/integrations/fastify) — Official Fastify plugin; MEDIUM confidence (newer library)
- [Better Auth multi-tenancy](https://peerlist.io/shrey_/articles/building-better-auth-in-fastify-multitenant-saas-and-secure-api-authentication) — Multi-tenant implementation guide; MEDIUM confidence
- [Zod v4 release — InfoQ](https://www.infoq.com/news/2025/08/zod-v4-available/) — Performance numbers verified; HIGH confidence
- [Expo SDK 55 changelog](https://expo.dev/changelog) — SDK 55 = RN 0.83, New Architecture always-on; HIGH confidence
- [BullMQ official site](https://bullmq.io/) — Production queue with Redis; HIGH confidence
- [Hardware.Info NuGet](https://www.nuget.org/packages/Hardware.Info) — .NET cross-platform hardware discovery; MEDIUM confidence
- [Drizzle ORM RLS](https://orm.drizzle.team/docs/rls) — RLS support confirmed; MEDIUM confidence (why Prisma still wins for this use case)
- [Drizzle vs Prisma — bytebase](https://www.bytebase.com/blog/drizzle-vs-prisma/) — Updated 2026 comparison; MEDIUM confidence
- [tRPC vs REST analysis](https://www.wisp.blog/blog/when-to-choose-rest-over-trpc-a-comparative-analysis) — Separate API server rationale for REST; HIGH confidence

---
*Stack research for: MeridianITSM — multi-tenant SaaS ITSM platform*
*Researched: 2026-03-19*
