---
phase: 02-billing-and-owner-admin
verified: 2026-03-20T16:00:00Z
status: passed
score: 20/20 must-haves verified
re_verification: false
human_verification:
  - test: "Stripe Elements checkout form renders and accepts card input"
    expected: "PaymentElement renders inside Elements wrapper; user can enter card details and submit"
    why_human: "Requires browser + Stripe test keys; cannot verify Stripe.js rendering programmatically"
  - test: "TOTP QR code scans into authenticator app and verification succeeds"
    expected: "QR code from /api/auth/totp-setup displays correctly; code from app is accepted by /api/auth/totp-verify"
    why_human: "Requires physical authenticator app and camera; cannot simulate TOTP time-window programmatically"
  - test: "Impersonation session enters tenant app in read-only mode with persistent banner"
    expected: "Impersonation token accepted by apps/web; write operations return 403 READ_ONLY_SESSION; banner visible"
    why_human: "Requires running apps/web + apps/owner together; banner display is UI behavior"
  - test: "Owner admin dashboard MRR/ARR Recharts chart renders with live data"
    expected: "LineChart shows 12 months of MRR/ARR data from /api/dashboard"
    why_human: "Requires running owner app with seeded data; Recharts rendering is visual"
  - test: "BullMQ queue health cards reflect real queue job counts"
    expected: "System page auto-refreshes every 30s; queue counts reflect actual Redis state"
    why_human: "Requires Docker services running (Redis); queue state is runtime behavior"
---

# Phase 02: Billing & Owner Admin — Verification Report

**Phase Goal:** Stripe billing backend, plan enforcement, checkout flow, owner admin portal with MFA, impersonation, tenant management, and system tools.
**Verified:** 2026-03-20T16:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Stripe webhook events are received, signature-verified, and enqueued to BullMQ without inline processing | VERIFIED | `webhook.ts`: `constructEvent` + `stripeWebhookQueue.add` + immediate 200 return |
| 2 | Duplicate Stripe events are detected via idempotency table and not processed twice | VERIFIED | `stripe-webhook.ts`: `stripeWebhookEvent.findUnique` + skip if `processedAt` set |
| 3 | Subscription status changes from Stripe are reflected in TenantSubscription table | VERIFIED | `stripe-webhook.ts`: `handleSubscriptionUpsert/Canceled/PaymentFailed/Succeeded` update DB |
| 4 | Daily usage snapshots are recorded per tenant | VERIFIED | `usage-snapshot.ts`: `tenantUsageSnapshot.upsert` registered as 2 AM cron in `index.ts` |
| 5 | A request from a tenant exceeding plan limits receives a 402 PLAN_LIMIT_EXCEEDED with structured JSON | VERIFIED | `plan-gate.ts`: `redis.get/setex` + `tenantSubscription.findUnique` + 402 with `limit/current/feature/upgradeTier` |
| 6 | A request from a tenant with CANCELED or SUSPENDED subscription receives 402 SUBSCRIPTION_INACTIVE | VERIFIED | `plan-gate.ts`: status check returns 402 `SUBSCRIPTION_INACTIVE` |
| 7 | Frontend can read current plan tier, limits, and features via usePlan() hook | VERIFIED | `usePlan.ts`: `useQuery` fetching `/api/v1/billing/plan`, staleTime 60s, `hasFeature/isActive/isTrial/isWithinLimit` |
| 8 | A tenant can select a plan and complete checkout via Stripe Elements | VERIFIED | `CheckoutForm.tsx`: `PaymentElement` + `loadStripe` + `confirmPayment`; POST to `/api/v1/billing/create-checkout-intent` |
| 9 | After checkout redirect, sync-checkout resolves webhook race condition | VERIFIED | `success/page.tsx`: `useEffect` POSTs `/api/v1/billing/sync-checkout`; `sync-checkout.ts`: `stripe.subscriptions.retrieve` + `redis.del` |
| 10 | A trial tenant is suspended at expiry via daily worker with 3-day dunning warning | VERIFIED | `trial-expiry.ts`: `trial-expiring` at T-3d, `SUSPENDED` at T=0 with `redis.del` cache invalidation |
| 11 | Owner login flow supports TOTP MFA (password → tempToken → TOTP verify → session) | VERIFIED | `login/route.ts`: `requiresTotp: true` + tempToken; `totp-verify/route.ts`: `verifyTotp` → full session |
| 12 | IP allowlist middleware blocks requests from non-allowed IPs | VERIFIED | `middleware.ts`: `OWNER_ADMIN_IP_ALLOWLIST` CIDR check before JWT, returns 403 if not in allowlist |
| 13 | Impersonation token is a 15-minute JWT with impersonatedBy and readOnly claims | VERIFIED | `impersonation.ts`: `generateImpersonationToken` with `readOnly: true`, `IMPERSONATION_JWT_SECRET`, `setExpirationTime('15m')` |
| 14 | API blocks all write operations for impersonation sessions | VERIFIED | `impersonation-guard.ts`: `blockImpersonationWrites` registered as preHandler in `server.ts`; blocks on `readOnly===true` |
| 15 | Owner can view dashboard with MRR/ARR, trial conversions, churn, tenant counts | VERIFIED | `dashboard/page.tsx`: `RevenueChart` + stat cards; `api/dashboard/route.ts`: calculates MRR, ARR, 12-month history |
| 16 | Owner can manage tenants: list, detail, lifecycle actions, impersonation, notes | VERIFIED | All lifecycle actions present (`suspend/unsuspend/delete/extend_trial/apply_grace_period`); impersonate → `generateImpersonationToken`; notes CRUD |
| 17 | Owner can manually provision a new tenant | VERIFIED | `provisioning.ts`: transactional `provisionTenant` (Tenant + TenantSubscription TRIALING + roles + SLAs + admin User); `api/provision/route.ts` wired |
| 18 | Owner can view billing dashboard and retry failed payments | VERIFIED | `owner/api/billing/route.ts`: MRR calc; `retry/route.ts`: `retryInvoice` → `stripe.invoices.pay`; billing page has retry button |
| 19 | Owner can view and edit subscription plan definitions | VERIFIED | `plans/[id]/route.ts`: PUT with Zod `limitsJson` validation; `plans/page.tsx`: inline edit with save |
| 20 | Owner can view system health and cross-tenant audit log | VERIFIED | `system/route.ts`: `getJobCounts` per queue + maintenance broadcast; `audit/route.ts`: `auditLog.findMany` without tenantId filter |

