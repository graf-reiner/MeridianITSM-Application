---
phase: 03-core-itsm
plan: 03
subsystem: api
tags: [email, smtp, imap, nodemailer, imapflow, mailparser, bullmq, redis, encryption]

requires:
  - phase: 03-01
    provides: ticket.service.ts createTicket/addComment, planGate, RBAC, ticket data model
  - phase: 01-foundation
    provides: encryption utilities (encrypt/decrypt), uploadFile, prisma, redis, bullmq workers

provides:
  - SMTP outbound email service with template rendering and variable substitution
  - IMAP inbound polling with reply threading (headers + TKT-XXXXX) and Redis deduplication
  - Email account CRUD API routes with encrypted credential storage
  - SMTP/IMAP connection test endpoints
  - BullMQ email-polling repeatable worker (every 5 min, cross-tenant)
  - BullMQ email-notification event-driven worker (per-tenant SMTP send)

affects: [settings-ui, ticket-notifications, portal-email-to-ticket]

tech-stack:
  added:
    - nodemailer (SMTP transport, apps/api + apps/worker)
    - imapflow (IMAP client, apps/api + apps/worker)
    - mailparser (RFC822 parsing, apps/api + apps/worker)
    - @types/nodemailer, @types/mailparser
  patterns:
    - EmailAccount type derived via PrismaClient inference (avoids cross-package @prisma/client import)
    - Worker-side service duplication (email-inbound.service.ts copied to apps/worker/src/services/ to avoid cross-app imports)
    - Redis SISMEMBER deduplication with 90-day TTL on Message-ID sets
    - Dual reply-threading strategy: MIME In-Reply-To/References headers first, TKT-XXXXX subject fallback

key-files:
  created:
    - apps/api/src/services/email.service.ts
    - apps/api/src/services/email-inbound.service.ts
    - apps/api/src/routes/v1/email-accounts/index.ts
    - apps/worker/src/services/email-inbound.service.ts
  modified:
    - apps/api/src/routes/v1/index.ts (registered emailAccountRoutes)
    - apps/worker/src/workers/email-polling.ts (replaced stub)
    - apps/worker/src/workers/email-notification.ts (replaced stub)
    - apps/worker/src/index.ts (added email-polling-repeatable job)
    - apps/api/package.json (nodemailer, imapflow, mailparser)
    - apps/worker/package.json (nodemailer, imapflow, mailparser)

key-decisions:
  - "EmailAccount type derived from PrismaClient['emailAccount']['findUniqueOrThrow'] return type — @prisma/client not a direct dependency of apps/api"
  - "email-inbound service duplicated in worker (not shared package) to avoid cross-app imports — follows mapStripeStatus precedent"
  - "pollMailbox uses message.source guard before simpleParser — imapflow source field is Buffer | undefined"
  - "html content uses `parsed.html !== false` guard — mailparser returns false (not undefined) when HTML is absent"
  - "Email polling worker uses concurrency 1 (cross-tenant sentinel) — prevents race conditions across multiple tenant mailboxes"
  - "Attachment records only created when requestedById is known — uploadedById is non-nullable in schema"

requirements-completed: [EMAL-01, EMAL-02, EMAL-03, EMAL-04, EMAL-05, EMAL-06, EMAL-07, EMAL-08]

duration: 17min
completed: 2026-03-20
---

# Phase 03 Plan 03: Email System Summary

**Full email pipeline: SMTP/IMAP account management with encrypted credentials, inbound email-to-ticket via IMAP polling with MIME header and TKT-XXXXX reply threading, Redis Message-ID deduplication, and BullMQ workers replacing Phase 1 stubs**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-20T23:43:16Z
- **Completed:** 2026-03-20T23:59:56Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Email account CRUD API with AES-256-GCM encrypted SMTP/IMAP passwords, returning `hasSmtpPassword`/`hasImapPassword` boolean masks instead of raw ciphertext
- Inbound IMAP polling service: dual threading strategy (In-Reply-To/References headers → TKT-XXXXX subject fallback), Redis SISMEMBER deduplication with 90-day TTL
- Email-polling BullMQ worker polls all active tenant mailboxes every 5 minutes with per-account error isolation; email-notification worker sends branded HTML via tenant SMTP on BullMQ job trigger
- SMTP and IMAP connection test endpoints let admins verify credentials before saving

## Task Commits

1. **Task 1: Email outbound service, inbound service, and email account routes** - `56616e2` (feat)
2. **Task 2: Email polling and notification workers (replace stubs)** - `32c8cf6` (feat)

