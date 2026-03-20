# Pitfalls Research

**Domain:** Multi-tenant SaaS ITSM Platform (MSP-focused)
**Researched:** 2026-03-19
**Confidence:** HIGH (specific pitfalls verified across multiple official and community sources)

---

## Critical Pitfalls

### Pitfall 1: Missing tenantId Scope on a Single Query

**What goes wrong:**
One query without a `WHERE tenant_id = ?` clause exposes every tenant's data simultaneously. In a shared-schema multi-tenant system, a missing scope doesn't just leak one record — it returns all records for all tenants. This is the most common cause of SaaS data breach incidents. Research confirms 92% of SaaS breaches originate from tenant isolation failures.

**Why it happens:**
Developers add new queries under time pressure, copy-paste from single-tenant codebases, or work in helpers/background workers that aren't obviously "tenant-scoped." ORM query builders make it easy to omit a where clause. It's also invisible during development where the test database typically has only one tenant.

**How to avoid:**
- Create a mandatory `TenantScopedRepository` or query builder wrapper that injects `tenantId` from context — raw queries require explicit opt-in
- Use Prisma middleware or a query extension that automatically appends tenant scope to every read/write; raise an error if `tenantId` is absent from context
- Use AsyncLocalStorage to propagate `tenantId` from the request into all downstream code, including ORM calls, without passing it as a parameter every time
- Run a tenant isolation test suite: create Tenant A's records, authenticate as Tenant B, attempt to access them — all must 404 or 403
- Add a CI step that statically analyses new Prisma query calls for missing `where.tenantId`

**Warning signs:**
- A query returns more records than expected in development (especially after seeding multiple tenants)
- A background worker logs a job for tenant A while processing a request for tenant B
- Any query that accepts an `id` parameter but does not also constrain by `tenantId`

**Phase to address:** Foundation / Core API phase — before any feature code is written. Tenant scoping infrastructure must be the first working thing.

---

### Pitfall 2: Background Worker Tenant Context Leakage

**What goes wrong:**
Workers processing SLA timers, email polling, CMDB reconciliation, and notifications run outside HTTP request context. Without explicit tenant context propagation into job payloads, a worker either processes data for the wrong tenant or operates without any tenant filter, leaking data across the boundary.

**Why it happens:**
HTTP middleware sets `tenantId` in AsyncLocalStorage for request handlers, but BullMQ job processors run in a separate async context. Developers assume the same pattern applies everywhere. The bug is silent — the worker processes successfully but against wrong-tenant data.

**How to avoid:**
- Every job payload must include `tenantId` as a required first-class field, not derived from context
- Job processor functions must assert `tenantId` is present before any database access — throw if absent
- Cache keys for any shared Redis cache must include `tenantId` prefix: `sla:${tenantId}:${ticketId}`, never `sla:${ticketId}`
- Tag every log line with `tenantId` — if a trace shows two different tenant IDs in a single job execution, that is a critical bug
- Use Redis ACL rules so even a code bug cannot read another tenant's cache keys

