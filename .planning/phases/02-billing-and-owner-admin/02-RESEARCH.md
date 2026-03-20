# Phase 2: Billing and Owner Admin - Research

**Researched:** 2026-03-20
**Domain:** Stripe subscription lifecycle, BullMQ async webhook processing, planGate enforcement, owner admin portal, tenant impersonation, TOTP MFA
**Confidence:** HIGH (Stripe SDK patterns, BullMQ queue patterns, schema readiness), MEDIUM (TOTP library selection, Recharts aggregation queries)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Stripe Elements embedded in the app for checkout (not Stripe Checkout redirect) — full UX control
- POST /billing/sync-checkout endpoint queries Stripe API directly after checkout redirect to handle webhook race condition
- Stripe webhooks processed asynchronously: endpoint enqueues to BullMQ, returns 200 immediately; worker processes with `stripe_webhook_events` idempotency table (UNIQUE constraint on stripeEventId)
- Custom billing management UI built in the app (not Stripe Customer Portal redirect) — update card, view invoices, cancel subscription
- Stripe Node SDK 17.x (verified: 20.4.1 is current; lock to 17.x per decision OR use 20.x — see Open Questions)
- planGate middleware returns structured 402 JSON: `{ error: 'PLAN_LIMIT_EXCEEDED', limit: 5, current: 5, feature: 'agents', upgradeTier: 'PROFESSIONAL' }`
- Frontend shows inline upgrade prompt at point of action
- Plan limits and feature flags stored in database (`SubscriptionPlan.limitsJson`) — changeable without deploy
- `usePlan()` frontend hook consumes plan config for UI gating
- planGate stub from Phase 1 (`apps/api/src/plugins/plan-gate.ts`) gets real implementation
- Full MRR/ARR dashboard with Recharts
- Read-only tenant impersonation: 15-minute signed token with `impersonatedBy` claim, persistent banner, write ops blocked at API layer
- Both self-service and manual provisioning workflows
- 14-day trial, dunning at trial-3d, suspension at expiry
- 3-day grace period manually applied by owner via admin portal

### Claude's Discretion
- Stripe Elements component styling and form layout
- Recharts chart configurations and color scheme
- Exact error handling for Stripe API failures
- Admin portal page layouts and navigation structure
- Welcome email template content
- Idempotency table cleanup schedule

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | Stripe subscription integration with 4 tiers (STARTER/PROFESSIONAL/BUSINESS/ENTERPRISE) | Stripe Elements + deferred payment pattern; SubscriptionPlan model already seeded |
| BILL-02 | planGate middleware enforces plan limits (maxUsers, maxAgents, maxSites, features) returning 402 | planGate stub in place; Redis cache pattern + TenantSubscription + limitsJson read pattern documented |
| BILL-03 | Trial flow: 14-day trial → dunning at trial-3d → suspension at expiry | BullMQ daily cron pattern; TenantSubscription.trialEnd exists in schema |
| BILL-04 | Stripe webhook handler for subscription lifecycle events (created, updated, deleted, payment_failed, payment_succeeded) | BullMQ async + idempotency table pattern; stripe_webhook_events table must be added via migration |
| BILL-05 | Self-service billing portal via Stripe Customer Portal redirect | CONTEXT.md overrides: custom UI not Customer Portal; Stripe API surface for invoices/payment methods documented |
| BILL-06 | Tenant usage snapshots (daily: activeUsers, activeAgents, ticketCount, storageBytes) | TenantUsageSnapshot model exists; daily BullMQ cron pattern documented |
| BILL-07 | Plan feature flags (CMDB, mobile, webhooks, etc.) gated by subscription tier | limitsJson on SubscriptionPlan stores features[]; planGate reads at runtime |
| OADM-01 | Separate Next.js app on port 3800 with completely isolated auth (OwnerUser, bcrypt + TOTP MFA) | apps/owner exists; OwnerUser.totpSecret + totpEnabled in schema; otpauth + qrcode library pattern documented |
| OADM-02 | IP allowlist middleware; never exposed through Cloudflare or public DNS | Next.js middleware pattern using CIDR check; existing middleware.ts as base |
| OADM-03 | Dashboard with MRR/ARR, trial conversions, churn, tenant counts | MRR/ARR SQL aggregation pattern; Recharts LineChart + AreaChart patterns |
| OADM-04 | Tenant list with search/filter by plan, status; tenant detail with subscription and usage | Prisma query patterns; TenantSubscription + TenantUsageSnapshot includes |
| OADM-05 | Tenant lifecycle: suspend, unsuspend, delete (soft with 30-day recovery), extend trial, apply grace period | TenantStatus enum + SubscriptionStatus enum in schema; workflow patterns documented |
| OADM-06 | Read-only tenant impersonation with 15-minute signed token and persistent banner | signOwnerToken pattern reuse with impersonatedBy claim; API write-block pattern documented |
| OADM-07 | Internal notes on tenants (visible only in admin app) | OwnerNote model in schema with ownerUserId FK |
| OADM-08 | Billing dashboard: Stripe revenue, per-tenant billing detail, retry failed payments | stripe.invoices.list, stripe.paymentIntents.retrieve, stripe.invoices.pay API patterns |
| OADM-09 | Plan management: view/edit subscription plans, archive plans | SubscriptionPlan model; update via Prisma; Stripe Price ID sync |
| OADM-10 | System operations: worker health, maintenance broadcast, CMDB reconciliation trigger | BullMQ Bull Board or queue.getJobCounts(); Redis SET for maintenance notice |
| OADM-11 | Global cross-tenant audit log viewer | AuditLog table query without tenantId filter — owner-only capability |
| OADM-12 | Manual tenant provisioning endpoint | Provisioning workflow: Tenant + TenantSubscription + Stripe Customer + seed defaults + User + email |
</phase_requirements>

