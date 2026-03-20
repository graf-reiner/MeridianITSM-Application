# Phase 3: Core ITSM — Research

**Researched:** 2026-03-20
**Domain:** ITSM lifecycle: tickets, SLA, email-to-ticket, knowledge base, portal, settings, notifications, reporting
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SLA Visualization & Behavior**
- Countdown timer with color bands: green → yellow (75%) → red (90%) → breached. Compact enough for ticket header area
- Paused SLA shows "PAUSED" badge with frozen timer and reason. Resumes when ticket leaves PENDING status
- SLA breach triggers: red "BREACHED" badge on ticket, notification to assignee + their manager, configurable auto-escalation option
- Business hours configured per SLA policy with timezone support — different hours per priority level. Essential for MSPs with customers in different timezones
- SLA monitor worker (already stubbed in `apps/worker/src/workers/sla-monitor.ts`) runs every minute checking all active SLA timers

**Email System Behavior**
- Per-tenant mailbox configuration — each tenant configures their own SMTP/IMAP/POP3 credentials in settings. Worker polls each tenant's mailbox independently
- Reply threading uses dual strategy: primary match on In-Reply-To/References MIME headers, fallback extracts TKT-XXXXX from subject line
- Email deduplication via Message-ID header (stored per tenant, checked before ticket creation)
- Inbound email attachments auto-extracted and stored in MinIO/S3, linked to created ticket. Size limit configurable per tenant (default 25MB per email)
- Outbound notifications use branded HTML templates with variable substitution ({{ticketNumber}}, {{status}}, {{assignee}}, etc.). Default template provided, admin can customize logo/colors
- Email polling worker (already stubbed in `apps/worker/src/workers/email-polling.ts`) runs every 5 minutes
- Email notification worker (already stubbed in `apps/worker/src/workers/email-notification.ts`) event-driven via BullMQ

**Portal & End-User Experience**
- Portal shares same shadcn/ui component library and theme as dashboard — simplified sidebar with fewer items, no admin sections, cleaner forms. Same product, scoped down
- Service request form is category-driven: user picks category first, then form shows category-specific fields
- End users see simplified SLA info: "We aim to respond within 4 hours" with green/yellow/red indicator. No detailed countdown — that's internal
- End-user notifications: email when ticket is updated + in-app notification bell with unread count in portal
- Middleware auto-redirects end_user role from /dashboard to /portal (PRTL-06)