**Warning signs:**
- SLA timer fires for a ticket belonging to tenant A while the worker's log shows it was triggered during a tenant B job
- Email polling creates tickets under the wrong organization
- Cache hit rates are unexpectedly high across tenant boundaries (another tenant's data being served from cache)

**Phase to address:** Background Workers phase — before SLA monitoring, email polling, or CMDB reconciliation is built.

---

### Pitfall 3: Owner Admin Portal Not Truly Isolated

**What goes wrong:**
The owner admin portal shares JWT secrets, auth middleware, or database connection logic with the tenant-facing API. A sufficiently crafted token or routing mistake allows a tenant user to hit admin endpoints. Conversely, an admin session leaks data back into tenant context.

**Why it happens:**
Monorepo convenience: shared auth utilities get imported into both apps. A developer adds a shared `verifyJwt()` utility that works for both contexts, but it's initialized with the same secret. Or the admin portal is deployed behind the same API gateway and route guard logic is incomplete.

**How to avoid:**
- Separate JWT secret for the owner admin app — stored separately in environment variables, never shared with the tenant API
- Owner admin portal is a completely separate Next.js app (separate `apps/owner-admin` in the monorepo), its own middleware, its own Prisma client instance pointed at the same DB but with its own auth schema
- Owner admin is never deployed at a public URL — internal network only, or behind IP allowlist
- No shared `auth` package that auto-wires both apps — shared utilities are fine, shared configuration is not
- Impersonation tokens generated by owner admin must be short-lived (15 min max), scoped to a single tenant, and logged with full audit trail

**Warning signs:**
- A JWT signed with the tenant secret is accepted by the admin API (or vice versa)
- Admin-only endpoints appear in the Swagger/OpenAPI spec served by the public API
- Impersonation has no expiry or no audit log

**Phase to address:** Foundation phase — the auth boundary between owner admin and tenant API must be established before either portal has any features.

---

### Pitfall 4: Stripe Webhook Race Condition on Subscription State

**What goes wrong:**
After a successful Stripe Checkout, the user is redirected back to the application before the webhook has fired and updated the database. The frontend loads, calls the API, and gets stale subscription data — the user looks like they're still on a trial or free plan even though payment succeeded. If `planGate` middleware runs in this window, feature access is incorrectly blocked.

**Why it happens:**
Webhooks are asynchronous. Stripe delivers them seconds to minutes after the checkout completes. Applications that rely entirely on webhooks for subscription state have this window. It's nearly impossible to reproduce in development because the webhook fires quickly on a local tunnel.

**How to avoid:**
- On redirect from Stripe Checkout, extract `session_id` from the query string and call a `/billing/sync-checkout` endpoint that synchronously queries Stripe's API to get current subscription state and writes it to the database before responding
- Store `stripeSubscriptionId` and `stripePriceId` in the tenant record; use Stripe's API as the source of truth, not just webhook-driven state
- Design `planGate` middleware to default to the most recently confirmed plan tier, not to the most restrictive — brief windows of uncertainty should not lock users out
- Implement a frontend polling fallback (exponential backoff, 5 attempts) on the billing success page as a safety net

**Warning signs:**
- QA reports "I just paid but the app says I'm on the free plan"
- Webhook logs show `customer.subscription.updated` arriving 10+ seconds after checkout redirect
- `planGate` denies access immediately after a successful upgrade

**Phase to address:** Billing integration phase — build the sync-checkout endpoint alongside the webhook handler, not after.

---

### Pitfall 5: Stripe Webhook Idempotency Not Implemented

**What goes wrong:**
Stripe retries webhooks for up to 3 days on failure. If the handler is not idempotent, the same event fires business logic multiple times: trial_ended emails are sent repeatedly, subscription records are double-written, plan downgrades happen twice. Stripe also delivers events out of order — a `customer.subscription.updated` may arrive before `customer.subscription.created`.

**Why it happens:**
Developers write the "happy path" first: receive event → update database → return 200. They don't model retry or ordering scenarios. Heavy processing inside the handler (sending emails, updating many tables) causes timeouts (Stripe's limit is 20 seconds), triggering automatic retries.

**How to avoid:**
- Store processed `stripeEventId` in a `stripe_webhook_events` table with a UNIQUE constraint; skip processing if already present
- Acknowledge with HTTP 200 immediately; push the event to a BullMQ queue for async processing
- Use a `stripe_webhook_events` table that tracks event ID, type, received_at, and processed_at — this serves as the idempotency log and an audit trail
- When handling a subscription event and the subscription doesn't exist in the database, fetch it from Stripe's API directly and create it — handle out-of-order events gracefully
- Never assume event ordering; make each event handler work from the current Stripe API state, not from local state transitions

**Warning signs:**
- Webhook endpoint takes more than 2 seconds on average (processing too much inline)
- No `stripe_webhook_events` table in the schema
- Dunning emails being sent multiple times to the same customer

**Phase to address:** Billing integration phase — idempotency infrastructure must be built before any webhook handlers process business logic.

---

### Pitfall 6: SLA Timer Drift in Distributed Workers