---

## Summary

Phase 2 is the most architecturally complex phase because it spans three distinct integration surfaces: Stripe (billing), the planGate enforcement layer (security-critical), and the owner admin portal (fully isolated auth + impersonation). The primary risk areas are the Stripe webhook idempotency pattern and the impersonation token design — both have been researched in depth from project pitfalls and official docs.

The existing codebase is well-prepared. Phase 1 delivered: `apps/owner/` with working auth (jose-based JWT), `packages/db` with all required billing models (SubscriptionPlan, TenantSubscription, TenantUsageSnapshot, OwnerUser, OwnerNote), and the planGate stub. What is missing is the `stripe_webhook_events` table (Prisma migration required) and TOTP MFA plumbing in the login flow.

The CONTEXT.md decision to use a custom billing UI (not Stripe Customer Portal) is the highest-effort choice but is achievable: Stripe exposes all required operations (list invoices, update payment method, cancel subscription, retry invoice) via the Node SDK. The Stripe Elements embedded checkout uses the `@stripe/react-stripe-js` + `@stripe/stripe-js` package pair with `Elements` provider + `PaymentElement` component + `stripe.confirmPayment()` call.

**Primary recommendation:** Implement in dependency order — (1) Prisma migration for stripe_webhook_events, (2) Stripe webhook handler + BullMQ worker, (3) planGate real implementation, (4) Elements checkout + billing UI, (5) owner admin portal pages, (6) impersonation token. This ordering means enforcement works before self-service signup is live.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe | 20.4.1 (current) | Stripe Node SDK — server-side API calls, webhook verification | Only official SDK; constructEvent() for webhook signature verification |
| @stripe/react-stripe-js | 5.6.1 (current) | React components for Stripe Elements | Required for Elements provider, PaymentElement, useStripe, useElements hooks |
| @stripe/stripe-js | 8.11.0 (current) | Stripe.js browser loading | loadStripe() for publishable key init |
| otpauth | 9.5.0 (current) | TOTP secret generation + OTP validation | Actively maintained (speakeasy is unmaintained); supports RFC 6238; 63K+ weekly downloads |
| qrcode | 1.5.4 (current) | QR code generation for TOTP setup | Converts otpauth URI to data URL for authenticator app onboarding |
| recharts | 3.8.0 (current) | React charting library | Already in project stack decision; ResponsiveContainer + LineChart/AreaChart for MRR/ARR |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @node-rs/bcrypt | already installed | bcrypt for owner password verification | Already used in apps/owner login route |
| jose | already installed | JWT signing for owner tokens and impersonation tokens | Already used for owner-auth.ts; same pattern for impersonation tokens |
| ioredis | already installed | Redis client for planGate TTL cache | Already in stack; use existing bullmqConnection host/port |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| otpauth | otplib | otplib also maintained but otpauth has simpler API for TOTP-only use case |
| Stripe Elements (embedded) | Stripe Hosted Checkout | Context.md locked: Elements chosen for full UX control; no redirect |
| Custom billing UI | Stripe Customer Portal | Context.md locked: custom UI required for brand consistency |
| Recharts | Chart.js | Recharts is React-native, simpler integration; Chart.js requires canvas wrapper |

**Installation (new packages only):**
```bash
# In apps/api
pnpm --filter api add stripe@20.4.1

# In apps/web
pnpm --filter web add @stripe/react-stripe-js @stripe/stripe-js

# In apps/owner
pnpm --filter owner add otpauth qrcode

# Dev types for qrcode
pnpm --filter owner add -D @types/qrcode

# recharts likely already in web; if not:
pnpm --filter web add recharts
pnpm --filter owner add recharts
```

**Version note:** The CONTEXT.md specifies "Stripe Node SDK 17.x" but the current npm version is 20.4.1. See Open Questions. For planning purposes, use `stripe@latest` (20.4.1) unless the project has a pinned reason for 17.x.

---

## Architecture Patterns

### Recommended Project Structure (new files)

```
apps/api/src/
  plugins/
    plan-gate.ts          # REPLACE stub with real implementation
  routes/
    billing/
      index.ts            # POST /billing/create-checkout-intent
      sync-checkout.ts    # POST /billing/sync-checkout
      webhook.ts          # POST /billing/webhook (raw body, enqueue to BullMQ)
      invoices.ts         # GET /billing/invoices
      payment-method.ts   # POST /billing/update-payment-method, DELETE /billing/cancel
  services/
    stripe.service.ts     # Singleton Stripe client + helper methods
    subscription.service.ts # TenantSubscription CRUD + status sync

apps/worker/src/
  queues/
    definitions.ts        # ADD: stripeWebhookQueue, trialExpiryQueue, usageSnapshotQueue
  workers/
    stripe-webhook.ts     # Process stripe_webhook_events from queue
    trial-expiry.ts       # Daily cron: check trialEnd, suspend if expired, dunning email
    usage-snapshot.ts     # Daily cron: count users/agents/tickets per tenant

apps/owner/src/
  app/
    (auth)/login/         # ADD: TOTP step after password, QR setup flow
    (admin)/
      dashboard/          # MRR/ARR metrics + Recharts
      tenants/            # Tenant list + search
      tenants/[id]/       # Detail + impersonation + notes + lifecycle
      billing/            # Stripe revenue + per-tenant billing
      plans/              # SubscriptionPlan CRUD
      system/             # Worker health + maintenance
      audit/              # Cross-tenant AuditLog
  lib/
    stripe-admin.ts       # Owner-side Stripe API calls (retry invoice, list all)
    provisioning.ts       # Tenant provisioning workflow
    impersonation.ts      # Generate impersonation token (signOwnerToken with extra claim)

apps/web/src/
  app/
    signup/               # Public signup page with Stripe Elements checkout
    billing/              # Current plan + invoice list + update card + cancel
    (auth)/suspended/     # Paywall page for suspended tenants
  hooks/
    usePlan.ts            # Read plan config from tenant context

packages/db/prisma/
  schema.prisma           # ADD: StripeWebhookEvent model (idempotency table)
  migrations/             # New migration for stripe_webhook_events
```

