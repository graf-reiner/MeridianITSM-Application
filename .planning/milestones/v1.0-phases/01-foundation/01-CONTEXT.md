# Phase 1: Foundation - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning
**Source:** PRD Express Path (DOCUMENTATION .md + research)

<domain>
## Phase Boundary

Monorepo scaffold, full database schema (all 50+ Prisma models), tenant isolation infrastructure, authentication pipeline (JWT + RBAC + API keys), background worker infrastructure, and file storage setup. The monorepo compiles, all services start, every database query is tenant-scoped, and auth works end-to-end with correct isolation between the tenant API and owner admin portal.

</domain>

<decisions>
## Implementation Decisions

### Monorepo Structure
- pnpm 9 workspaces + Turborepo 2 for build orchestration
- Apps: `apps/api` (Fastify 5), `apps/web` (Next.js 16), `apps/owner` (Next.js 16), `apps/worker` (BullMQ process), `apps/mobile` (Expo stub)
- Packages: `packages/db` (Prisma 7), `packages/core` (service layer), `packages/types` (Zod 4 schemas)
- Node.js 22 LTS required (Fastify 5 needs Node 20+)
- Docker Compose for dev services: PostgreSQL 17 (port 5432), Redis 7 (port 6379), MinIO (port 9001), MailHog (port 8025)

### Database Schema
- All 50+ Prisma models defined in Phase 1 (full schema upfront to avoid migration churn in later phases)
- Every table has `tenantId UUID NOT NULL` — non-negotiable
- Prisma query extension (not middleware — extensions are typed) that automatically injects tenantId on every query
- Database seeding: default tenant, system roles (admin, msp_admin, agent, end_user), default categories, default SLA policies, test users (admin@msp.local/Admin123!, agent@msp.local/Agent123!, user@customer.local/User123!)

### Authentication
- Fastify 5 API server with plugin architecture
- @fastify/jwt 9.x for JWT signing/verification (15-min access tokens, 7-day refresh tokens)
- Better Auth 1.x for session management and RBAC primitives — but validate organizations plugin integration in a spike; fallback to pure @fastify/jwt if friction
- bcrypt for password hashing
- Middleware pipeline order: CORS → Auth (JWT verify) → Tenant (extract tenantId) → RBAC (check permissions) → planGate (stub for Phase 2) → Route handler
- API key auth for .NET agent endpoints: hash keys with prefix identification, scoped permissions
- Rate limiting via @fastify/rate-limit with Redis backing: AUTH 5/15min, API 100/min, API_READ 300/min, API_WRITE 30/min, EXPENSIVE 5/min
- Password reset: time-limited token via email link

### Multi-Tenancy
- Shared-schema approach (tenantId column, not schema-per-tenant or RLS)
- Every service function takes `tenantId: string` as explicit first parameter — never infer from context
- Prisma client extension that enforces tenantId on all operations
- Cross-tenant isolation test suite must pass before any feature code
- Tenant model with types: MSP, ENTERPRISE, B2C
- CustomerOrganization model for MSP multi-org management
- Subdomain routing via org-lookup service

### Owner Admin Isolation
- Separate Next.js app on port 3800
- Separate JWT secret (OWNER_JWT_SECRET, distinct from NEXTAUTH_SECRET)
- Separate cookie domain
- Never exposed through Cloudflare or public DNS
- OwnerUser table with bcrypt + TOTP MFA
- No code path in apps/web can authenticate to owner admin

### Infrastructure
- BullMQ workers in separate Node.js process (apps/worker)
- Every job payload includes tenantId as required field; worker asserts before DB access
- MinIO/S3-compatible storage with tenantId-prefixed bucket paths
- AES encryption for stored email passwords
- Health check endpoint at /api/health
- Org lookup service for subdomain-based tenant resolution

### Claude's Discretion
- Exact Turborepo pipeline configuration
- Prisma migration naming conventions
- Redis connection pooling strategy
- Exact folder structure within each app
- Error response format standardization
- Logger implementation (pino recommended for Fastify)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Application Specification
- `DOCUMENTATION .md` — Complete 1900-line application spec covering all data models, API endpoints, frontend pages, mobile architecture, agent architecture, owner admin portal, and SaaS billing model. Sections 2-3 (Architecture & Data Model) are critical for Phase 1.

### Project Research
- `.planning/research/STACK.md` — Technology stack decisions with versions and rationale
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flows, build order
- `.planning/research/PITFALLS.md` — Critical pitfalls to avoid (tenant isolation, owner admin isolation, worker tenant context)
- `.planning/research/SUMMARY.md` — Synthesized research findings

### Project Planning
- `.planning/PROJECT.md` — Project context, core value, constraints
- `.planning/REQUIREMENTS.md` — All 182 v1 requirements with REQ-IDs
- `.planning/ROADMAP.md` — Phase structure and success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — patterns will be established in this phase

### Integration Points
- apps/api serves as the central integration point for all consumers (web, mobile, owner, .NET agent)
- packages/db is shared by apps/api and apps/worker
- packages/core service layer is consumed by both API route handlers and BullMQ workers

</code_context>

<specifics>
## Specific Ideas

- Dev server is Debian at 10.1.200.153 (SSH as root/@theHOUSE2020) — Docker Compose services run there
- Previous production was at https://servicedeskbeta.msaas.online/ on 10.3.200.104 — reference for deployment patterns
- Material Design Icons via @mdi/react + @mdi/js for web (tree-shakeable SVG, NOT webfont)
- React 19.2.1+ mandatory due to CVE-2025-55182 RCE vulnerability
- The .NET agent lives outside the JS monorepo but communicates over HTTP

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-19 via PRD Express Path*