**Score:** 20/20 truths verified

---

## Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `packages/db/prisma/schema.prisma` | StripeWebhookEvent model | VERIFIED | `model StripeWebhookEvent` with `@unique` on `stripeEventId`, `processedAt`, mapped to `stripe_webhook_events` |
| `apps/api/src/services/stripe.service.ts` | Stripe SDK singleton | VERIFIED | `new Stripe(...)`, exports `mapStripeStatus`, `getUpgradeTier` |
| `apps/api/src/routes/billing/webhook.ts` | POST /billing/webhook | VERIFIED | `constructEvent`, raw `Buffer` via `preParsing`, `stripeWebhookQueue.add`, returns 200 |
| `apps/api/src/routes/billing/create-checkout-intent.ts` | Deferred intent checkout | VERIFIED | `payment_behavior: 'default_incomplete'`, returns `clientSecret` |
| `apps/api/src/routes/billing/sync-checkout.ts` | Race condition resolver | VERIFIED | `stripe.subscriptions.retrieve`, `redis.del` plan cache |
| `apps/api/src/routes/billing/invoices.ts` | Invoice listing | VERIFIED | `stripe.invoices.list` |
| `apps/api/src/routes/billing/payment-method.ts` | Payment method update | VERIFIED | `paymentMethods.attach` + `customers.update` |
| `apps/api/src/routes/billing/cancel.ts` | Subscription cancel | VERIFIED | `cancel_at_period_end: true` |
| `apps/api/src/plugins/plan-gate.ts` | Real planGate middleware | VERIFIED | `PLAN_LIMIT_EXCEEDED`, `SUBSCRIPTION_INACTIVE`, `NO_SUBSCRIPTION`, `redis.get/setex`, `tenantSubscription.findUnique`, `upgradeTier` |
| `packages/core/src/plan-config.ts` | Plan tier constants | VERIFIED | `PlanResource`, `isFeatureResource`, `getLimitKey`, `NUMERIC_RESOURCES`, `FEATURE_RESOURCES` |
| `apps/api/src/routes/v1/billing-plan.ts` | GET /api/v1/billing/plan | VERIFIED | Returns tier/status/limits/trialEnd; registered via `billingPlanRoutes` in `v1/index.ts` |
| `apps/web/src/hooks/usePlan.ts` | React plan hook | VERIFIED | `useQuery`, `staleTime: 60_000`, `hasFeature`, `isActive`, `isTrial`, `isWithinLimit` |
| `apps/web/src/app/signup/CheckoutForm.tsx` | Stripe Elements form | VERIFIED | `PaymentElement`, `loadStripe`, `confirmPayment`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| `apps/web/src/app/billing/page.tsx` | Billing management UI | VERIFIED | `usePlan`, fetches `/api/v1/billing/invoices`, `/api/v1/billing/cancel` |
| `apps/web/src/app/billing/success/page.tsx` | Post-checkout success | VERIFIED | `useEffect` calls `/api/v1/billing/sync-checkout` |
| `apps/worker/src/workers/stripe-webhook.ts` | BullMQ webhook worker | VERIFIED | `stripeWebhookEvent.findUnique`, idempotency skip, event routing, `processedAt` mark, `redis.del` |
| `apps/worker/src/workers/stripe-webhook.test.ts` | Idempotency tests | VERIFIED | 8 tests; idempotency skip covered |
| `apps/worker/src/workers/usage-snapshot.ts` | Daily usage cron | VERIFIED | `tenantUsageSnapshot.upsert`, 2 AM cron registered in `index.ts` |
| `apps/worker/src/workers/trial-expiry.ts` | Trial expiry worker | VERIFIED | `trial-expiring` at T-3d, `SUSPENDED` at T=0, `redis.del`, 6 AM cron |
| `apps/worker/src/queues/definitions.ts` | Queue definitions | VERIFIED | `STRIPE_WEBHOOK`, `TRIAL_EXPIRY`, `USAGE_SNAPSHOT` with queue instances |
| `apps/owner/src/lib/totp.ts` | TOTP library | VERIFIED | `generateTotpSecret`, `generateQrCode`, `verifyTotp`, issuer `MeridianITSM` |
| `apps/owner/src/lib/impersonation.ts` | Impersonation tokens | VERIFIED | `generateImpersonationToken`, `readOnly: true`, `IMPERSONATION_JWT_SECRET`, 15-minute expiry |
| `apps/owner/src/app/api/auth/login/route.ts` | TOTP-aware login | VERIFIED | `totpEnabled` branch, `requiresTotp: true`, `tempToken` |
| `apps/owner/src/app/api/auth/totp-verify/route.ts` | TOTP second step | VERIFIED | `verifyTotp`, full session on success |
| `apps/owner/src/app/api/auth/totp-setup/route.ts` | TOTP enrollment | VERIFIED | Two-step generate + enable flow |
| `apps/owner/src/middleware.ts` | IP allowlist | VERIFIED | `OWNER_ADMIN_IP_ALLOWLIST`, CIDR bitwise match, 403 on reject, optional for dev |
| `apps/api/src/middleware/impersonation-guard.ts` | Write-block guard | VERIFIED | `READ_ONLY_SESSION`, checks `readOnly` + `impersonatedBy`, registered in `server.ts` |
| `apps/owner/src/lib/provisioning.ts` | Tenant provisioning | VERIFIED | `provisionTenant`, `$transaction`, TRIALING 14-day, roles/SLAs/categories/admin user |
| `apps/owner/src/app/api/dashboard/route.ts` | Dashboard metrics API | VERIFIED | `mrr`, `arr`, `mrrHistory`, tenant counts |
| `apps/owner/src/app/api/tenants/route.ts` | Tenant list API | VERIFIED | `search`, `plan`, `status` filter params, `page`/`limit`/`pageCount` pagination |
| `apps/owner/src/app/api/tenants/[id]/lifecycle/route.ts` | Lifecycle actions | VERIFIED | All 5 actions: `suspend/unsuspend/delete/extend_trial/apply_grace_period` |
| `apps/owner/src/app/api/tenants/[id]/impersonate/route.ts` | Impersonation trigger | VERIFIED | `generateImpersonationToken`, returns `impersonationToken` + `expiresAt` |
| `apps/owner/src/app/api/tenants/[id]/notes/route.ts` | Internal notes CRUD | VERIFIED | GET + POST for OwnerNote records |
| `apps/owner/src/lib/stripe-admin.ts` | Stripe admin helpers | VERIFIED | `retryInvoice` → `stripe.invoices.pay`, `listTenantInvoices` |
| `apps/owner/src/app/api/billing/route.ts` | Billing overview API | VERIFIED | `totalMrr` calculation, per-tenant billing grouped by status |
| `apps/owner/src/app/api/billing/[tenantId]/retry/route.ts` | Payment retry | VERIFIED | `retryInvoice` called with open invoice ID |
| `apps/owner/src/app/api/plans/[id]/route.ts` | Plan CRUD | VERIFIED | PUT with Zod `limitsJson` validation; tier non-editable |
| `apps/owner/src/app/api/system/route.ts` | System health API | VERIFIED | `getJobCounts` per queue + maintenance broadcast via Redis |
| `apps/owner/src/app/api/audit/route.ts` | Cross-tenant audit log | VERIFIED | `auditLog.findMany` without mandatory tenantId filter |
| `apps/owner/src/app/(admin)/dashboard/page.tsx` | Dashboard UI | VERIFIED | `RevenueChart`, MRR/ARR stat cards, recent tenants |
| `apps/owner/src/app/(admin)/tenants/page.tsx` | Tenant list UI | VERIFIED | Debounced search, plan/status filters, pagination |
| `apps/owner/src/app/(admin)/tenants/[id]/page.tsx` | Tenant detail UI | VERIFIED | Lifecycle buttons, impersonate trigger, notes CRUD, confirmation dialogs |
| `apps/owner/src/components/RevenueChart.tsx` | Revenue chart | VERIFIED | Recharts `LineChart` with MRR and ARR lines |
| `apps/owner/src/app/(admin)/billing/page.tsx` | Owner billing UI | VERIFIED | MRR display, retry button for PAST_DUE tenants |
| `apps/owner/src/app/(admin)/plans/page.tsx` | Plans management UI | VERIFIED | `limitsJson` fields, `isPublic` toggle, inline edit |
| `apps/owner/src/app/(admin)/system/page.tsx` | System ops UI | VERIFIED | Queue health cards, maintenance broadcast input |
| `apps/owner/src/app/(admin)/audit/page.tsx` | Audit log UI | VERIFIED | Filters by tenantId/action/resource/date, expandable diff rows |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `webhook.ts` | `stripe-webhook.ts` (worker) | `stripeWebhookQueue.add` | WIRED | Queue name `'stripe-webhook'` matches `QUEUE_NAMES.STRIPE_WEBHOOK` |
| `stripe-webhook.ts` | `schema.prisma` | `prisma.stripeWebhookEvent` | WIRED | `findUnique`, `upsert`, `update` all present |
| `plan-gate.ts` | `TenantSubscription` (Prisma) | `tenantSubscription.findUnique` | WIRED | Cache miss path queries DB |
| `plan-gate.ts` | `redis.ts` | `redis.get/setex` | WIRED | 60s TTL cache on `plan:${tenantId}` |
| `usePlan.ts` | `billing-plan.ts` | `fetch('/api/v1/billing/plan')` | WIRED | Exact path matches Fastify route registration |
| `CheckoutForm.tsx` | `create-checkout-intent.ts` | `fetch('/api/v1/billing/create-checkout-intent')` | WIRED | POST confirmed in CheckoutForm onSubmit |
| `success/page.tsx` | `sync-checkout.ts` | `fetch('/api/v1/billing/sync-checkout')` | WIRED | useEffect POST on mount |
| `billing/page.tsx` | `invoices.ts`, `cancel.ts`, `payment-method.ts` | fetch calls | WIRED | `/api/v1/billing/invoices`, `/api/v1/billing/cancel` confirmed in billing page |
| `login/route.ts` | `totp.ts` | `totpEnabled` branch | WIRED | `totpEnabled` check present, tempToken issued |
| `impersonation-guard.ts` | `server.ts` | `addHook('preHandler')` | WIRED | `blockImpersonationWrites` confirmed in `server.ts` line 45 |
| `tenants/[id]/page.tsx` | `lifecycle/route.ts` | `fetch('/api/tenants/[id]/lifecycle')` | WIRED | Lifecycle POST confirmed in tenant detail page |
| `api/provision/route.ts` | `provisioning.ts` | `provisionTenant()` | WIRED | `provisionTenant` import and call confirmed |
| `billing/[tenantId]/retry/route.ts` | `stripe-admin.ts` | `retryInvoice()` | WIRED | Confirmed in retry route |
| `audit/route.ts` | `AuditLog` (Prisma) | `auditLog.findMany` without tenantId | WIRED | Cross-tenant query intentionally omits tenantId |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILL-01 | 02-01, 02-03 | Stripe subscription integration with 4 tiers | SATISFIED | Webhook pipeline + checkout flow covers full lifecycle |
| BILL-02 | 02-02 | planGate middleware enforces plan limits (402) | SATISFIED | `plan-gate.ts` real implementation with Redis cache |
| BILL-03 | 02-03 | Trial flow: 14-day → dunning at T-3d → suspension at expiry | SATISFIED | `trial-expiry.ts` implements both dunning and suspension |
| BILL-04 | 02-01 | Stripe webhook handler for subscription lifecycle events | SATISFIED | `stripe-webhook.ts` handles created/updated/deleted/failed/succeeded |
| BILL-05 | 02-03 | Self-service billing portal | SATISFIED | Custom UI (not Customer Portal) per CONTEXT.md override; invoices/cancel/payment-method all implemented |
| BILL-06 | 02-01 | Daily tenant usage snapshots | SATISFIED | `usage-snapshot.ts` — activeUsers captured; agents/tickets/storage are intentional phase-4 placeholders |
| BILL-07 | 02-02 | Plan feature flags gated by subscription tier | SATISFIED | `plan-gate.ts` `isFeatureResource` check against `features[]` array |
| OADM-01 | 02-04 | Separate owner app with isolated auth (OwnerUser, bcrypt + TOTP MFA) | SATISFIED | `apps/owner` on port 3800; two-step TOTP MFA implemented |
| OADM-02 | 02-04 | IP allowlist middleware | SATISFIED | `middleware.ts` CIDR bitwise check on `OWNER_ADMIN_IP_ALLOWLIST` |
| OADM-03 | 02-05 | Dashboard with MRR/ARR, trial conversions, churn, tenant counts | SATISFIED | `dashboard/page.tsx` + `api/dashboard/route.ts` with 12-month MRR history |
| OADM-04 | 02-05 | Tenant list with search/filter; detail with subscription and usage | SATISFIED | Search/plan/status filters, pagination; detail with usage counts |
| OADM-05 | 02-05 | Tenant lifecycle: suspend/unsuspend/delete/extend_trial/grace_period | SATISFIED | All 5 actions in `lifecycle/route.ts` and `tenants/[id]/page.tsx` |
| OADM-06 | 02-04 | Read-only impersonation with 15-minute signed token | SATISFIED | `impersonation.ts` + `impersonation-guard.ts` write-blocking |
| OADM-07 | 02-05 | Internal notes on tenants (admin only) | SATISFIED | `notes/route.ts` GET/POST; notes section in tenant detail UI |
| OADM-08 | 02-06 | Billing dashboard: Stripe revenue, per-tenant detail, retry failed payments | SATISFIED | `owner/api/billing/route.ts` + retry endpoint + billing UI page |
| OADM-09 | 02-06 | Plan management: view/edit subscription plans, archive | SATISFIED | `plans/[id]/route.ts` PUT with Zod validation; `isPublic` archive toggle |
| OADM-10 | 02-06 | System operations: worker health, maintenance broadcast | SATISFIED | `system/route.ts` with `getJobCounts` + Redis maintenance key; system UI page |
| OADM-11 | 02-06 | Global cross-tenant audit log viewer | SATISFIED | `audit/route.ts` queries AuditLog without tenantId filter; filters in UI |
| OADM-12 | 02-05 | Manual tenant provisioning endpoint | SATISFIED | `api/provision/route.ts` → `provisionTenant()` transactional function |