---

### Pattern 1: Stripe Webhook Handler — Verify then Enqueue

**What:** Fastify route receives Stripe webhook, verifies signature using raw body, immediately enqueues to BullMQ, returns 200. Worker processes with idempotency check.

**Critical detail:** Fastify must parse the webhook route body as a `Buffer`, not JSON. Use a route-specific content type override.

**Why:** Stripe retries on non-200 or timeout (>20s). Async processing prevents timeouts on slow DB operations and email sends. Idempotency table prevents duplicate processing on retries.

```typescript
// apps/api/src/routes/billing/webhook.ts
// Source: Stripe docs + Fastify raw body pattern (github.com/fastify/fastify/issues/5491)

// The webhook route registers its own content type parser for raw body
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body)
);

fastify.post('/billing/webhook', async (request, reply) => {
  const sig = request.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    // request.body is a Buffer here due to the content type parser
    event = stripe.webhooks.constructEvent(
      request.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return reply.status(400).send({ error: 'Webhook signature verification failed' });
  }

  // Enqueue immediately — do NOT process inline
  await stripeWebhookQueue.add('stripe-event', {
    eventId: event.id,
    eventType: event.type,
    payload: event,
  });

  return reply.status(200).send({ received: true });
});
```

**IMPORTANT:** The raw body parser approach must be scoped. Register it only on the webhook route, not globally (global JSON parsing breaks all other routes). Use Fastify's route-level content type override or the `preParsing` hook approach.

---

### Pattern 2: Stripe Webhook Worker — Idempotency Table Check

**What:** BullMQ worker processes queued Stripe events. First checks `stripe_webhook_events` table for duplicate eventId before executing business logic.

```typescript
// apps/worker/src/workers/stripe-webhook.ts
// Source: PITFALLS.md Pitfall 5 + Stigg blog pattern

import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection, QUEUE_NAMES } from '../queues/definitions.js';

export const stripeWebhookWorker = new Worker(
  QUEUE_NAMES.STRIPE_WEBHOOK,
  async (job) => {
    const { eventId, eventType, payload } = job.data;

    // Idempotency check — UNIQUE constraint on stripeEventId
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: eventId },
    });
    if (existing?.processedAt) {
      console.log(`[stripe-webhook] Skipping already-processed event ${eventId}`);
      return;
    }

    // Upsert event record as "received"
    await prisma.stripeWebhookEvent.upsert({
      where: { stripeEventId: eventId },
      create: { stripeEventId: eventId, eventType, receivedAt: new Date() },
      update: {},
    });

    // Route by event type
    switch (eventType) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(payload.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(payload.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(payload.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(payload.data.object);
        break;
    }

    // Mark as processed
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: eventId },
      data: { processedAt: new Date() },
    });
  },
  { connection: bullmqConnection }
);

// Key principle: when subscription doesn't exist locally, fetch from Stripe API
// This handles out-of-order event delivery
async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  // Find tenant by stripeCustomerId
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { stripeCustomerId: sub.customer as string },
  });
  if (!subscription) {
    console.warn(`[stripe-webhook] No tenant found for customer ${sub.customer}`);
    return; // Or fetch from Stripe and create if needed
  }
  await prisma.tenantSubscription.update({
    where: { id: subscription.id },
    data: {
      stripeSubscriptionId: sub.id,
      status: mapStripeStatus(sub.status),
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
  });
}
```

---

### Pattern 3: Stripe Elements Embedded Subscription Checkout

**What:** Two-phase pattern. Phase 1: render PaymentElement (no subscription created yet). Phase 2: on submit, call server to create subscription, get clientSecret, call stripe.confirmPayment().

**Flow (deferred intent pattern — preferred):**
```
Frontend: Initialize Elements with mode='subscription', amount, currency
         → Mount PaymentElement (collects card details)
         → User clicks "Subscribe"
         → elements.submit() validates input
         → POST /billing/create-checkout-intent (server creates Customer + Subscription)
         → Server returns { clientSecret } from subscription.latest_invoice.payment_intent
         → stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url } })
         → Stripe redirects to return_url?payment_intent_client_secret=...&redirect_status=...
         → App calls POST /billing/sync-checkout to verify subscription status
```