**What goes wrong:**
SLA timers calculated by comparing wall clock timestamps against stored deadlines drift when: workers run in different timezones, clocks are not synced across servers, paused/resumed timers are calculated with simple elapsed subtraction (ignoring business hours), or the polling interval is too coarse (a 5-minute polling interval means every SLA can be up to 5 minutes late).

**Why it happens:**
SLA timer logic seems simple — "deadline minus now". The complexity emerges from business hours calendars, pause/resume states (waiting-for-customer), timezone handling across MSP and CustomerOrganization, and the fact that polling workers don't fire exactly on schedule under load.

**How to avoid:**
- Store SLA deadlines as absolute UTC timestamps calculated at ticket creation/last-resume time, not as durations — compute once, store, compare against `now()`
- Store cumulative `pausedDuration` separately from `createdAt`; deadline = `createdAt + slaTarget - pausedDuration`
- Use database-side timestamp arithmetic (`NOW() > sla_breach_at`) rather than application-side comparison to avoid clock drift
- Business hours must be stored per-tenant with timezone; deadline calculation must use the tenant's calendar
- Run the SLA polling worker every 60 seconds — coarser intervals cause user-visible latency on breach alerts
- Test with tickets paused/resumed multiple times in different business hour windows

**Warning signs:**
- SLA breach alert fires minutes after the actual breach time
- Pausing and resuming a ticket multiple times results in incorrect remaining time
- SLA timers show different remaining time depending on which worker instance is inspected

**Phase to address:** SLA Monitoring / Background Workers phase — get timer math right before building breach alerts or reporting.

---

### Pitfall 7: Email-to-Ticket Duplicate Creation

**What goes wrong:**
IMAP polling creates duplicate tickets when: the same email is processed twice due to a polling restart, an email's Message-ID is not stored and the UID is reset, a reply is not matched to its parent ticket and becomes a new ticket, or the IMAP connection drops mid-poll and re-polls the same unread window.

**Why it happens:**
IMAP polling is a stateful operation that looks stateless. Email ordering differs across providers (Google returns randomly, Microsoft newest-first). Reply detection depends on `In-Reply-To` and `References` headers being present — Outlook does not always include them. Developers test with Gmail in development and only discover Outlook differences in production.

**How to avoid:**
- Store IMAP message UID and Message-ID in a `processed_emails` table with a UNIQUE constraint; skip processing if already seen
- Use a distributed lock (Redis) per mailbox during polling to prevent concurrent polls from the same mailbox
- Multi-layer reply matching: check `References`/`In-Reply-To` headers first, then subject line for ticket number pattern (e.g., `[#12345]`), then fall back to creating a new ticket
- Auto-append ticket number to all outbound reply subjects: `Re: [#12345] Your original subject` — this provides a reliable fallback match even without proper MIME threading headers
- Test with Outlook, Thunderbird, and plain SMTP clients — not just Gmail

**Warning signs:**
- QA reports two tickets created from one email
- `processed_emails` table is missing from schema
- Reply emails appear as new tickets instead of comments on existing tickets

**Phase to address:** Email Integration phase — idempotency infrastructure for email must be built before the feature is considered complete.

---

### Pitfall 8: React Native Push Token Lifecycle Not Managed

**What goes wrong:**
Push tokens are stored on registration but never cleaned up. When a user logs out and logs in from a new device, the old token is still in the database. When they uninstall and reinstall, the token changes. Delivery receipts show tokens as invalid, but the system keeps sending to them, increasing cost and causing Expo/FCM/APNs to eventually reject all requests from the sender if the error rate is high enough.

**Why it happens:**
Sending push notifications is "the fun part" — developers implement it and it works in testing. Token cleanup and receipt processing are operational concerns that don't surface in demos. Testing on simulators or Expo Go (which doesn't support real push in SDK 53+) masks the problem.

**How to avoid:**
- `push_tokens` table must store: `userId`, `expoPushToken`, `platform` (ios/android), `deviceId`, `status` (active/invalid), `createdAt`, `updatedAt`
- Upsert (not insert) tokens on sign-in using `deviceId` as the unique key; delete all tokens for a user on sign-out
- Implement Expo Push Receipt processing as a background job that runs 15-30 minutes after sending — receipts indicate invalid tokens; mark them inactive immediately
- APNs credentials must be environment-specific: development and production APNs use different certificates/keys — "works in debug but fails on TestFlight" is always an APNs environment mismatch
- iOS requires real device for push; Android emulator does not support FCM — the development workflow must use physical devices from the start