**All 20 requirements satisfied.** No orphaned requirements found.

---

## Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `usage-snapshot.ts` lines 46-48 | `activeAgents = 0`, `ticketCount = 0`, `storageBytes = 0` | Info | Intentional phase-deferred placeholders; documented in comments as Phase 4 and storage module work. Only `activeUsers` is computed now, which is the core BILL-06 requirement. |
| `owner/app/(admin)/*.tsx` — multiple | `return null` on SSR guard | Info | `typeof window === 'undefined'` guard pattern for 'use client' components; not a stub, correct SSR protection. |
| `owner/app/(admin)/billing/page.tsx` line 115 | `if (!data) return null` | Info | Loading state guard, not a stub. Data is fetched and rendered when available. |

No blocker anti-patterns found. All identified patterns are either intentional and documented, or standard React/Next.js patterns.

---

## Human Verification Required

### 1. Stripe Elements Checkout Rendering

**Test:** Open `/signup` in browser with STRIPE_PUBLISHABLE_KEY set. Select a plan and advance to checkout. Observe if PaymentElement renders and accepts test card `4242 4242 4242 4242`.
**Expected:** Card input renders with Stripe Elements styling; form submits; redirect to `/billing/success` occurs.
**Why human:** Requires browser + live Stripe.js CDN load; PaymentElement rendering is client-only behavior.