```typescript
// apps/api/src/routes/billing/index.ts — Server side
fastify.post('/billing/create-checkout-intent', {
  preHandler: [authenticate], // tenant JWT required
}, async (request, reply) => {
  const { priceId } = request.body as { priceId: string };
  const { tenantId } = request.user;

  const tenantSub = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
  });

  // Create Stripe Customer if not yet exists
  let stripeCustomerId = tenantSub?.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({ metadata: { tenantId } });
    stripeCustomerId = customer.id;
    await prisma.tenantSubscription.update({
      where: { tenantId },
      data: { stripeCustomerId },
    });
  }

  // Create subscription with payment_behavior: 'default_incomplete'
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  const invoice = subscription.latest_invoice as Stripe.Invoice;
  const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

  return reply.send({ clientSecret: paymentIntent.client_secret });
});
```

```typescript
// apps/api/src/routes/billing/sync-checkout.ts — Race condition resolver
fastify.post('/billing/sync-checkout', {
  preHandler: [authenticate],
}, async (request, reply) => {
  const { sessionId } = request.body as { sessionId?: string; subscriptionId?: string };
  const { tenantId } = request.user;

  // Fetch current subscription state directly from Stripe (not our DB)
  const tenantSub = await prisma.tenantSubscription.findUnique({ where: { tenantId } });
  if (!tenantSub?.stripeSubscriptionId) {
    return reply.status(404).send({ error: 'No subscription found' });
  }

  const stripeSub = await stripe.subscriptions.retrieve(tenantSub.stripeSubscriptionId);
  await prisma.tenantSubscription.update({
    where: { tenantId },
    data: {
      status: mapStripeStatus(stripeSub.status),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    },
  });

  return reply.send({ status: stripeSub.status });
});
```

```tsx
// apps/web/src/app/signup/CheckoutForm.tsx — Client side
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function CheckoutForm({ priceId }: { priceId: string }) {
  const stripe = useStripe();
  const elements = useElements();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    // Validate form
    const { error: submitError } = await elements.submit();
    if (submitError) { /* show error */ return; }

    // Get client secret from server
    const res = await fetch('/api/v1/billing/create-checkout-intent', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
    const { clientSecret } = await res.json();

    // Confirm payment
    const { error } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: `${window.location.origin}/billing/success` },
    });
    if (error) { /* show error */ }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit" disabled={!stripe}>Subscribe</button>
    </form>
  );
}

// Wrapper with Elements provider
export function SubscribeFlow({ priceId }: { priceId: string }) {
  return (
    <Elements stripe={stripePromise} options={{ mode: 'subscription', amount: 4900, currency: 'usd' }}>
      <CheckoutForm priceId={priceId} />
    </Elements>
  );
}
```

---

### Pattern 4: planGate Real Implementation

**What:** Replace the no-op stub with real plan enforcement. Read TenantSubscription from DB (cached in Redis, TTL 60s). Compare current usage vs. limitsJson. Return 402 for violations.

```typescript
// apps/api/src/plugins/plan-gate.ts — Full replacement
// Source: DOCUMENTATION.md §11 + CONTEXT.md
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@meridian/db';
import { redis } from '../lib/redis.js'; // existing Redis client

type PlanResource = 'agents' | 'users' | 'sites' | 'cmdb' | 'mobile' | 'webhooks' | 'api_access' | 'scheduled_reports';

export function planGate(resource: PlanResource, currentCountFn?: (tenantId: string) => Promise<number>) {
  return async function planGatePreHandler(request: FastifyRequest, reply: FastifyReply) {
    const { tenantId } = request.user as { tenantId: string };
    const cacheKey = `plan:${tenantId}`;

    // Redis cache — TTL 60s
    let planData: { limitsJson: Record<string, unknown>; status: string } | null = null;
    const cached = await redis.get(cacheKey);
    if (cached) {
      planData = JSON.parse(cached);
    } else {
      const tenantSub = await prisma.tenantSubscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
      if (!tenantSub) return reply.status(402).send({ error: 'NO_SUBSCRIPTION' });
      planData = { limitsJson: tenantSub.plan.limitsJson as Record<string, unknown>, status: tenantSub.status };
      await redis.setex(cacheKey, 60, JSON.stringify(planData));
    }

    // Check subscription is active (not expired/suspended)
    const activeStatuses = ['ACTIVE', 'TRIALING'];
    if (!activeStatuses.includes(planData.status)) {
      return reply.status(402).send({ error: 'SUBSCRIPTION_INACTIVE', status: planData.status });
    }

    const limits = planData.limitsJson as Record<string, number | boolean | string[]>;

    // Feature flag check (non-numeric features)
    const features = (limits.features as string[]) ?? [];
    if (['cmdb', 'mobile', 'webhooks', 'api_access', 'scheduled_reports'].includes(resource)) {
      if (!features.includes(resource)) {
        return reply.status(402).send({
          error: 'PLAN_LIMIT_EXCEEDED',
          feature: resource,
          upgradeTier: getUpgradeTier(resource, limits),
        });
      }
      return; // Feature is available
    }

    // Numeric limit check
    if (currentCountFn) {
      const limitKey = `max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof typeof limits;
      const limit = limits[limitKey] as number;
      if (limit !== -1) { // -1 means unlimited
        const current = await currentCountFn(tenantId);
        if (current >= limit) {
          return reply.status(402).send({
            error: 'PLAN_LIMIT_EXCEEDED',
            limit,
            current,
            feature: resource,
            upgradeTier: getUpgradeTier(resource, limits),
          });
        }
      }
    }
  };
}