**Warning signs:**
- Push delivery rate drops steadily week-over-week as tokens become stale
- "It works in Expo Go" — Expo Go doesn't support real push notifications in SDK 53+
- No receipt-processing job in the background worker list
- Token table has no `status` column or cleanup logic

**Phase to address:** Mobile App phase — push token lifecycle must be fully designed before the first notification is sent.

---

### Pitfall 9: CMDB Reconciliation Without a Precedence Policy

**What goes wrong:**
The .NET agent reports hardware inventory. A human administrator has manually edited the same CI's record. The agent polls again and overwrites the manual edit. Or two agents report conflicting data for the same physical device (e.g., one reports it as a Windows Server, another as a workstation due to naming). The CMDB fills with duplicate or conflicting CIs, making impact analysis unreliable.

**Why it happens:**
Reconciliation logic is built to import agent data but not to decide what happens when data conflicts with existing records. "Last write wins" is the default behavior when no policy exists. Duplicate CI detection is an afterthought.

**How to avoid:**
- Define a data source precedence policy before writing any reconciliation code: agent data wins on hardware fields (CPU, RAM, serial number); human edits win on relationship and ownership fields; conflicts are flagged for review, not silently overwritten
- CI identification must use stable unique keys: MAC address + hostname + serial number combination, not any single field alone
- When agent data conflicts with an existing manually-set field, write to a `ci_reconciliation_conflicts` table and surface a review queue in the UI — do not overwrite
- Agent check-in timestamps must be stored; CIs not seen for >N days are flagged as "possibly decommissioned" not deleted
- Test with two agents reporting data for the same machine under different names

**Warning signs:**
- Manual CI edits disappear after the next agent poll
- CMDB shows duplicate entries for the same physical machine
- No `ci_reconciliation_conflicts` or similar conflict queue exists

**Phase to address:** CMDB / Agent phase — reconciliation policy must be specified as acceptance criteria before agent ingestion code is written.

---

### Pitfall 10: planGate Enforced Only at the API, Not in the UI

**What goes wrong:**
The `planGate` middleware correctly rejects API calls for features above the tenant's plan. However, the frontend still shows the feature — buttons, menu items, and pages are visible. Users click them, get 403 errors with no explanation, and conclude the product is broken rather than understanding they need to upgrade.