### Claude's Discretion
- Ticket list/detail page layout, density, and interaction patterns
- Bulk actions on ticket list (if any in Phase 3 scope)
- Inline editing vs modal approach for ticket fields
- Dashboard widget arrangement and data visualization choices
- TipTap editor configuration and toolbar options
- Article search implementation (full-text via PostgreSQL ts_vector or simple ILIKE)
- Article list/detail layout
- Settings page organization (tabs, sidebar nav, etc.)
- User/role/group CRUD page layouts
- Queue and category management interfaces
- Dashboard chart types and layouts
- Scheduled report format and delivery mechanism
- Report filtering and date range selection UI

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TICK-01 | Create ticket with title, description, type, priority, category | Fastify route + Prisma Ticket model; planGate for ticket count limits |
| TICK-02 | Auto-generate sequential TKT-XXXXX per tenant | Prisma `ticketNumber Int` + DB sequence via `SELECT MAX(ticketNumber)+1` under transaction |
| TICK-03 | Status transitions: NEW→OPEN→IN_PROGRESS→PENDING→RESOLVED→CLOSED→CANCELLED | State machine in ticket service; TicketStatus enum already in schema |
| TICK-04 | Comments with PUBLIC/INTERNAL visibility | TicketComment model with CommentVisibility enum; INTERNAL gated by staff role |
| TICK-05 | File attachments stored in MinIO/S3 | @fastify/multipart for upload; @aws-sdk/client-s3 already in API deps |
| TICK-06 | Immutable TicketActivity audit trail | TicketActivity model; write-only append in ticket service on every field change |
| TICK-07 | Ticket list with filter/search | Prisma where clauses; PostgreSQL full-text search or ILIKE on title/description |
| TICK-08 | Ticket assignment to agents or groups | assignedToId + Queue.userGroupId pattern |
| TICK-09 | Queue-based routing with auto-assignment | Queue.autoAssign + Queue.assignmentRules JSON; evaluated on ticket creation |
| TICK-10 | Link tickets to knowledge articles | TicketKnowledgeArticle join table already in schema |
| TICK-11 | Link tickets to CMDB CIs | CmdbTicketLink model already in schema |
| TICK-12 | Time tracking on comments | TicketComment.timeSpentMinutes field already in schema |
| SLA-01 | SLA policies with response/resolution targets per priority (P1-P4) | SLA model with p1-p4 response/resolution minutes already in schema |
| SLA-02 | SLA timers start on creation, track targets | Ticket.slaBreachAt + Ticket.slaResponseAt calculated at ticket creation |
| SLA-03 | Breach detection at 75% and 90% thresholds | sla-monitor worker checks elapsed/target ratio every minute |
| SLA-04 | Business hours configuration | SLA.businessHours + businessHoursStart/End + businessDays; timezone math with date-fns-tz |
| SLA-05 | SLA countdown visualization on ticket | React component reading slaBreachAt; color band logic with setInterval 1-second updates |
| SLA-06 | Background worker monitors every minute | sla-monitor.ts stub — implement BullMQ repeatable job |
| EMAL-01 | Email account config for SMTP/IMAP/POP3 with encrypted credentials | EmailAccount model; AES encryption already implemented (INFR-04) |
| EMAL-02 | Inbound email creates tickets automatically | imapflow for IMAP; mailparser for parsing; worker creates Ticket records |
| EMAL-03 | Reply threading matches replies to tickets | In-Reply-To/References header match; fallback subject regex TKT-\d{5} |
| EMAL-04 | Deduplication via Message-ID | Store Message-ID per tenant; check before creating ticket |
| EMAL-05 | Outbound notifications for ticket events | nodemailer 8 via SMTP; email-notification worker dispatches on BullMQ events |
| EMAL-06 | Customizable HTML email templates | EmailTemplate model in schema; Handlebars-style variable substitution |
| EMAL-07 | Connection testing tool | API endpoint that opens SMTP/IMAP test connection and returns success/failure |
| EMAL-08 | Background polling every 5 minutes | email-polling.ts stub — implement BullMQ repeatable job |
| KB-01 | Articles with title, summary, TipTap rich text, tags | KnowledgeArticle.content stores TipTap JSON or HTML; @tiptap/react in web |
| KB-02 | Article lifecycle: DRAFT→IN_REVIEW→PUBLISHED→RETIRED | ArticleStatus enum already in schema |
| KB-03 | Full-text search | PostgreSQL ILIKE on title+summary+tags, or ts_vector on content |
| KB-04 | Helpful/not helpful voting | KnowledgeArticle.helpfulCount increment; per-user vote dedup via Redis or simple increment |
| KB-05 | Articles linkable to tickets | TicketKnowledgeArticle join table already in schema |
| KB-06 | View count tracking | KnowledgeArticle.viewCount increment on GET article detail |
| PRTL-01 | End-user portal at /portal | Next.js app dir: apps/web/src/app/portal/ |
| PRTL-02 | Submit service requests via simplified form | Category-driven form; creates Ticket with type=SERVICE_REQUEST |
| PRTL-03 | View ticket status and add comments | Portal ticket detail page; only PUBLIC comments visible to end_user |
| PRTL-04 | Browse published knowledge articles | Filter KnowledgeArticle where status=PUBLISHED and visibility=PUBLIC |
| PRTL-05 | View assigned assets | Asset records where assignedToId = currentUser.id |
| PRTL-06 | Middleware auto-redirects end_user to /portal | Next.js middleware.ts checks role from JWT |
| SETT-01 | User management CRUD | Admin pages; user.service.ts with create/edit/disable/password-reset |
| SETT-02 | Role management with permission editor | Role CRUD; permissions stored as JSON array |
| SETT-03 | User group management | UserGroup CRUD; UserGroupMember join table |
| SETT-04 | Queue management with assignment rules | Queue CRUD; assignmentRules stored as JSON |
| SETT-05 | SLA policy management | SLA CRUD; business hours configuration UI |
| SETT-06 | Category management (hierarchical) | Category CRUD with parentId self-reference; icon and color pickers |
| SETT-07 | Site management | Site CRUD (physical locations) |
| SETT-08 | Vendor management | Vendor CRUD |
| SETT-09 | Business unit management | BusinessUnit CRUD |
| SETT-10 | Contract management | Contract CRUD with financials and SLA links |
| SETT-11 | Tenant branding settings | Tenant.settings JSON; logo upload to MinIO |
| SETT-12 | System/worker log viewer with SSE streaming | Fastify SSE endpoint; BullMQ job logs via Redis stream or in-memory buffer |
| NOTF-01 | In-app notification center with read/unread | Notification model in schema; API endpoints for list/mark-read |
| NOTF-02 | 12 notification types | NotificationType enum already in schema with all 12 types |
| NOTF-03 | Mark individual or all notifications as read | PATCH /api/v1/notifications/:id/read and PATCH /api/v1/notifications/read-all |
| NOTF-04 | Notification dispatch orchestrator | notification.service.ts: writes Notification row + enqueues email-notification job |
| REPT-01 | Main dashboard with ticket stats and recent activity | TanStack Query + Recharts; aggregate queries on Ticket model |
| REPT-02 | Ticket reports (CSV/JSON) with filters | Server-side query + csv-stringify or JSON.stringify; streaming response |
| REPT-03 | Change reports and analytics | Same pattern as REPT-02 for Change model |
| REPT-04 | SLA compliance reports | Query tickets with slaBreachAt vs resolvedAt; compliance rate calculation |
| REPT-05 | CMDB inventory and relationship reports | Deferred to Phase 4 (CMDB models built there) |
| REPT-06 | Scheduled report generation with email delivery | ScheduledReport model; cron via BullMQ repeatable jobs; email via nodemailer |
| REPT-07 | System health analytics | Worker queue metrics via BullMQ getJobCounts(); DB row counts |
</phase_requirements>

---

## Summary

Phase 3 is the largest phase in the project — 57 requirement IDs across 6 functional areas. The good news is that the database schema is already 100% complete (all ticket, SLA, email, KB, notification, and report models exist in schema.prisma) and the three key worker stubs (sla-monitor, email-polling, email-notification) are already registered in BullMQ. This phase is almost entirely about implementing the business logic that the foundation has scaffolded.

The three areas requiring the most careful implementation are: (1) SLA business-hours timer math — elapsed time must exclude non-business hours and handle timezone offsets correctly, with pause/resume when status = PENDING; (2) email-to-ticket parsing — IMAP/POP3 polling requires robust MIME parsing and deduplication to prevent duplicate ticket creation from re-delivered messages; (3) the notification dispatch orchestrator — all ticket events must flow through a single service that writes Notification records AND enqueues email jobs, keeping the two channels in sync.