function getUpgradeTier(resource: string, limits: Record<string, unknown>): string {
  // Logic to suggest next tier — derived from plan comparison
  return 'PROFESSIONAL'; // Simplified; real impl checks all plans
}
```

---

### Pattern 5: Tenant Impersonation Token

**What:** Owner admin generates a 15-minute JWT with `impersonatedBy` claim. API middleware detects this claim and blocks write operations.

```typescript
// apps/owner/src/lib/impersonation.ts
import { SignJWT } from 'jose';

const OWNER_SECRET = () => new TextEncoder().encode(process.env.OWNER_JWT_SECRET!);

export async function generateImpersonationToken(
  ownerUserId: string,
  tenantId: string,
  ownerEmail: string,
): Promise<string> {
  return new SignJWT({
    tenantId,
    impersonatedBy: ownerUserId,
    impersonatedByEmail: ownerEmail,
    readOnly: true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(OWNER_SECRET());
}
```

```typescript
// apps/api/src/middleware/impersonation-guard.ts
// Added as preHandler on all mutating routes (POST, PUT, PATCH, DELETE)
export async function blockImpersonationWrites(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as { impersonatedBy?: string; readOnly?: boolean };
  if (user.readOnly || user.impersonatedBy) {
    return reply.status(403).send({
      error: 'READ_ONLY_SESSION',
      message: 'Impersonation sessions are read-only. Exit impersonation to make changes.',
    });
  }
}
```

**Token handling in main web app:** The impersonation token is passed as a URL parameter or short-lived cookie. The main app reads it, verifies with the same OWNER_JWT_SECRET (shared for impersonation only — the impersonation token is issued by the owner app but verified by the main API). The persistent banner reads the `expirationTime` claim to show the countdown.

---

### Pattern 6: TOTP MFA Setup and Verification

**What:** Owner admin login flow adds a TOTP step. OwnerUser.totpSecret stores base32-encoded secret. OwnerUser.totpEnabled gates the TOTP check.

```typescript
// apps/owner/src/lib/totp.ts
import { TOTP } from 'otpauth';
import QRCode from 'qrcode';

export function generateTotpSecret(email: string) {
  const totp = new TOTP({
    issuer: 'MeridianITSM',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return {
    secret: totp.secret.base32,
    otpauthUrl: totp.toString(), // otpauth://totp/... URI
  };
}

export async function generateQrCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl); // Returns data:image/png;base64,...
}

export function verifyTotp(secret: string, token: string): boolean {
  const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });
  return totp.validate({ token, window: 1 }) !== null; // window: 1 allows ±30s drift
}
```

**Login flow with TOTP:**
1. POST /api/auth/login → verify email + password → if `totpEnabled`, return `{ requiresTotp: true, tempToken }` (short-lived, no session created)
2. POST /api/auth/totp-verify → verify TOTP code → create full session
3. If `totpEnabled === false`, login completes after password (dev/setup mode)

---

### Pattern 7: MRR/ARR Dashboard with Recharts

**What:** Aggregate revenue from TenantSubscription + SubscriptionPlan. Recharts expects array of `{ date: string, mrr: number, arr: number }`.

```typescript
// apps/owner/src/lib/usage.ts — MRR aggregation query
export async function getMrrTimeSeries(months = 12) {
  // Raw query: group active subscriptions by month, sum plan prices
  const result = await prisma.$queryRaw<Array<{ month: Date; mrr: number }>>`
    SELECT
      DATE_TRUNC('month', ts.created_at) AS month,
      SUM(sp.monthly_price_usd) AS mrr
    FROM tenant_subscriptions ts
    JOIN subscription_plans sp ON ts.plan_id = sp.id
    WHERE ts.status IN ('ACTIVE', 'TRIALING')
      AND ts.created_at >= NOW() - INTERVAL '${months} months'
    GROUP BY DATE_TRUNC('month', ts.created_at)
    ORDER BY month ASC
  `;

  return result.map(row => ({
    date: row.month.toISOString().slice(0, 7), // "2026-01"
    mrr: Number(row.mrr),
    arr: Number(row.mrr) * 12,
  }));
}
```

```tsx
// apps/owner/src/components/RevenueChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function RevenueChart({ data }: { data: Array<{ date: string; mrr: number; arr: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} />
        <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
        <Line type="monotone" dataKey="mrr" stroke="#6366f1" strokeWidth={2} name="MRR" />
        <Line type="monotone" dataKey="arr" stroke="#8b5cf6" strokeWidth={2} name="ARR" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

---

### Pattern 8: usePlan() Frontend Hook

**What:** Reads the tenant's current plan from a TanStack Query cache. Components use it to show/hide features and upgrade prompts.

```typescript
// apps/web/src/hooks/usePlan.ts
import { useQuery } from '@tanstack/react-query';

interface PlanContext {
  tier: 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
  limits: {
    maxUsers: number;
    maxAgents: number;
    maxSites: number;
    features: string[];
  };
  trialEnd?: string;
}

export function usePlan() {
  const { data } = useQuery<PlanContext>({
    queryKey: ['plan'],
    queryFn: () => fetch('/api/v1/billing/plan').then(r => r.json()),
    staleTime: 60_000, // 60s — matches planGate Redis TTL
  });
  return {
    plan: data,
    hasFeature: (feature: string) => data?.limits.features.includes(feature) ?? false,
    isActive: () => data?.status === 'ACTIVE' || data?.status === 'TRIALING',
    isTrial: () => data?.status === 'TRIALING',
  };
}
```

---

### Pattern 9: Tenant Provisioning Workflow

**What:** Sequential operations to create a fully functional tenant. Used by both `/api/admin/provision` (manual) and `/signup` (self-service).