**Why it happens:**
API enforcement and UI enforcement are built independently. The API gate is implemented first (it's a security requirement). The UI gate is deferred ("we'll add upgrade prompts later"). "Later" never comes before the first customer demo.

**How to avoid:**
- Create a `usePlan()` hook that reads the tenant's current plan from a global context
- Every feature component that is plan-gated must use `usePlan()` to render either the feature or an upgrade prompt — not a 403 error
- Define the full plan capability matrix in a single shared config (`packages/plan-config`) imported by both API middleware and the frontend hook — one source of truth
- The upgrade prompt must link directly to the billing upgrade flow, not just say "contact sales"
- Test plan enforcement from the UI perspective in QA: subscribe a test tenant to the Free plan and walk through every gated feature

**Warning signs:**
- Users report seeing buttons that do nothing (unhandled 403)
- Plan gating config is defined separately in API middleware and in frontend conditional renders
- No `usePlan()` or equivalent hook exists

**Phase to address:** Billing integration phase — UI plan enforcement must ship alongside API enforcement, not after.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip Prisma tenant middleware; add WHERE tenantId manually per query | Faster initial development | First missed WHERE clause is a data breach; impossible to audit | Never |
| Process Stripe webhooks synchronously in the handler | Less infrastructure to set up | Stripe retries on timeout causing duplicate processing; webhook delivery failures | Never |
| Store JWT in localStorage | Simpler auth flow | XSS-accessible; OWASP top 10 vulnerability | Never |
| Poll IMAP every 5 minutes instead of 1 minute | Lower server load | Users wait up to 5 minutes for ticket creation from email | Acceptable for MVP if communicated |
| Skip push receipt processing | One less background job | Stale token accumulation; eventual delivery failure rate spikes | Only if deferring mobile entirely |
| Cache without tenantId prefix | Simpler cache keys | Cross-tenant cache poisoning | Never |
| Hardcode Stripe Price IDs in the database | Easier to manage locally | Price IDs differ between test/production environments; causes plan enforcement bugs | Acceptable if documented and swapped before production |
| Single JWT secret for both tenant API and owner admin | Less configuration | Owner admin endpoints accessible with tenant tokens; complete isolation failure | Never |
| SLA deadline as duration, recalculated on every read | Simpler schema | Clock drift, timezone bugs, pause/resume calculation errors compound over time | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe Webhooks | Processing business logic synchronously inside the handler | Verify signature → enqueue to BullMQ → return 200 immediately; process in worker |
| Stripe Webhooks | Assuming event delivery order matches event creation order | Each handler must work from current Stripe API state; handle missing records by fetching from Stripe |
| Stripe Checkout | Relying solely on webhook to update subscription state post-checkout | Add `/billing/sync-checkout` endpoint that synchronously queries Stripe on redirect |
| Stripe Plans | Hardcoding plan capabilities in application code separate from API middleware | Single plan config package consumed by both API middleware and frontend hooks |
| IMAP Polling | Not storing processed Message-IDs | Store Message-ID + UID in `processed_emails` with UNIQUE constraint before processing |
| IMAP Reply Matching | Testing only with Gmail (which has proper MIME threading) | Test with Outlook — rely on subject-line ticket number pattern as fallback |
| APNs | Using development credentials in production builds | Separate APNs keys per environment; `APNS_ENVIRONMENT=production` must be explicit |
| Expo Push | Testing in Expo Go | SDK 53+ does not support push in Expo Go; require dev builds for push testing from day one |
| FCM | Never fetching push receipts | Schedule a receipt-check job 15-30 min after batch sends; deactivate invalid tokens |
| Agent → CMDB | Last-write-wins on CI fields | Define precedence policy; write conflicts to review queue instead of overwriting |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 queries on ticket list with SLA status | Ticket list page takes 3-10s at >500 tickets | Eager load SLA record with ticket in a single join | ~100 concurrent users |
| Scanning all tenants' tickets for SLA breach check | Worker CPU spikes every minute; DB query time grows linearly with ticket volume | Index on `(tenant_id, sla_breach_at)` where `status = 'open'`; query only open tickets past deadline | ~10K open tickets |
| Full CMDB reconciliation on every agent check-in | Agent check-in latency grows; DB write contention | Diff agent payload against last known state; only write changed fields | ~500 managed devices |
| Sending push notifications synchronously in the request | Ticket assignment API call takes 2-5s | Push sending must always be a background job; API returns immediately | First user |
| IMAP connection per polling cycle | New TLS handshake every minute; mailbox rate limiting | Maintain persistent IMAP connection with keepalive; reconnect on error | ~10 mailboxes |
| Loading all ticket history for email threading on every new email | Email polling slows as ticket history grows | Index `processed_emails` on `message_id`; use hash lookup not full scan | ~50K processed emails |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Shared JWT secret between tenant API and owner admin portal | Tenant user forges admin-scoped token | Separate secrets, separate middleware, separate deployment |
| tenantId taken from request body instead of JWT claims | Tenant A sends `tenantId: tenantB_id` to access another tenant's data | Extract tenantId exclusively from verified JWT payload; never trust client-supplied tenantId |
| JWT stored in localStorage | XSS attack reads token; full account takeover | HttpOnly cookies for refresh tokens; in-memory short-lived access tokens |
| Missing `stripeWebhookSecret` signature verification | Attacker sends fake webhook granting free access | Always verify `stripe.webhooks.constructEvent()` before any processing |
| Impersonation tokens without expiry or audit log | Owner admin session persists indefinitely; no audit trail | 15-minute max TTL; log every impersonation event with admin identity and timestamp |
| planGate checking tenant's plan without checking subscription status | Expired subscription still has plan-tier access | Gate must check BOTH plan tier AND `subscriptionStatus === 'active'` |
| Background jobs with no tenantId assertion | Cross-tenant data access | Every job processor asserts `tenantId` is present in payload; throw if absent |
| CMDB agent authentication with shared secret | Any agent can report data for any tenant | Per-tenant agent tokens; agent registration flow must be tenant-scoped |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| API returns 403 for plan-gated features with no UI context | User thinks the feature is broken, not that they need to upgrade | Show upgrade modal with plan comparison before any API call is made |
| Email-to-ticket confirmation email not sent | User doesn't know their email created a ticket; submits again | Send immediate confirmation email with ticket number and portal link |
| SLA breach alert fires but shows no action | Agent gets notified but can't act from the notification | Push notification deep-links directly to the ticket |
| Trial expiry shown only as a banner | MSP admins don't notice until service stops | Show countdown in billing page, email at 7 days, 3 days, and 1 day before expiry |
| Mobile app shows full desktop feature set | Overwhelming UI for field technicians | Mobile app shows only: My Tickets, Assign/Reassign, Status Update, Comment — not full ITSM |
| Ticket creation from email fails silently | User thinks they submitted but nothing happened | Queue failed email parsing attempts; alert owner admin; fall back to raw email storage |

---

## "Looks Done But Isn't" Checklist

- [ ] **Multi-tenant isolation:** Every query tested with a second tenant in the database — verify Tenant B cannot see Tenant A's data
- [ ] **Stripe webhook handling:** Receipt of the same event ID twice must produce identical database state (idempotency test)
- [ ] **SLA timers:** Pause → resume → pause → resume sequence produces correct remaining time; verify against a manually calculated expected value
- [ ] **Email-to-ticket:** Reply to an existing ticket email must attach a comment, not create a new ticket — verified with both Gmail and Outlook headers
- [ ] **Push notifications:** Token cleanup verified: old token deactivated on user sign-out; new token registered on sign-in from second device
- [ ] **planGate:** Free-plan tenant cannot access paid features via direct API call with a valid JWT — not just via UI
- [ ] **Owner admin isolation:** A JWT signed by the tenant auth system must be rejected by the owner admin API
- [ ] **CMDB reconciliation:** Agent check-in does not overwrite manually-set relationship fields; conflicting data goes to review queue
- [ ] **Background workers:** All workers log `tenantId` on every operation; grep logs confirm no cross-tenant ID mixing
- [ ] **Trial expiry:** Tenant whose trial has expired cannot access the application; Stripe subscription is cancelled; dunning email sent

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cross-tenant data leak discovered in production | HIGH | Immediate: revoke all active sessions, take affected endpoints offline. Identify scope of leak. Notify affected tenants. Audit all queries for missing tenant scope. Re-test entire query surface before re-enabling. |
| Duplicate tickets from email processing | MEDIUM | Add Message-ID deduplication table. Write migration to identify and merge duplicates (preserve all comments, use earliest ticket number). Re-process affected emails with dedup logic. |
| Stripe webhook events processed multiple times | MEDIUM | Build idempotency table retroactively. Audit side effects (emails sent, plan changes applied). Reverse double-applied changes manually per affected customer. |
| SLA timer math bug (systematic drift) | MEDIUM | Identify systematic offset. Write a one-time migration to recalculate all open ticket SLA deadlines. Document correction for any SLA breach reports in the affected window. |
| Push token table corrupted with stale tokens | LOW | Write a job to send a test notification to all stored tokens; deactivate any that return DeviceNotRegistered errors. |
| Owner admin JWT secret shared with tenant API | HIGH | Rotate both secrets immediately (all sessions invalidated). Audit admin access logs for any tenant-originated admin calls. Redeploy both apps with separate secrets. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing tenantId query scope | Foundation / Core API | Cross-tenant isolation test suite passes; Tenant B cannot see Tenant A data |
| Background worker tenant context leakage | Background Workers | Log analysis shows tenantId tagged on every log line; Redis keys all prefixed with tenantId |
| Owner admin not truly isolated | Foundation / Auth | JWT from tenant API rejected by admin API; separate secrets confirmed in env config |
| Stripe webhook race condition on checkout | Billing Integration | QA: complete checkout, immediately verify plan shows as active (no refresh required) |
| Stripe webhook not idempotent | Billing Integration | Send same webhook event twice; database state identical; no duplicate emails |
| SLA timer drift | SLA Monitoring / Background Workers | Pause/resume sequence test; SLA deadline math verified against manual calculation |
| Email-to-ticket duplicates | Email Integration | Same email processed twice produces one ticket; Outlook reply matches parent ticket |
| Push token lifecycle not managed | Mobile App | Sign out clears tokens; second device sign-in upserts new token; receipt job deactivates bad tokens |
| CMDB reconciliation without precedence policy | CMDB / Agent | Agent re-check-in does not overwrite manually-edited CI fields; conflicts visible in review queue |
| planGate enforced only in API, not UI | Billing Integration | Free-plan tenant sees upgrade prompts, not 403 errors; paid UI features hidden from free UI |

---

## Sources

- [Multi-Tenant Leakage: When Row-Level Security Fails in SaaS (InstaTunnel, Jan 2026)](https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c)
- [Data Isolation in Multi-Tenant SaaS: Architecture & Security Guide (Redis)](https://redis.io/blog/data-isolation-multi-tenant-saas/)
- [Tenant Data Isolation: Patterns and Anti-Patterns (Propelius)](https://propelius.ai/blogs/tenant-data-isolation-patterns-and-anti-patterns)
- [Preventing Cross-Tenant Data Leakage (Agnite Studio)](https://agnitestudio.com/blog/preventing-cross-tenant-leakage/)
- [Best Practices I Wish We Knew When Integrating Stripe Webhooks (Stigg)](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks)
- [Billing Webhook Race Condition Solution Guide (Steven Yung / ExcessiveCoding)](https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide)
- [Building Reliable Stripe Subscriptions: Webhook Idempotency and Optimistic Locking (DEV Community)](https://dev.to/aniefon_umanah_ac5f21311c/building-reliable-stripe-subscriptions-in-nestjs-webhook-idempotency-and-optimistic-locking-3o91)
- [Expo Push Notifications: 5 Critical Setup Mistakes (Sashido)](https://www.sashido.io/en/blog/expo-push-notifications-setup-caveats-troubleshooting)
- [Expo Push Notifications Troubleshooting and FAQ (Official Expo Docs)](https://docs.expo.dev/push-notifications/faq/)
- [Automated Discovery and Reconciliation in CMDB (Rezolve AI)](https://www.rezolve.ai/blog/automated-discovery-and-reconciliation-in-cmdb)
- [ServiceNow CMDB IRE — Identification and Reconciliation Engine (ServiceNow Guru)](https://servicenowguru.com/cmdb/servicenow-cmdb-identification-and-reconciliation-engine-ire/)
- [Identity Management for Multi-Tenant SaaS Applications (Security Boulevard, 2026)](https://securityboulevard.com/2026/03/identity-management-for-multi-tenant-saas-applications/)
- [Six Shades of Multi-Tenant Mayhem: Invisible Vulnerabilities (Borabastab, May 2025)](https://borabastab.medium.com/six-shades-of-multi-tenant-mayhem-the-invisible-vulnerabilities-hiding-in-plain-sight-182e9ad538b5)
- [Duplicate Tickets / IMAP Discussion (osTicket Forum)](https://forum.osticket.com/d/89730-resolved-duplicate-tickets-imap-ostickets-v1914)
- [Email Syncro Mail-to-Ticket Duplicate (iTop SourceForge Discussion)](https://sourceforge.net/p/itop/discussion/922361/thread/abfc772103/)
- [Best Practices for SaaS Billing (Stripe)](https://stripe.com/resources/more/best-practices-for-saas-billing)

---
*Pitfalls research for: Multi-tenant SaaS ITSM Platform (MeridianITSM)*
*Researched: 2026-03-19*
