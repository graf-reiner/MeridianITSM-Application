---
phase: 03-core-itsm
plan: 09
subsystem: web-frontend
tags: [dashboard, ui, tickets, knowledge-base, sla-countdown, tiptap, recharts, settings]
dependency_graph:
  requires: [03-01, 03-02, 03-04, 03-06, 03-07, 03-08]
  provides: [dashboard-ui, ticket-pages, sla-countdown, knowledge-editor, settings-pages, reports-dashboard]
  affects: [apps/web]
tech_stack:
  added: ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-image", "@tiptap/extension-link", "@tiptap/extension-code-block-lowlight", "lowlight", "recharts"]
  patterns: [tanstack-query, react-hook-form, zod-validation, dompurify-xss-sanitization, mdi-icons]
key_files:
  created:
    - apps/web/src/app/dashboard/layout.tsx
    - apps/web/src/app/dashboard/page.tsx
    - apps/web/src/components/SlaCountdown.tsx
    - apps/web/src/components/ArticleEditor.tsx
    - apps/web/src/app/dashboard/tickets/page.tsx
    - apps/web/src/app/dashboard/tickets/new/page.tsx
    - apps/web/src/app/dashboard/tickets/[id]/page.tsx
    - apps/web/src/app/dashboard/knowledge/page.tsx
    - apps/web/src/app/dashboard/knowledge/new/page.tsx
    - apps/web/src/app/dashboard/knowledge/[id]/page.tsx
    - apps/web/src/app/dashboard/settings/page.tsx
    - apps/web/src/app/dashboard/settings/users/page.tsx
    - apps/web/src/app/dashboard/settings/roles/page.tsx
    - apps/web/src/app/dashboard/settings/queues/page.tsx
    - apps/web/src/app/dashboard/settings/categories/page.tsx
    - apps/web/src/app/dashboard/settings/sla/page.tsx
    - apps/web/src/app/dashboard/settings/email/page.tsx
    - apps/web/src/app/dashboard/reports/page.tsx
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
decisions:
  - "SlaCountdown uses setInterval 1s ticks cleared on unmount; color bands exactly per CONTEXT.md locked decision (green <75%, yellow 75-89%, red 90-99%, BREACHED 100%+)"
  - "ArticleEditor uses DOMPurify sanitize + DOMParser/document fragment to mount safe HTML in read-only mode without using unsafe innerHTML patterns"
  - "Dashboard layout injects QueryClientProvider at layout level so all dashboard pages share a single QueryClient"
  - "Recharts labelFormatter typed as (v: unknown) and PieLabelRenderProps uses optional properties to satisfy strict TypeScript"
  - "setContent() called without second arg (emitUpdate) to fix TipTap API type error"
metrics:
  duration: ~35 min
  completed: 2026-03-21
  tasks_completed: 2
  files_created: 18
  files_modified: 2
---

# Phase 03 Plan 09: Staff Dashboard UI Summary

Staff dashboard UI delivering 18 pages/components: ticket management with live SLA countdown visualization, knowledge base with TipTap rich text editor, 6 admin settings pages, and a reports dashboard with Recharts charts.

## What Was Built

### SLA Countdown Component (`SlaCountdown.tsx`)
Implements the CONTEXT.md locked decision: 1-second setInterval countdown with four color bands:
- Green: elapsed < 75%
- Yellow: elapsed 75-89%
- Red: elapsed 90-99%
- BREACHED (bold red): elapsed >= 100%, shows "BREACHED" text
- PAUSED state: orange badge with frozen timer and optional tooltip for pause reason

### ArticleEditor Component (`ArticleEditor.tsx`)
TipTap editor with: Bold, Italic, H1-H3, Bullet/Ordered lists, Code block (via lowlight), Blockquote, Link, Image. Two modes: editable (full toolbar) and read-only (sanitized render via DOMParser + document fragment). All output sanitized via DOMPurify with an explicit allow-list (FORBID_TAGS includes script/style/iframe/object/embed/form).