```typescript
// packages/core/src/services/provisioning.service.ts
export async function provisionTenant(input: {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  planTier?: SubscriptionPlanTier;
  stripeCustomerId?: string;
}) {
  // 1. Create Tenant
  const tenant = await prisma.tenant.create({
    data: { name: input.name, slug: input.slug, type: 'MSP', status: 'ACTIVE' },
  });

  // 2. Find plan record
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { name: input.planTier ?? 'STARTER' },
  });

  // 3. Create TenantSubscription (TRIALING)
  await prisma.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan!.id,
      status: 'TRIALING',
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      stripeCustomerId: input.stripeCustomerId,
    },
  });

  // 4. Create Stripe Customer (if not already created)
  if (!input.stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: input.adminEmail,
      metadata: { tenantId: tenant.id },
    });
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { stripeCustomerId: customer.id },
    });
  }

  // 5. Seed default roles, categories, SLA policies (reuse existing seed logic)
  await seedTenantDefaults(tenant.id);

  // 6. Create initial admin User
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: input.adminEmail,
      passwordHash: await hash(input.adminPassword, 10),
      status: 'ACTIVE',
    },
  });

  // 7. Send welcome email via BullMQ
  await emailNotificationQueue.add('welcome', {
    tenantId: tenant.id,
    userId: user.id,
    email: input.adminEmail,
    loginUrl: `https://${input.slug}.yourdomain.com`,
  });

  return { tenant, user };
}
```

---

### Anti-Patterns to Avoid

- **Processing Stripe webhooks synchronously:** Any business logic in the webhook handler risks Stripe's 20s timeout and automatic retries. Always enqueue to BullMQ and return 200 immediately.
- **Missing idempotency table:** Without the `stripe_webhook_events` table with UNIQUE constraint on `stripeEventId`, retries create duplicate subscriptions, duplicate emails, and duplicate plan changes.
- **JSON parsing the webhook body for signature verification:** Stripe signature verification requires the raw bytes. Parsing the body as JSON before `constructEvent()` always fails verification.
- **planGate checking tier but not subscription status:** A CANCELED or SUSPENDED subscription still has a plan tier. Always check BOTH `status IN ('ACTIVE', 'TRIALING')` AND the plan limits.
- **Hardcoding Stripe Price IDs:** The SubscriptionPlan model has `stripePriceIdMonthly` and `stripePriceIdAnnual` columns. Read from DB at runtime, not from env vars (test and production have different price IDs).
- **Using the same JWT secret for impersonation verification in main API:** The impersonation token IS signed with `OWNER_JWT_SECRET`. The main API must verify it with `OWNER_JWT_SECRET`, not `API_JWT_SECRET`. This is intentional and by design — the main API needs `OWNER_JWT_SECRET` available as an env var for impersonation token verification only.
- **Speakeasy for TOTP:** Speakeasy is unmaintained (7 years). Use `otpauth`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe signature verification | Custom HMAC comparison | `stripe.webhooks.constructEvent()` | Handles timing-safe comparison, encoding edge cases, Stripe-specific header format |
| TOTP generation/validation | RFC 6238 implementation | `otpauth` TOTP class | RFC compliance, clock drift window, base32 encoding already handled |
| QR code generation for TOTP URI | Custom SVG/canvas | `qrcode` npm package | Standard library, data URL output, no server dependencies |
| Payment form UI | Custom card input fields | Stripe PaymentElement | PCI compliance — card numbers must never touch your server |
| Subscription status state machine | Custom status transitions | Stripe webhook events | Stripe IS the source of truth; your DB reflects Stripe state, not the other way around |

**Key insight:** Stripe owns the subscription state. Your database is a mirror that webhook events keep synchronized. Never calculate "what should the subscription status be" — always read from Stripe via webhook or API call.

---

## Common Pitfalls

### Pitfall 1: Stripe Webhook Race Condition (POST-CHECKOUT WINDOW)
**What goes wrong:** After Elements checkout confirms payment, user is redirected to success page. The webhook (`customer.subscription.created`) hasn't fired yet. The success page queries the API, gets stale TRIALING status. User appears not subscribed.

**Why it happens:** Webhooks are async (seconds to minutes). The redirect is instant.

**How to avoid:** The success page calls `POST /billing/sync-checkout` immediately on load. This endpoint calls `stripe.subscriptions.retrieve(stripeSubscriptionId)` directly from Stripe and writes the current status to DB before responding. planGate must not downgrade during the 60s Redis TTL window — TTL cache is invalidated on sync-checkout.

**Warning signs:** QA reports "just paid but still shows trial" after page load.

### Pitfall 2: Out-of-Order Stripe Events
**What goes wrong:** `customer.subscription.updated` arrives before `customer.subscription.created`. Worker finds no matching TenantSubscription by stripeCustomerId. Business logic skipped silently.

**Why it happens:** Stripe does not guarantee delivery order. Network/queue conditions affect ordering.

**How to avoid:** When the tenant subscription isn't found by stripeCustomerId, fetch the subscription from Stripe API directly and upsert it. Never assume prior events have been processed.

### Pitfall 3: planGate UI vs API Enforcement Gap (Pitfall 10 from PITFALLS.md)
**What goes wrong:** planGate correctly returns 402. Frontend shows the button anyway. User clicks, gets unexplained error, thinks the product is broken.

**How to avoid:** `usePlan()` hook reads plan data on load. Every plan-gated UI element renders `<UpgradePrompt>` component instead of the feature when `hasFeature('cmdb')` returns false. The upgrade prompt contains a link to `/billing/upgrade`. The 402 response is a safety net, never the primary UX.

### Pitfall 4: Idempotency Table Not Cleaned Up
**What goes wrong:** `stripe_webhook_events` grows unbounded. At millions of rows, idempotency lookups slow down.

**How to avoid:** Add a cleanup BullMQ job (daily, at discretion) that deletes rows older than 90 days with `processedAt IS NOT NULL`.

### Pitfall 5: Impersonation Token Not Verified on API Side
**What goes wrong:** Impersonation token is passed to the main app but the main API doesn't check `readOnly` claim. Write operations proceed normally during impersonation sessions.

**How to avoid:** The `blockImpersonationWrites` preHandler must be registered on ALL mutating routes (POST, PUT, PATCH, DELETE). It checks `request.user.readOnly === true`. This is the security guarantee — the banner is cosmetic; the API enforcement is the actual gate.

### Pitfall 6: Fastify Global JSON Parser Breaks Webhook Route
**What goes wrong:** The Stripe webhook route needs a Buffer body parser. If implemented globally (replacing Fastify's default JSON parser), all other routes receive Buffer instead of parsed JSON.

**How to avoid:** Register the raw body content type parser scoped to the webhook route only, using Fastify's `preParsing` hook on the specific route, not `fastify.addContentTypeParser()` globally.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Speakeasy (TOTP) | otpauth | 2022 (speakeasy unmaintained since 2018) | Must use otpauth for active maintenance |
| Stripe Checkout redirect | Stripe Elements embedded | 2023 (Embedded Checkout) | Elements gives full UX control; no redirect needed |
| Manual webhook polling for status | sync-checkout endpoint | Best practice since 2021 | Eliminates race condition window |
| Hardcoded plan limits in code | limitsJson in database | Phase 1 schema decision | Limits changeable without deploy |
| Prisma 6 (Rust engine) | Prisma 7 (pure TypeScript) | January 2026 | Already in use in this project |

---

## Schema Changes Required

The following additions to `packages/db/prisma/schema.prisma` are required for Phase 2:

### StripeWebhookEvent (new model — idempotency table)
```prisma
// Model 62: StripeWebhookEvent (GLOBAL — no tenantId, global idempotency)
model StripeWebhookEvent {
  id            String    @id @default(uuid()) @db.Uuid
  stripeEventId String    @unique  // UNIQUE constraint — core of idempotency
  eventType     String
  receivedAt    DateTime  @default(now())
  processedAt   DateTime?
  createdAt     DateTime  @default(now())

  @@index([stripeEventId])
  @@index([processedAt])
  @@map("stripe_webhook_events")
}
```

**Note:** TenantSubscription already has `stripeCustomerId` and `stripeSubscriptionId` columns. No changes needed there. SubscriptionPlan already has `limitsJson` column (named `limitsJson` in schema, CONTEXT.md calls it `planLimitsJson` — they are the same field).

**Also needed:** The `OwnerUser` model already has `totpSecret` and `totpEnabled` fields — no schema change needed for TOTP.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (apps/api: vitest.config.ts, apps/worker: vitest.config.ts) |
| Config file | `apps/api/vitest.config.ts`, `apps/worker/vitest.config.ts` |
| Quick run command | `pnpm --filter api vitest run` |
| Full suite command | `pnpm --filter api vitest run && pnpm --filter worker vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-02 | planGate returns 402 when limit exceeded | unit | `pnpm --filter api vitest run src/plugins/plan-gate.test.ts` | ❌ Wave 0 |
| BILL-02 | planGate returns 402 when subscription CANCELED | unit | `pnpm --filter api vitest run src/plugins/plan-gate.test.ts` | ❌ Wave 0 |
| BILL-02 | planGate passes when within limits | unit | `pnpm --filter api vitest run src/plugins/plan-gate.test.ts` | ❌ Wave 0 |
| BILL-04 | Webhook idempotency skips already-processed event | unit | `pnpm --filter worker vitest run src/workers/stripe-webhook.test.ts` | ❌ Wave 0 |
| BILL-04 | constructEvent rejects invalid signature | unit | `pnpm --filter api vitest run src/routes/billing/webhook.test.ts` | ❌ Wave 0 |
| OADM-01 | TOTP verify returns false for wrong code | unit | `pnpm --filter owner vitest run src/lib/totp.test.ts` | ❌ Wave 0 |
| OADM-06 | Impersonation token has readOnly claim | unit | `pnpm --filter owner vitest run src/lib/impersonation.test.ts` | ❌ Wave 0 |
| OADM-06 | blockImpersonationWrites blocks POST/PUT/DELETE | unit | `pnpm --filter api vitest run src/middleware/impersonation-guard.test.ts` | ❌ Wave 0 |
| BILL-03 | Trial expiry worker sets status to SUSPENDED | unit | `pnpm --filter worker vitest run src/workers/trial-expiry.test.ts` | ❌ Wave 0 |
| OADM-12 | Provision creates Tenant + TenantSubscription + User | integration | manual — requires DB | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api vitest run` + `pnpm --filter worker vitest run`
- **Per wave merge:** Full suite across api + worker + owner
- **Phase gate:** All unit tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/plugins/plan-gate.test.ts` — covers BILL-02
- [ ] `apps/api/src/routes/billing/webhook.test.ts` — covers BILL-04 signature verification
- [ ] `apps/worker/src/workers/stripe-webhook.test.ts` — covers BILL-04 idempotency
- [ ] `apps/worker/src/workers/trial-expiry.test.ts` — covers BILL-03
- [ ] `apps/owner/src/lib/totp.test.ts` — covers OADM-01 TOTP
- [ ] `apps/owner/src/lib/impersonation.test.ts` — covers OADM-06 token generation
- [ ] `apps/api/src/middleware/impersonation-guard.test.ts` — covers OADM-06 write blocking

