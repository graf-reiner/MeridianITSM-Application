# Phase 2: Billing and Owner Admin - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Stripe subscription lifecycle (embedded Elements checkout, webhook processing, sync-checkout), plan enforcement (planGate middleware with real limits), trial/dunning flow, custom billing management UI, and the full owner admin portal (dashboard with MRR/ARR, tenant management, impersonation, provisioning). Self-service signup flow for new tenants.

</domain>

<decisions>
## Implementation Decisions

### Stripe Integration
- Stripe Elements embedded in the app for checkout (not Stripe Checkout redirect) — full UX control
- POST /billing/sync-checkout endpoint queries Stripe API directly after checkout redirect to handle webhook race condition
- Stripe webhooks processed asynchronously: endpoint enqueues to BullMQ, returns 200 immediately; worker processes with `stripe_webhook_events` idempotency table (UNIQUE constraint on stripeEventId)
- Custom billing management UI built in the app (not Stripe Customer Portal redirect) — update card, view invoices, cancel subscription
- Stripe Node SDK 17.x

### Plan Enforcement
- planGate middleware returns structured 402 JSON: `{ error: 'PLAN_LIMIT_EXCEEDED', limit: 5, current: 5, feature: 'agents', upgradeTier: 'PROFESSIONAL' }`
- Frontend shows inline upgrade prompt at point of action (banner/modal: "You've reached 5 agents. Upgrade to Professional for unlimited.")
- Plan limits and feature flags stored in database (`SubscriptionPlan.planLimitsJson`) — changeable without deploy
- `usePlan()` frontend hook consumes plan config for UI gating
- planGate stub from Phase 1 (`apps/api/src/plugins/plan-gate.ts`) gets real implementation

### Owner Admin Portal
- Full MRR/ARR dashboard with Recharts: revenue charts, trial conversions, churn metrics, recent activity feed
- Tenant list with search/filter by plan, status, name
- Tenant detail: subscription info, usage vs. limits, active users, agent count
- Tenant lifecycle: suspend, unsuspend, delete (soft with 30-day recovery), extend trial, apply grace period
- Read-only tenant impersonation: 15-minute signed token with `impersonatedBy` claim, persistent banner, write ops blocked at API layer
- Internal notes on tenants (visible only in admin)
- Billing dashboard: per-tenant billing detail, retry failed payments
- Plan management: view/edit subscription plans, archive plans
- System operations: worker health, maintenance broadcast, CMDB reconciliation trigger
- Global cross-tenant audit log viewer
- Manual tenant provisioning endpoint

### Tenant Provisioning
- Both self-service and manual provisioning:
  - Self-service: public /signup page with Stripe Elements checkout → auto-provision → welcome email
  - Manual: owner creates tenant via admin portal for enterprise deals
- Provisioning workflow: create Tenant → create TenantSubscription (TRIALING) → create Stripe Customer → seed default roles/categories/SLA → create initial admin User → send welcome email

### Trial & Dunning (using DOCUMENTATION.md spec defaults)
- 14-day trial, dunning email at trial-3d, suspension at expiry
- 3-day grace period manually applied by owner via admin portal
- Suspended tenants: login blocked with paywall page, data preserved
- Trial expiry checked by daily cron/BullMQ job

### Claude's Discretion
- Stripe Elements component styling and form layout
- Recharts chart configurations and color scheme
- Exact error handling for Stripe API failures
- Admin portal page layouts and navigation structure
- Welcome email template content
- Idempotency table cleanup schedule

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Application Specification
- `DOCUMENTATION .md` §11 — SaaS Business Model & Subscription Tiers: plan matrix, feature flags, enforcement architecture, trial flow
- `DOCUMENTATION .md` §12 — Owner Admin Application: architecture, auth, pages, API routes, provisioning workflow
- `DOCUMENTATION .md` §4 — API Surface: billing endpoints (`/api/v1/billing/*`), owner admin endpoints (`/api/admin/*`)

### Project Research
- `.planning/research/STACK.md` — Stripe SDK version, auth approach
- `.planning/research/PITFALLS.md` — Stripe webhook race condition (Pitfall 4), webhook non-idempotency (Pitfall 5), planGate UI enforcement (Pitfall 10)
- `.planning/research/SUMMARY.md` — Phase 2 research flags and billing architecture

### Phase 1 Code (existing patterns)
- `apps/api/src/plugins/plan-gate.ts` — existing no-op stub to replace with real implementation
- `apps/owner/src/lib/owner-auth.ts` — existing owner JWT auth (signOwnerToken, verifyOwnerToken)
- `apps/owner/src/middleware.ts` — existing Edge middleware for owner route protection
- `apps/owner/src/app/api/tenants/route.ts` — existing protected tenant list endpoint
- `packages/db/prisma/schema.prisma` — SubscriptionPlan, TenantSubscription, TenantUsageSnapshot, OwnerUser, OwnerSession, OwnerNote models

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/plugins/plan-gate.ts` — no-op stub, needs real implementation reading TenantSubscription + planLimitsJson
- `apps/owner/src/lib/owner-auth.ts` — owner JWT signing/verification with jose, ready for all admin routes
- `apps/owner/src/middleware.ts` — Edge middleware guarding admin routes, pattern for new routes
- `apps/worker/src/queues/definitions.ts` — queue definition patterns for adding stripe-webhook queue
- `packages/core/src/services/tenant.service.ts` — TenantService with lookup methods, extend for provisioning
- `packages/db/prisma/seed.ts` — existing seed creates 4 SubscriptionPlan records (STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE)

### Established Patterns
- BullMQ workers with `assertTenantId()` pattern — follow for stripe webhook worker
- Fastify plugin architecture — follow for Stripe routes
- Owner admin uses `jose` for JWT (not `@fastify/jwt`) — Edge runtime compatible
- Zod validation on all route inputs — follow for billing endpoints

### Integration Points
- `apps/api/src/plugins/plan-gate.ts` → needs to read TenantSubscription from DB and compare against planLimitsJson
- `apps/api/src/server.ts` → new billing routes register here
- `apps/owner/src/app/` → new admin pages and API routes
- `apps/worker/src/` → new stripe-webhook worker and trial-expiry worker
- `apps/web/src/` → signup page, billing UI pages, upgrade prompts

</code_context>

<specifics>
## Specific Ideas

- The plan enforcement architecture diagram in DOCUMENTATION .md §11 shows the exact middleware flow: Auth → planGate → fetch TenantSubscription (cached Redis, TTL 60s) → compare usage vs planLimitsJson → 402 or proceed
- Owner admin runs on port 3800, uses `admin.internal.yourdomain.com` domain
- Provisioning creates Stripe Customer via Stripe API as part of the workflow
- Impersonation generates a short-lived (15-minute) signed token with `impersonatedBy` claim; persistent banner during session

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-billing-and-owner-admin*
*Context gathered: 2026-03-20*