### Ticket Pages
- List page: TanStack Query, search/status/priority filters, SLA dot indicators per row, pagination
- Create page: React Hook Form + Zod, loads category/queue/SLA/assignee dropdowns dynamically
- Detail page: parallel queries for ticket + SLA status, SlaCountdown in header, status transitions, comment form with PUBLIC/INTERNAL visibility toggle, activity/attachments tabs

### Knowledge Pages
- List: search, status/visibility filters, table with view/helpful counts
- Create: ArticleEditor + title/summary/tags/visibility form
- Detail/Edit: read-only vs edit modes, status transition buttons (DRAFT to IN_REVIEW to PUBLISHED to RETIRED), sidebar metadata

### Settings Pages
- Hub: card grid linking to 6 sub-sections
- Users: CRUD modal with role dropdown, disable/enable toggle, password reset
- Roles: system roles read-only, custom roles with grouped permission checkboxes
- Queues: auto-assign toggle, default assignee, JSON assignment rules textarea
- Categories: hierarchical tree with expand/collapse, color picker, cycle-safe parent dropdown
- SLA Policies: P1-P4 response/resolution matrix, business hours (days checkboxes, timezone, time range), auto-escalation toggle + queue dropdown (CONTEXT.md locked decision)
- Email Accounts: SMTP/IMAP config forms, Test SMTP/Test IMAP buttons, configured badges, last-polled display

### Reports Dashboard
- 4 stat cards (total/open/resolved today/breached)
- LineChart: ticket volume by day (last 30 days)
- BarChart: tickets by priority with priority-specific colors
- PieChart: top categories with percentage labels
- Recent activity feed (last 10 items)
- Export buttons: "Export Tickets CSV" and "SLA Report"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Recharts TypeScript type errors**
- **Found during:** TypeScript verification after Task 2
- **Issue:** labelFormatter typed as string but Recharts expects unknown; Pie label render props has optional name/percent
- **Fix:** Changed to unknown with String coercion; used optional chaining on name and percent in Pie label function
- **Files modified:** apps/web/src/app/dashboard/reports/page.tsx
- **Commit:** ca83378

**2. [Rule 1 - Bug] TipTap setContent API type error**
- **Found during:** TypeScript verification after Task 1
- **Issue:** editor.commands.setContent called with second boolean arg which is not valid in TipTap v2+ API types
- **Fix:** Removed second arg, calling setContent with content only
- **Files modified:** apps/web/src/components/ArticleEditor.tsx
- **Commit:** 4103735

**3. [Rule 2 - Missing Critical] QueryClientProvider missing from root layout**
- **Found during:** Writing dashboard pages (all use TanStack Query useQuery)
- **Issue:** Root layout has no QueryClientProvider; dashboard pages would throw at runtime
- **Fix:** Added QueryClientProvider to dashboard layout.tsx wrapping DashboardInner
- **Files modified:** apps/web/src/app/dashboard/layout.tsx
- **Commit:** 4103735

**4. [Rule 3 - Blocking] ArticleEditor unsafe HTML pattern blocked by security hook**
- **Found during:** Writing read-only mode for ArticleEditor
- **Issue:** Project security hook blocked files using unsafe HTML mounting patterns
- **Fix:** Used useRef + useEffect with DOMParser to parse DOMPurify-sanitized HTML into a safe document fragment, then appended child nodes via appendChild. No unsafe patterns in final code.
- **Files modified:** apps/web/src/components/ArticleEditor.tsx
- **Commit:** 4103735

## Checkpoint Status

Plan paused at Task 3 (human visual verification checkpoint). Two tasks are fully committed and TypeScript passes cleanly. Dev server must be started for visual verification.

## Self-Check: PASSED

Key files confirmed present in git:
- apps/web/src/components/SlaCountdown.tsx
- apps/web/src/components/ArticleEditor.tsx
- apps/web/src/app/dashboard/tickets/[id]/page.tsx
- apps/web/src/app/dashboard/reports/page.tsx
- apps/web/src/app/dashboard/settings/sla/page.tsx

Commits confirmed:
- 4103735: feat(03-09): ticket and knowledge base dashboard pages
- ca83378: feat(03-09): settings hub pages and reports dashboard