---

## Open Questions

1. **Stripe SDK Version: 17.x (CONTEXT.md) vs 20.4.1 (npm current)**
   - What we know: CONTEXT.md specifies "Stripe Node SDK 17.x" but 20.4.1 is current (March 2026). The TypeScript types differ significantly between major versions.
   - What's unclear: Why 17.x was specified — was it the current version when the CONTEXT.md was written, or intentional pinning?
   - Recommendation: Use `stripe@20.4.1` (current) unless there is a known breaking change reason for 17.x. The API surface for subscription/webhook operations has not had breaking changes between 17 and 20. Planner should confirm with user if needed.

2. **BILL-05 vs CONTEXT.md: Requirements says "Stripe Customer Portal" but CONTEXT.md locks "custom billing UI"**
   - What we know: REQUIREMENTS.md BILL-05 says "Self-service billing portal via Stripe Customer Portal redirect." CONTEXT.md (which takes precedence) says "Custom billing management UI built in the app."
   - What's unclear: Nothing — CONTEXT.md wins per GSD protocol. BILL-05 will be satisfied by the custom billing UI, not Stripe Customer Portal.
   - Recommendation: Implement custom billing UI per CONTEXT.md. The planner should note this discrepancy in PLAN.md to document the deviation from the requirement as-written.