## Files Created/Modified

- `apps/api/src/services/email.service.ts` - nodemailer SMTP transport, template rendering with `{{var}}` substitution, connection test functions
- `apps/api/src/services/email-inbound.service.ts` - IMAP polling, reply threading, Redis dedup, ticket/comment creation
- `apps/api/src/routes/v1/email-accounts/index.ts` - CRUD routes with encrypt/decrypt, test-smtp/test-imap endpoints
- `apps/api/src/routes/v1/index.ts` - registered emailAccountRoutes
- `apps/worker/src/services/email-inbound.service.ts` - worker-side copy of inbound service (no cross-app import)
- `apps/worker/src/workers/email-polling.ts` - replaced stub: queries all active EmailAccount records, polls each
- `apps/worker/src/workers/email-notification.ts` - replaced stub: nodemailer SMTP + template rendering
- `apps/worker/src/index.ts` - added `email-polling-repeatable` job (*/5 * * * *)

## Decisions Made

- `EmailAccount` type derived via `Awaited<ReturnType<PrismaClient['emailAccount']['findUniqueOrThrow']>>` — avoids a direct `@prisma/client` import which is not a declared dependency of apps/api
- Worker-side `email-inbound.service.ts` is a near-copy of the API service — follows established pattern (see `mapStripeStatus` duplication in stripe-webhook.ts) for avoiding cross-app imports in the monorepo
- `imapflow` `message.source` is typed as `Buffer | undefined` — added guard before `simpleParser` call
- `mailparser` `parsed.html` returns `false` (not `undefined`) when no HTML body — handled with `!== false` guard
- Email polling worker uses `concurrency: 1` since it's a cross-tenant sentinel that processes all mailboxes sequentially per job run
- Attachment DB records require `uploadedById` (non-nullable) — skipped when `requestedById` is null (unknown sender)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ImapFlow requires named import, not default import**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan spec showed `import ImapFlow from 'imapflow'` but imapflow uses `module.exports.ImapFlow = ImapFlow` — named export only
- **Fix:** Changed to `import { ImapFlow } from 'imapflow'`
- **Files modified:** Both email services
- **Verification:** TypeScript compilation passes
- **Committed in:** `56616e2` (Task 1 commit)

**2. [Rule 1 - Bug] EmailAccount type not exported from @meridian/db**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `@meridian/db` only exports `prisma`, `PrismaClient`, and `withTenantScope` — no model types
- **Fix:** Derive type via `Awaited<ReturnType<PrismaClient['emailAccount']['findUniqueOrThrow']>>`
- **Files modified:** email.service.ts, email-inbound.service.ts (both api and worker)
- **Verification:** TypeScript compilation passes
- **Committed in:** `56616e2`, `32c8cf6`

**3. [Rule 1 - Bug] mailparser html field is `string | false`, not `string | undefined`**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `parsed.html` can be `false` when no HTML body exists — `?? '(No content)'` does not handle `false`
- **Fix:** Added `const htmlContent = parsed.html !== false ? (parsed.html ?? '') : '';` before assignment
- **Files modified:** email-inbound.service.ts (api and worker)
- **Verification:** TypeScript compilation passes, no type error
- **Committed in:** `56616e2`, `32c8cf6`

**4. [Rule 1 - Bug] uploadFile signature is (tenantId, resource, filename, body, contentType) — not (buffer, key, contentType)**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan spec implied 3-arg uploadFile but packages/core/src/utils/storage.ts has 5-arg signature
- **Fix:** Updated calls to pass tenantId, resource path, filename, buffer, contentType separately
- **Files modified:** email-inbound.service.ts (api and worker)
- **Verification:** TypeScript compilation passes
- **Committed in:** `56616e2`, `32c8cf6`

---

**Total deviations:** 4 auto-fixed (all Rule 1 - type/signature bugs from plan spec)
**Impact on plan:** All auto-fixes were TypeScript correctness issues. No scope changes. Functionality matches plan spec exactly.

## Issues Encountered

- `pnpm --filter worker exec tsc --noEmit` reports 3 pre-existing errors in `trial-expiry.test.ts` — these are out-of-scope and present before this plan's changes. New email code has zero errors.

## Next Phase Readiness

- Email account management is fully operational — settings UI can use these routes in Plan 06
- Email-to-ticket pipeline ready for testing once IMAP credentials are configured
- Notification worker ready to receive BullMQ jobs from ticket events (ticket creation, status change, SLA breach)

---
*Phase: 03-core-itsm*
*Completed: 2026-03-20*