The frontend work is the largest volume item: 55 pages total across dashboard and portal, but the shadcn/ui component library, TanStack Query hooks, and Auth patterns are already established from Phases 1-2. The pattern is clear — each page follows the same structure as the billing page already built.

**Primary recommendation:** Plan this phase in 8 waves: (1) ticket CRUD + activity log, (2) SLA engine + monitor worker, (3) email system + polling worker, (4) knowledge base + TipTap, (5) end-user portal, (6) settings/configuration pages, (7) notifications + in-app center, (8) reporting + dashboard. Each wave has clear API + frontend tasks.

---

## Standard Stack

### Core (already installed or directly added)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `imapflow` | `^1.2.16` | IMAP4 client for email polling | Modern async/await IMAP; bundled TypeScript types; actively maintained |
| `mailparser` | `^3.9.4` | Parse raw email to structured object | Industry standard; handles MIME, attachments, headers, encoding |
| `nodemailer` | `^8.0.3` | SMTP outbound email | Node.js email standard; v8 is current stable (no @types needed — check below) |
| `@tiptap/react` | `^3.0.x` | Rich text editor for KB articles | ProseMirror-based; React 19 compatible; WYSIWYG |
| `@tiptap/starter-kit` | `^3.0.x` | TipTap bundled extensions | Includes Bold, Italic, Heading, Lists, Code, Blockquote |
| `date-fns` | `^4.1.0` | Date arithmetic for SLA timers | Already implied; tree-shakeable; `date-fns-tz` for timezone |
| `date-fns-tz` | `^3.2.0` | Timezone-aware date operations | Critical for business-hours SLA math across timezones |
| `recharts` | `^3.8.0` | Charts for reporting dashboard | React 19-compatible; declarative; no D3 expertise required |
| `@aws-sdk/client-s3` | `^3.x` | MinIO/S3 file operations | Already in API deps; use for attachment upload/download |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tiptap/extension-image` | `^3.0.x` | Image upload in TipTap | KB articles with screenshots |
| `@tiptap/extension-link` | `^3.0.x` | Hyperlinks in TipTap | KB article external references |
| `@tiptap/extension-code-block-lowlight` | `^3.0.x` | Syntax-highlighted code blocks | Technical KB articles |
| `lowlight` | `^3.3.0` | Syntax highlighting for code-block | Required by TipTap code-block extension |
| `@types/nodemailer` | `^6.4.x` | TypeScript types for nodemailer 8 | nodemailer 8 ships without bundled types |
| `@types/mailparser` | `^3.4.x` | Types for mailparser | mailparser 3 has no bundled types |
| `croner` | `^10.0.1` | Cron expression parser for scheduled reports | Lightweight; used to calculate nextRunAt from cron expression |
| `cron-parser` | `^5.5.0` | Alternative cron parser | Either croner or cron-parser; croner preferred (actively maintained) |
| `csv-stringify` | bundled with `csv` | CSV export for reports | Streaming CSV generation; avoid building custom CSV escaping |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `imapflow` | `node-imap` + `imap-simple` | node-imap is older, callback-based; imapflow is modern async/await |
| `recharts` | `Chart.js` + `react-chartjs-2` | Chart.js requires canvas; recharts is pure SVG/React — better SSR |
| `date-fns-tz` | `luxon` or `moment-timezone` | date-fns-tz integrates with existing date-fns; luxon is heavier |
| `@tiptap/react` | `Quill`, `Slate` | TipTap is the spec-required library; do not substitute |
| PostgreSQL ILIKE search | Elasticsearch | ILIKE is sufficient for KB article count at MSP scale; avoids extra infra |

**Installation (new packages to add):**
```bash
# API app
pnpm --filter api add nodemailer imapflow mailparser @types/nodemailer @types/mailparser croner

# Web app
pnpm --filter web add @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-code-block-lowlight lowlight recharts date-fns date-fns-tz
```

**Version verification (confirmed 2026-03-20):**
- `nodemailer`: 8.0.3 (latest stable)
- `imapflow`: 1.2.16 (latest stable; bundled types at `lib/imap-flow.d.ts`)
- `mailparser`: 3.9.4 (latest stable)
- `@tiptap/react`: 3.20.4 (latest stable)
- `@tiptap/starter-kit`: 3.20.4
- `date-fns-tz`: 3.2.0 (latest stable)
- `recharts`: 3.8.0 (latest stable)
- `croner`: 10.0.1 (latest stable)

---

## Architecture Patterns

### Recommended Project Structure (new files this phase)

```
apps/api/src/
├── routes/v1/
│   ├── tickets/           # TICK-01 through TICK-12
│   │   └── index.ts       # GET list, POST create, GET/:id, PATCH/:id, DELETE/:id
│   ├── ticket-comments/   # TICK-04, TICK-12
│   ├── ticket-attachments/ # TICK-05
│   ├── sla/               # SLA-01 (CRUD)
│   ├── email-accounts/    # EMAL-01, EMAL-07
│   ├── knowledge/         # KB-01 through KB-06
│   ├── notifications/     # NOTF-01 through NOTF-03
│   ├── settings/          # SETT-01 through SETT-12
│   │   ├── users/
│   │   ├── roles/
│   │   ├── queues/
│   │   ├── categories/
│   │   └── ...
│   └── reports/           # REPT-01 through REPT-07
├── services/
│   ├── ticket.service.ts      # Core ticket lifecycle + activity logging
│   ├── sla.service.ts         # Business-hours math + timer calculation
│   ├── email.service.ts       # SMTP outbound + template rendering
│   ├── email-inbound.service.ts  # IMAP polling + ticket creation
│   ├── notification.service.ts   # Dispatch orchestrator
│   ├── storage.service.ts     # MinIO/S3 attachment operations
│   └── report.service.ts      # CSV/JSON generation + scheduled delivery