3. **Impersonation token verification secret sharing**
   - What we know: The impersonation token is signed by `apps/owner` using `OWNER_JWT_SECRET`. The main API (`apps/api`) needs to verify it.
   - What's unclear: Should `apps/api` have `OWNER_JWT_SECRET` as an env var, or should a separate `IMPERSONATION_JWT_SECRET` be used?
   - Recommendation: Use a separate `IMPERSONATION_JWT_SECRET` env var in both apps to avoid giving the main API access to the full owner auth secret. Both apps share only this key.

4. **planGate cache invalidation on subscription change**
   - What we know: planGate caches subscription data for 60s in Redis. If a payment fails and status changes to PAST_DUE, the cached data is stale for up to 60s.
   - What's unclear: Should the webhook worker explicitly invalidate the Redis cache key `plan:${tenantId}` after updating TenantSubscription status?
   - Recommendation: Yes — add `redis.del(`plan:${tenantId}`)` in the stripe webhook worker after every status update. The 60s TTL is a fallback, not the primary mechanism.

---

## Sources

### Primary (HIGH confidence)
- Stripe official docs — `docs.stripe.com/billing/subscriptions/build-subscriptions` — Elements subscription flow
- Stripe official docs — `docs.stripe.com/payments/accept-a-payment-deferred` — Deferred intent pattern for subscriptions
- Stripe official docs — `docs.stripe.com/billing/subscriptions/overview` — Subscription lifecycle, status transitions
- Stripe official docs — `docs.stripe.com/webhooks/quickstart?lang=node` — constructEvent pattern, raw body requirement
- Stripe official docs — `docs.stripe.com/sdks/stripejs-react` — React Stripe.js, loadStripe, Elements, PaymentElement, useStripe, useElements
- Fastify GitHub issue #5491 — Raw body parser pattern for Stripe webhooks in Fastify
- npm registry — stripe@20.4.1, @stripe/react-stripe-js@5.6.1, @stripe/stripe-js@8.11.0, otpauth@9.5.0, qrcode@1.5.4, recharts@3.8.0 — verified versions
- Project PITFALLS.md (Pitfall 4, 5, 10) — Stripe race condition, idempotency, planGate UI enforcement — HIGH confidence (already project-researched)
- Project schema.prisma — SubscriptionPlan.limitsJson, TenantSubscription, OwnerUser.totpSecret/totpEnabled — direct code inspection
- Project apps/owner/src/lib/owner-auth.ts — signOwnerToken pattern for impersonation tokens

### Secondary (MEDIUM confidence)
- otpauth GitHub — `github.com/hectorm/otpauth` — Active maintenance confirmed vs speakeasy unmaintained status
- Stigg blog — Stripe webhook best practices — idempotency table pattern verified against Stripe docs
- WebSearch: Recharts chart types for MRR/ARR — multiple sources confirm LineChart + AreaChart + ResponsiveContainer pattern

### Tertiary (LOW confidence)
- Medium article on Stripe webhooks + BullMQ — could not fetch (403); pattern cross-verified from Stripe official docs and Stigg blog

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry
- Stripe integration patterns: HIGH — verified against official Stripe documentation
- BullMQ webhook patterns: HIGH — consistent with existing project patterns + official docs
- planGate implementation: HIGH — schema exists, pattern from DOCUMENTATION.md §11
- TOTP MFA (otpauth): MEDIUM — library confirmed active, pattern standard, but newer than speakeasy guides
- Recharts MRR aggregation: MEDIUM — Recharts component API confirmed; SQL aggregation pattern is standard PostgreSQL
- Impersonation JWT design: MEDIUM — pattern derived from existing signOwnerToken + documented spec; Open Question 3 needs resolution

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days — Stripe SDK and billing patterns are stable)
