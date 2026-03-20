---
phase: 03-core-itsm
plan: 05
subsystem: portal
tags: [portal, end-user, middleware, tickets, knowledge-base, assets]
dependency_graph:
  requires: [03-01, 03-04]
  provides: [end-user-portal, portal-layout, portal-middleware, service-request-form, kb-browsing]
  affects: [apps/web middleware, portal routes]
tech_stack:
  added: [jose@6, @mdi/react@1.6, @mdi/js@7.4, react-hook-form@7.71, zod@4.3, @hookform/resolvers, dompurify, @types/dompurify]
  patterns: [category-driven-form, simplified-sla-indicator, jwt-middleware, dompurify-xss-safe-html]
key_files:
  created:
    - apps/web/src/middleware.ts
    - apps/web/src/app/portal/layout.tsx
    - apps/web/src/app/portal/page.tsx
    - apps/web/src/app/portal/tickets/page.tsx
    - apps/web/src/app/portal/tickets/new/page.tsx
    - apps/web/src/app/portal/tickets/[id]/page.tsx
    - apps/web/src/app/portal/knowledge/page.tsx
    - apps/web/src/app/portal/assets/page.tsx
  modified:
    - apps/web/package.json
key_decisions:
  - "DOMPurify added for XSS-safe knowledge article HTML rendering via SafeHtml component with explicit allowlist"
  - "end_user redirect uses jwtVerify from jose (Edge-compatible) consistent with owner app pattern"
  - "Knowledge article vote uses POST /api/v1/knowledge/:id/vote matching Plan 04 endpoint"
  - "Comment form forces visibility=PUBLIC client-side — end users cannot set INTERNAL visibility"
metrics:
  duration: 8 min
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_created: 8
  files_modified: 2
---

# Phase 03 Plan 05: End-User Self-Service Portal Summary

End-user portal with JWT role-based middleware redirect, 5-page simplified interface, category-driven service request form, SLA status indicator, public-only comments, DOMPurify-sanitized KB browsing with article voting, and assets placeholder page.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Portal layout, middleware redirect, and home page | 138cd28 | middleware.ts, portal/layout.tsx, portal/page.tsx |
| 2 | Portal ticket pages, KB browsing, and assets page | 26ee979 | 5 portal page files |

## What Was Built

### Middleware (apps/web/src/middleware.ts)

- JWT verification using `jose` jwtVerify (Edge runtime compatible)
- Role-based redirect: `end_user` accessing `/dashboard` redirected to `/portal`
- Unauthenticated users redirected to `/login?callbackUrl={path}`
- Matcher excludes `/api|_next/static|_next/image|favicon.ico|login|signup` to prevent redirect loops

### Portal Layout (apps/web/src/app/portal/layout.tsx)

- Simplified sidebar with 5 nav items using MDI icons: Home, My Tickets, New Request, Knowledge Base, My Assets
- Notification bell with unread count badge (fetches `/api/v1/notifications?unread=true&count=true`)
- User profile dropdown with logout
- Responsive: sidebar hides on mobile, bottom nav appears with icon+label items

### Portal Home (apps/web/src/app/portal/page.tsx)

- Welcome greeting
- Open and Pending ticket count stat cards
- Recent tickets list (last 5) with status badges and relative timestamps
- Quick action buttons: Submit New Request, Browse Knowledge Base

### My Tickets (apps/web/src/app/portal/tickets/page.tsx)

- Ticket cards with TKT number, title, status badge, priority badge, relative update time
- Status filter tabs: All / Open / Resolved / Closed
- Paginated with Previous/Next controls
- Fetches `GET /api/v1/tickets?requestedById=me`

### New Request Form (apps/web/src/app/portal/tickets/new/page.tsx)

- **2-step category-driven flow per CONTEXT.md locked decision**
- Step 1: Category card grid with icon, name, description
- Step 2: Title, description, priority dropdown; `type` auto-set to `SERVICE_REQUEST`
- React Hook Form + Zod validation schema
- On success: redirects to `/portal/tickets/{id}?created=1`

### Ticket Detail (apps/web/src/app/portal/tickets/[id]/page.tsx)

- Header: ticket number, title, status/priority badges, timestamps
- **Simplified SLA indicator**: green (OK), yellow (WARNING), red (CRITICAL/BREACHED), gray (PAUSED) — no countdown timer
- "We aim to respond within X hours" message
- Attachments list with download links
- Conversation: PUBLIC comments only (client-side filter + server honors role context)
- Add comment form: visibility forced to PUBLIC

### Knowledge Base (apps/web/src/app/portal/knowledge/page.tsx)

- Search bar with 300ms debounce
- Article cards with title, truncated summary, tags, view count, helpful count
- Click opens article in modal
- Article modal: DOMPurify-sanitized HTML content with explicit allowlist (SafeHtml component), vote buttons
- Vote: `POST /api/v1/knowledge/:id/vote`

### My Assets (apps/web/src/app/portal/assets/page.tsx)

- Placeholder empty state satisfying PRTL-05 structural requirement
- "No assets assigned to you — Asset management will be available soon"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Added DOMPurify for XSS-safe knowledge article HTML**

- **Found during:** Task 2 — project security hook flagged unsafe HTML rendering
- **Issue:** Knowledge article content is HTML from TipTap rich text editor; rendering raw HTML is an XSS vector if content is ever corrupted or injected
- **Fix:** Added `dompurify` + `@types/dompurify`; created `SafeHtml` component using DOMPurify.sanitize with explicit ALLOWED_TAGS/ALLOWED_ATTR/FORBID_TAGS (blocks script/iframe/form)
- **Files modified:** `apps/web/src/app/portal/knowledge/page.tsx`, `apps/web/package.json`
- **Commit:** 26ee979

## Decisions Made

1. **DOMPurify with explicit allowlist** rather than trust server-sanitized content — defense in depth for rendered HTML
2. **`requestedById=me`** as the query parameter value — server resolves `me` from JWT session, avoiding exposing user ID in URL
3. **Comment visibility forced to `PUBLIC` client-side** — belt-and-suspenders alongside server enforcement
4. **`jose` jwtVerify** for middleware JWT verification — consistent with Phase 01-foundation decision; Edge-compatible alternative to `jsonwebtoken`

## Self-Check: PASSED

- All 8 files created and verified
- Commits 138cd28 and 26ee979 exist
- TypeScript check passes (no errors)