apps/worker/src/workers/
├── sla-monitor.ts          # Replace stub: check active SLA timers every minute
├── email-polling.ts        # Replace stub: poll each tenant's IMAP account
├── email-notification.ts   # Replace stub: send outbound notifications

apps/web/src/app/
├── dashboard/
│   ├── tickets/
│   │   ├── page.tsx           # Ticket list
│   │   ├── new/page.tsx       # Create ticket
│   │   └── [id]/page.tsx      # Ticket detail
│   ├── knowledge/
│   │   ├── page.tsx           # Article list
│   │   ├── new/page.tsx       # Create article
│   │   └── [id]/page.tsx      # Article detail + TipTap viewer
│   ├── settings/
│   │   ├── users/page.tsx
│   │   ├── roles/page.tsx
│   │   ├── queues/page.tsx
│   │   ├── sla/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── email/page.tsx
│   │   └── branding/page.tsx
│   └── reports/
│       └── page.tsx
├── portal/
│   ├── layout.tsx             # Simplified portal layout (fewer nav items)
│   ├── page.tsx               # Portal home
│   ├── tickets/
│   │   ├── page.tsx           # My tickets list
│   │   ├── new/page.tsx       # Submit service request
│   │   └── [id]/page.tsx      # Ticket status + comments
│   ├── knowledge/
│   │   └── page.tsx           # Browse published articles
│   └── assets/
│       └── page.tsx           # My assigned assets
└── middleware.ts              # Add end_user → /portal redirect
```

### Pattern 1: SLA Business-Hours Timer Calculation

**What:** Calculate effective elapsed time excluding non-business hours; compute `slaBreachAt` timestamp at ticket creation.

**When to use:** Every ticket creation and every SLA monitor check.

```typescript
// Source: date-fns-tz official docs + project SLA model
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addMinutes, isWeekend } from 'date-fns';

interface SlaPolicy {
  businessHours: boolean;
  businessHoursStart: string | null; // "09:00"
  businessHoursEnd: string | null;   // "17:00"
  businessDays: number[];            // [1,2,3,4,5] = Mon-Fri
  timezone: string;                  // "America/New_York"
}

/**
 * Calculate breach timestamp by adding `targetMinutes` of business time
 * to `startTime`. When businessHours=false, this is simple addMinutes().
 */
export function calculateBreachAt(
  startTime: Date,
  targetMinutes: number,
  policy: SlaPolicy,
): Date {
  if (!policy.businessHours) {
    return addMinutes(startTime, targetMinutes);
  }

  const tz = policy.timezone ?? 'UTC';
  const [startHour, startMin] = (policy.businessHoursStart ?? '09:00').split(':').map(Number);
  const [endHour, endMin] = (policy.businessHoursEnd ?? '17:00').split(':').map(Number);
  const businessDays = policy.businessDays.length ? policy.businessDays : [1, 2, 3, 4, 5];

  let remaining = targetMinutes;
  let current = toZonedTime(startTime, tz);

  while (remaining > 0) {
    const dayOfWeek = current.getDay();
    const isBusinessDay = businessDays.includes(dayOfWeek);

    if (!isBusinessDay) {
      // Skip to next day at businessHoursStart
      current = toZonedTime(fromZonedTime(
        new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, startHour, startMin, 0),
        tz,
      ), tz);
      continue;
    }

    const dayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), startHour, startMin, 0);
    const dayEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), endHour, endMin, 0);

    if (current < dayStart) current = dayStart;

    if (current >= dayEnd) {
      // Past business hours — advance to next business day start
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, startHour, startMin, 0);
      continue;
    }

    const minutesLeftToday = (dayEnd.getTime() - current.getTime()) / 60000;
    if (remaining <= minutesLeftToday) {
      current = addMinutes(current, remaining);
      remaining = 0;
    } else {
      remaining -= minutesLeftToday;
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, startHour, startMin, 0);
    }
  }

  return fromZonedTime(current, tz);
}
```

**SLA Pause/Resume:** When status changes to PENDING, record `sla_paused_at` in ticket metadata or a sidecar field. On resume (leaving PENDING), calculate pause duration and shift `slaBreachAt` forward by that duration.

```typescript
// On ticket status → PENDING:
await prisma.ticket.update({
  where: { id: ticketId, tenantId },
  data: { customFields: { ...existingCustomFields, slaPausedAt: new Date().toISOString() } },
});

// On ticket leaving PENDING:
const pausedAt = new Date(ticket.customFields?.slaPausedAt);
const pauseDurationMs = Date.now() - pausedAt.getTime();
const newBreachAt = new Date(ticket.slaBreachAt!.getTime() + pauseDurationMs);
await prisma.ticket.update({
  where: { id: ticketId, tenantId },
  data: {
    slaBreachAt: newBreachAt,
    customFields: { ...existingCustomFields, slaPausedAt: null },
  },
});
```

**Note:** The SLA model in schema.prisma does NOT have a `timezone` field. The planner should either add a migration to add `timezone String @default("UTC")` to the SLA model, OR store timezone in a JSON `metadata` field.

### Pattern 2: Email-to-Ticket (IMAP Polling)

**What:** Each worker job polls one tenant's IMAP inbox, processes unread messages, creates tickets or appends comments.

```typescript
// Source: imapflow docs at https://imapflow.com/
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { AES_decrypt } from '../lib/encryption.js'; // existing INFR-04 service