### 2. TOTP MFA Login and Setup

**Test:** In owner admin, log in with correct password. Observe `requiresTotp: true` response. Scan QR code from `/api/auth/totp-setup` with Google Authenticator. Enter code at `/api/auth/totp-verify`.
**Expected:** QR code renders correctly; authenticator accepts and generates valid codes; second-step verification issues full session tokens.
**Why human:** Requires physical authenticator app; TOTP time-window validation cannot be simulated.

### 3. Impersonation Read-Only Enforcement in apps/web

**Test:** Generate an impersonation token from owner admin. Use it to access `apps/web`. Attempt a POST (e.g., create ticket). Observe banner and 403 response.
**Expected:** Banner "You are impersonating [tenant]" visible; POST returns 403 READ_ONLY_SESSION; GET requests succeed.
**Why human:** Requires both apps running; persistent banner display is visual/runtime behavior.

### 4. Owner Dashboard Revenue Chart with Live Data

**Test:** Seed 3+ tenants with different subscription states. Open owner admin dashboard.
**Expected:** Stat cards show correct counts; RevenueChart LineChart renders MRR/ARR lines for last 12 months.
**Why human:** Requires seeded data + running owner app; Recharts rendering is visual.

### 5. BullMQ Queue Health on System Page

**Test:** Ensure Docker services are running. Open owner admin system page. Check queue health cards.
**Expected:** Cards show real job counts for all 7 queues; auto-refresh every 30s updates counts; maintenance broadcast stores message in Redis.
**Why human:** Requires Docker running (Redis + BullMQ); queue state is runtime, not verifiable via grep.

---

## Gaps Summary

None. All 20 must-haves verified. All 20 requirement IDs accounted for across the 6 plans. No missing artifacts, no stubs in critical paths, all key links wired.

**Notable design decision:** BILL-05 in REQUIREMENTS.md specifies "Stripe Customer Portal redirect" but CONTEXT.md explicitly overrides this to a custom billing UI. The executor documented this conflict and implemented the custom UI per CONTEXT.md. The implementation is substantive (invoices, payment method update, cancel) — this is not a shortcut.

**Notable partial implementation:** `usage-snapshot.ts` captures `activeUsers` but uses `0` for `activeAgents`, `ticketCount`, and `storageBytes`. These are intentionally deferred to Phase 4 (agent module) and future storage module. The core BILL-06 requirement (daily usage snapshots) is met for the currently available data.

---

_Verified: 2026-03-20T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