async function pollMailbox(account: EmailAccount): Promise<void> {
  const client = new ImapFlow({
    host: account.imapHost!,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: {
      user: account.imapUser!,
      pass: AES_decrypt(account.imapPasswordEnc!),
    },
    logger: false, // suppress verbose logs
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Fetch unread messages
      for await (const message of client.fetch('1:*', { envelope: true, source: true }, { uid: true })) {
        const parsed = await simpleParser(message.source);

        // Deduplication check
        const messageId = parsed.messageId;
        if (messageId && await isDuplicate(account.tenantId, messageId)) continue;

        // Threading: check In-Reply-To / References first
        const ticketFromHeaders = await findTicketByMimeHeaders(account.tenantId, parsed.references, parsed.inReplyTo);
        // Fallback: extract TKT-XXXXX from subject
        const ticketFromSubject = !ticketFromHeaders
          ? await findTicketBySubject(account.tenantId, parsed.subject ?? '')
          : null;

        const existingTicket = ticketFromHeaders ?? ticketFromSubject;

        if (existingTicket) {
          // Append as comment
          await appendEmailComment(existingTicket, parsed, account);
        } else {
          // Create new ticket
          await createTicketFromEmail(parsed, account);
        }

        // Mark as read / move to processed folder
        await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
```

**Threading storage:** Store processed Message-IDs in a Redis set per tenant: `email:msgids:{tenantId}` with a 90-day TTL. Also store ticket Message-ID when sending outbound so replies can match.

### Pattern 3: Notification Dispatch Orchestrator

**What:** Single service that all ticket events flow through. Writes Notification row + enqueues email job. This ensures both channels stay in sync.

```typescript
// apps/api/src/services/notification.service.ts
import { prisma } from '@meridian/db';
import { emailNotificationQueue } from '../queues/index.js'; // import from worker queues

interface NotifyPayload {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  resourceId?: string;
  resource?: string;
  emailData?: {
    to: string;
    templateName: string;
    variables: Record<string, string>;
  };
}

export async function notifyUser(payload: NotifyPayload): Promise<void> {
  // 1. Write in-app notification
  await prisma.notification.create({
    data: {
      tenantId: payload.tenantId,
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      resourceId: payload.resourceId,
      resource: payload.resource,
    },
  });

  // 2. Enqueue email notification (event-driven, async)
  if (payload.emailData) {
    await emailNotificationQueue.add('send-email', {
      tenantId: payload.tenantId,
      ...payload.emailData,
    });
  }
}
```

### Pattern 4: TipTap Rich Text Editor

**What:** TipTap React component for knowledge base article creation.

```typescript
// Source: TipTap React docs https://tiptap.dev/docs/editor/getting-started/install/react
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';

const lowlight = createLowlight();

export function ArticleEditor({ initialContent, onChange }: {
  initialContent?: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }), // disable default; use lowlight version
      Image,
      Link.configure({ openOnClick: false }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: initialContent ?? '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return <EditorContent editor={editor} />;
}
```

**Storage:** Store TipTap output as HTML string in `KnowledgeArticle.content`. Alternatively store as JSON (`editor.getJSON()`) for portability — the planner should choose one format and be consistent.

### Pattern 5: Ticket Sequential Number Generation

**What:** Generate TKT-NNNNN per tenant with no gaps under concurrent load.

```typescript
// Use SELECT FOR UPDATE or atomic increment in a transaction
async function getNextTicketNumber(tenantId: string): Promise<number> {
  const result = await prisma.$queryRaw<[{ max: number | null }]>`
    SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS max
    FROM tickets
    WHERE "tenantId" = ${tenantId}::uuid
  `;
  return result[0].max ?? 1;
}

// MUST be called within a transaction to prevent race conditions:
async function createTicket(data: CreateTicketInput) {
  return prisma.$transaction(async (tx) => {
    const nextNum = await tx.$queryRaw<[{ next: number }]>`
      SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
      FROM tickets
      WHERE "tenantId" = ${data.tenantId}::uuid
      FOR UPDATE
    `;
    return tx.ticket.create({
      data: { ...data, ticketNumber: nextNum[0].next },
    });
  });
}
```

The `@@unique([tenantId, ticketNumber])` constraint in the schema is a safety net but `FOR UPDATE` inside a transaction is the correct concurrency solution.

### Pattern 6: MinIO Attachment Upload

**What:** Multipart upload via @fastify/multipart, stored in MinIO via @aws-sdk/client-s3.

```typescript
// @fastify/multipart is already in API deps (9.4.0)
// @aws-sdk/client-s3 is already in API deps
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true, // required for MinIO
});

async function uploadAttachment(
  file: MultipartFile,
  tenantId: string,
  ticketId: string,
): Promise<string> {
  const key = `${tenantId}/tickets/${ticketId}/${Date.now()}-${file.filename}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.MINIO_BUCKET ?? 'meridian-attachments',
    Key: key,
    Body: await file.toBuffer(),
    ContentType: file.mimetype,
  }));
  return key; // stored as TicketAttachment.storagePath
}
```

### Pattern 7: SLA Monitor Worker (BullMQ Repeatable)

**What:** Replace the stub with a repeatable job that checks all active SLA timers every minute.

```typescript
// apps/worker/src/workers/sla-monitor.ts
// Register repeatable job in worker startup (apps/worker/src/index.ts):
await slaMonitorQueue.add(
  'check-sla',
  { tenantId: 'all' }, // special sentinel value — worker queries all tenants
  { repeat: { pattern: '* * * * *' }, jobId: 'sla-monitor-repeatable' }
);

// Worker processes all tenants in one job:
const slaMonitorWorker = new Worker(QUEUE_NAMES.SLA_MONITOR, async (job) => {
  // Find all tickets where slaBreachAt < now + 5min AND status not in RESOLVED/CLOSED/CANCELLED
  const warningCandidates = await prisma.ticket.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] },
      slaBreachAt: { lte: addMinutes(new Date(), 5) },
    },
    include: { sla: true, assignedTo: true },
  });
  // ... send warnings + breach notifications
});
```

### Anti-Patterns to Avoid

- **No direct tenant cross-query in workers:** The sla-monitor worker queries ALL tenants but MUST still scope notification creation by tenantId. Never create a Notification without tenantId.
- **No raw HTML in TipTap:** Always sanitize `editor.getHTML()` output with DOMPurify before storing or rendering to prevent stored XSS. The KB portal is public-facing.
- **No blocking attachment upload in request handler:** Use multipart streaming; don't call `await file.toBuffer()` for files > 10MB in the request cycle. For large files, stream directly to S3.
- **No cron string stored without validation:** When saving a ScheduledReport with a cron schedule, validate the cron string with `croner.Cron(schedule)` before accepting the input.
- **No email password stored plaintext:** Always encrypt with the existing AES encryption service before persisting to EmailAccount; decrypt only in the worker process.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IMAP client | Custom TCP/IMAP protocol parser | `imapflow` | IMAP has 200+ pages of RFC; idle connections, UID handling, reconnection |
| Email parsing | Custom MIME parser | `mailparser` | MIME encoding (base64, quoted-printable), multi-part attachments, charset detection |
| SMTP sending | Raw TCP socket | `nodemailer` | STARTTLS negotiation, auth mechanisms, connection pooling, retry |
| Business-hours timezone math | Manual UTC offset arithmetic | `date-fns-tz` | DST transitions, historical timezone data, IANA timezone database |
| CSV export | String concatenation with commas | `csv-stringify` (csv package) | RFC 4180 escaping: commas in fields, newlines in fields, quote escaping |
| Rich text editor | `contenteditable` + custom toolbar | `@tiptap/react` | Spec requirement; ProseMirror handles cursor, selection, history, collaboration |
| Cron scheduling | setTimeout loops | BullMQ repeatable jobs + `croner` | Process restarts lose setTimeout state; BullMQ persists in Redis |
| HTML email templates | String concatenation | Template strings with variable substitution | Simple enough at this scale; Handlebars would add complexity |

**Key insight:** The email stack (imapflow + mailparser + nodemailer) handles protocols that took decades to standardize. Any custom implementation will miss edge cases in the first week of real-world email traffic.

---

## Common Pitfalls

### Pitfall 1: SLA Timer Off-by-One with Timezone DST
**What goes wrong:** SLA breach time calculated at ticket creation is 1 hour wrong on DST transition days.
**Why it happens:** UTC offset for a timezone (e.g., "America/New_York") changes from -5 to -4 at DST spring-forward. If you add `businessHoursStart` as a fixed UTC offset, the SLA breach time drifts by 1 hour twice per year.
**How to avoid:** Use `date-fns-tz` `toZonedTime`/`fromZonedTime` with IANA timezone names (e.g., `"America/New_York"` not `"UTC-5"`). The schema SLA model must store timezone as an IANA name.
**Warning signs:** SLA breach tests pass in January but fail in March; breach times are exactly 1 hour off.

### Pitfall 2: Email Deduplication Gap
**What goes wrong:** The same email is processed twice, creating duplicate tickets.
**Why it happens:** Email polling runs every 5 minutes. If the worker crashes after marking a message "Seen" but before recording the Message-ID, the next poll re-processes it. Also: some email servers re-deliver messages to different UIDs after reconnection.
**How to avoid:** Store Message-ID in Redis (`email:msgids:{tenantId}`) as the primary dedup check, done BEFORE ticket creation. Use an `upsert` pattern or Redis SET with NX flag: `redis.setnx(key, '1')` returns 0 if already exists.
**Warning signs:** Duplicate tickets with identical titles from the same sender; TicketActivity showing two CREATE events.

### Pitfall 3: Ticket Sequential Number Race Condition
**What goes wrong:** Two concurrent ticket creation requests get the same `ticketNumber`, one fails with unique constraint violation.
**Why it happens:** `MAX(ticketNumber) + 1` is read by two requests simultaneously before either writes.
**How to avoid:** Use `SELECT ... FOR UPDATE` inside a Prisma `$transaction`. The unique constraint `@@unique([tenantId, ticketNumber])` is the safety net but not the prevention.
**Warning signs:** 500 errors on ticket creation under load; Prisma `P2002` (unique constraint) errors in logs.

### Pitfall 4: TipTap Content XSS
**What goes wrong:** A staff user stores malicious JavaScript in a KB article via the TipTap editor, which executes when an end-user views the article in the portal.
**Why it happens:** `editor.getHTML()` output contains whatever the user typed, including `<script>` tags or `onerror` attributes.
**How to avoid:** Install `isomorphic-dompurify` and sanitize HTML before storing AND before rendering: `DOMPurify.sanitize(content, { ALLOWED_TAGS: ['p','h1','h2','h3','strong','em','ul','ol','li','code','pre','a','img','blockquote'] })`.
**Warning signs:** HTML entities not being escaped in article viewer; raw `<script>` visible in rendered output.

### Pitfall 5: BullMQ Repeatable Job Duplicate Registration
**What goes wrong:** Every server restart adds another repeatable job instance, so the SLA monitor runs 3x, 10x, 100x as the app is restarted.
**Why it happens:** `queue.add('check-sla', data, { repeat: {...} })` adds a new repeatable entry each time it's called without checking if one exists.
**How to avoid:** Use a stable `jobId` and call `queue.removeRepeatable` before re-adding, OR check `queue.getRepeatableJobs()` first. The stripe-webhook worker does NOT use repeatable jobs — see trial-expiry worker for the repeatable pattern.
**Warning signs:** Worker logs show multiple SLA checks firing within 1 second; Redis memory grows unbounded.

### Pitfall 6: Portal Role-Redirect Middleware Blocking API Routes
**What goes wrong:** The Next.js middleware that redirects `end_user` to `/portal` also fires on API route fetches, causing redirect loops.
**Why it happens:** Next.js middleware matches all routes by default including `/api/`.
**How to avoid:** Scope middleware.ts matcher to exclude API routes and static assets:
```typescript
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```
**Warning signs:** TanStack Query calls from portal pages get 307 redirect responses; infinite redirect loops in browser.

### Pitfall 7: @fastify/multipart Conflicts with JSON Body Parser
**What goes wrong:** Registering `@fastify/multipart` globally breaks all JSON POST routes.
**Why it happens:** Multipart plugin can take over content-type handling globally.
**How to avoid:** Register multipart at the route level or scoped plugin, not globally. The API already uses `preParsing` hook pattern for Stripe webhooks — use the same scoped approach. See STATE.md decision: `[Phase 02-01]: preParsing hook captures raw webhook body without disrupting global JSON parser`.
**Warning signs:** JSON requests return 415 or empty body after adding multipart plugin globally.

---

## Code Examples

### SLA Countdown Timer Component (React)

```typescript
// Source: Standard React setInterval pattern
'use client';
import { useState, useEffect } from 'react';

function SlaCountdown({ slaBreachAt, isPaused }: { slaBreachAt: string | null; isPaused: boolean }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!slaBreachAt || isPaused) return;
    const interval = setInterval(() => {
      setRemaining(new Date(slaBreachAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [slaBreachAt, isPaused]);

  if (isPaused) return <span className="badge badge-warning">PAUSED</span>;
  if (!remaining) return null;

  const isBreached = remaining < 0;
  const minutes = Math.abs(Math.floor(remaining / 60000));
  const pct = /* calculate elapsed/total */ 0; // passed as prop

  const colorClass = isBreached ? 'text-red-600' :
    pct >= 90 ? 'text-red-500' :
    pct >= 75 ? 'text-yellow-500' :
    'text-green-500';

  return (
    <span className={colorClass}>
      {isBreached ? 'BREACHED' : `${minutes}m`}
    </span>
  );
}
```

### Notification Read/Unread API Route Pattern

```typescript
// PATCH /api/v1/notifications/:id/read
app.patch('/api/v1/notifications/:id/read', {
  preHandler: [requirePermission('notifications:write')],
}, async (request, reply) => {
  const { tenantId, userId } = request.currentUser;
  await prisma.notification.update({
    where: {
      id: request.params.id,
      tenantId,   // tenantId scope
      userId,     // users can only mark their own notifications
    },
    data: { isRead: true, readAt: new Date() },
  });
  return reply.send({ success: true });
});
```

### Report CSV Export Pattern

```typescript
// Streaming CSV export
import { stringify } from 'csv-stringify/sync';

app.get('/api/v1/reports/tickets.csv', async (request, reply) => {
  const { tenantId } = request.currentUser;
  const tickets = await prisma.ticket.findMany({
    where: { tenantId, /* filters from query params */ },
    include: { assignedTo: true, category: true },
    orderBy: { createdAt: 'desc' },
    take: 5000, // cap for memory protection
  });

  const csv = stringify(tickets.map(t => ({
    ticketNumber: `TKT-${String(t.ticketNumber).padStart(5, '0')}`,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '',
    createdAt: t.createdAt.toISOString(),
  })), { header: true });

  return reply
    .header('Content-Type', 'text/csv')
    .header('Content-Disposition', 'attachment; filename="tickets.csv"')
    .send(csv);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-imap` (callback-based) | `imapflow` (async/await) | ~2020 | Cleaner code; better connection management |
| Quill or CKEditor for rich text | TipTap (ProseMirror-based) | ~2021 | Extensible via extensions; collaborative-ready |
| `moment-timezone` | `date-fns-tz` | ~2022 | Tree-shakeable; immutable; smaller bundle |
| BullMQ v4 | BullMQ v5 (already installed) | 2024 | Queue composition API changes; project uses v5.71.0 |
| TipTap v2 | TipTap v3 (breaking change) | 2025 | Extension API changed; use v3 docs (current latest 3.20.4) |
| `nodemailer` v6 | `nodemailer` v8 | 2025 | v8 is a major release; no bundled types — needs @types/nodemailer |

**Deprecated/outdated:**
- `node-imap`: Unmaintained since 2019; no async/await; use `imapflow` instead
- `moment-timezone`: Marked legacy; use `date-fns-tz` (already in use pattern)
- TipTap v2 docs/tutorials: Many blog posts show v2 API — always use official v3 docs at tiptap.dev

---

## Open Questions

1. **SLA model missing `timezone` field**
   - What we know: SLA model has `businessHours`, `businessHoursStart`, `businessHoursEnd`, `businessDays` but no timezone field
   - What's unclear: Whether timezone should be per-SLA policy or per-tenant global setting
   - Recommendation: Add `timezone String @default("UTC")` to SLA model via migration. Per-SLA is more correct for MSPs managing customers across regions.

2. **Message-ID storage for email threading**
   - What we know: The EmailAccount model has no processedMessageIds or similar field; the schema has no dedicated dedup table
   - What's unclear: Whether to use Redis (ephemeral, fast) or a Postgres table (durable, auditable)
   - Recommendation: Use Redis `SADD email:msgids:{tenantId} {messageId}` with 90-day key TTL for dedup. For true durability (audit compliance), add a `ProcessedEmail` model to the schema with `(tenantId, messageId)` unique constraint.

3. **TipTap content format: HTML vs JSON**
   - What we know: `KnowledgeArticle.content` is a `String` field (not JSON)
   - What's unclear: Whether to store TipTap JSON (`getJSON()`) or HTML (`getHTML()`)
   - Recommendation: Store as HTML string (simpler rendering, better for email/PDF export, avoids TipTap version lock-in). Always sanitize before storage and rendering.

4. **SETT-12 SSE log streaming**
   - What we know: Fastify supports SSE via `reply.raw` streaming; BullMQ has job logs but they're per-job not global
   - What's unclear: How to stream worker logs in real-time (BullMQ logs are stored in Redis but not pub/sub)
   - Recommendation: Use `Redis.subscribe()` to a log channel; workers publish log lines to the channel; SSE endpoint subscribes and streams. Alternatively, write worker logs to a rolling in-memory buffer and SSE polls that. Plan this as a low-priority item within the SETT wave.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter api vitest run src/__tests__/` |
| Full suite command | `pnpm --filter api vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TICK-01 | POST /api/v1/tickets creates ticket | integration | `pnpm --filter api vitest run src/__tests__/tickets.test.ts` | ❌ Wave 0 |
| TICK-02 | Sequential TKT-NNNNN generated per tenant | unit | `pnpm --filter api vitest run src/__tests__/ticket-number.test.ts` | ❌ Wave 0 |
| TICK-03 | Status transitions validate allowed moves | unit | `pnpm --filter api vitest run src/__tests__/ticket-service.test.ts` | ❌ Wave 0 |
| SLA-02 | calculateBreachAt returns correct time | unit | `pnpm --filter api vitest run src/__tests__/sla-service.test.ts` | ❌ Wave 0 |
| SLA-04 | Business hours math excludes weekends | unit | `pnpm --filter api vitest run src/__tests__/sla-service.test.ts` | ❌ Wave 0 |
| EMAL-04 | Duplicate Message-ID returns false for second call | unit | `pnpm --filter api vitest run src/__tests__/email-inbound.test.ts` | ❌ Wave 0 |
| EMAL-03 | Reply threading matches In-Reply-To header | unit | `pnpm --filter api vitest run src/__tests__/email-inbound.test.ts` | ❌ Wave 0 |
| NOTF-04 | notifyUser creates Notification row | unit | `pnpm --filter api vitest run src/__tests__/notification-service.test.ts` | ❌ Wave 0 |
| PRTL-06 | end_user role redirects to /portal | manual | Browser test in dev environment | Manual only |
| REPT-02 | CSV export returns valid CSV with correct headers | integration | `pnpm --filter api vitest run src/__tests__/reports.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api vitest run src/__tests__/`
- **Per wave merge:** `pnpm --filter api vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/__tests__/tickets.test.ts` — covers TICK-01, TICK-02, TICK-03, TICK-04, TICK-05
- [ ] `apps/api/src/__tests__/ticket-service.test.ts` — unit tests for ticket service (status machine, activity log)
- [ ] `apps/api/src/__tests__/sla-service.test.ts` — covers SLA-02, SLA-04 with business hours math
- [ ] `apps/api/src/__tests__/email-inbound.test.ts` — covers EMAL-03, EMAL-04 (threading + dedup)
- [ ] `apps/api/src/__tests__/notification-service.test.ts` — covers NOTF-04
- [ ] `apps/api/src/__tests__/reports.test.ts` — covers REPT-02 (CSV export format)

---

## Sources

### Primary (HIGH confidence)
- Schema.prisma (inspected) — all 62 models confirmed; SLA, Ticket, KnowledgeArticle, Notification, EmailAccount, ScheduledReport, EmailTemplate all present
- `apps/worker/src/workers/` (inspected) — sla-monitor, email-polling, email-notification all confirmed as stubs
- `apps/api/src/` (inspected) — Fastify plugin chain, planGate, requirePermission patterns confirmed
- `apps/worker/src/workers/stripe-webhook.ts` (inspected) — BullMQ idempotency pattern documented
- npm registry (verified 2026-03-20) — all version numbers confirmed current

### Secondary (MEDIUM confidence)
- imapflow documentation (https://imapflow.com/) — async/await IMAP client pattern
- TipTap v3 documentation (https://tiptap.dev/) — v3 breaking changes vs v2 noted
- nodemailer documentation (https://nodemailer.com/) — v8 type situation confirmed

### Tertiary (LOW confidence)
- SLA business-hours algorithm — standard pattern; specific implementation needs validation with DST edge cases
- Redis Message-ID dedup approach — reasonable but not verified against imapflow's reconnection behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed from npm registry 2026-03-20
- Architecture: HIGH — based on inspected codebase; existing patterns are clear
- SLA math: MEDIUM — algorithm is standard but timezone DST edge cases need integration test validation
- Email threading: MEDIUM — dual-strategy pattern is industry standard; dedup Redis approach needs testing under reconnection scenarios
- Pitfalls: HIGH — drawn from inspected codebase decisions (STATE.md) and known Node.js email handling issues

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days — stack is stable; imapflow/nodemailer/TipTap move slowly)
