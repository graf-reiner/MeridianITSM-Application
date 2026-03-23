---
phase: 05-agent-mobile-and-integrations
plan: "09"
subsystem: web-settings-ui
tags: [settings, agents, api-keys, webhooks, alerts, integrations]
dependency_graph:
  requires: ["05-01"]
  provides: ["settings/agents UI", "settings/api-keys UI", "settings/webhooks UI", "settings/alerts UI"]
  affects: ["apps/web/src/app/dashboard/settings/"]
tech_stack:
  added: ["qrcode@1.5.4", "@types/qrcode@1.5.6"]
  patterns: ["inline-style settings pages", "TanStack Query data fetching", "inline confirmation dialogs", "one-time key display pattern"]
key_files:
  created:
    - apps/web/src/app/dashboard/settings/agents/page.tsx
    - apps/web/src/app/dashboard/settings/api-keys/page.tsx
    - apps/web/src/app/dashboard/settings/webhooks/page.tsx
    - apps/web/src/app/dashboard/settings/webhooks/[id]/page.tsx
    - apps/web/src/app/dashboard/settings/alerts/page.tsx
  modified:
    - apps/web/src/app/dashboard/settings/page.tsx
    - apps/web/package.json
decisions:
  - "qrcode package installed for client-side QR code generation in enrollment token modal; copied manually to apps/web/node_modules due to mobile app react@18.3.2 blocking pnpm workspace install"
  - "Webhook detail uses useParams hook not generateStaticParams — dynamic route fetches from API at runtime"
  - "Alert channel form uses URL blur validation (not submit-only) for immediate Slack/Teams URL feedback"
metrics:
  duration: "~13 min"
  completed_date: "2026-03-23T21:21:38Z"
  tasks: 2
  files_created: 5
  files_modified: 2
---

# Phase 05 Plan 09: Settings Pages for Agents, API Keys, Webhooks, and Alert Channels Summary

Five settings pages implementing the Phase 5 admin control plane: agent enrollment with QR codes, API key management with one-time display, webhook CRUD with test delivery and delivery history timeline, and alert channel cards for Slack/Teams/email.

## Tasks Completed

| # | Task | Status | Commit | Files |
|---|------|--------|--------|-------|
| 1 | Agents page + API Keys page | Done | fe2074c | agents/page.tsx, api-keys/page.tsx, settings/page.tsx |
| 2 | Webhooks pages + Alert Channels page | Done | 2d807cd | webhooks/page.tsx, webhooks/[id]/page.tsx, alerts/page.tsx |

## What Was Built

### Task 1: Agents + API Keys

**Agents page** (`/dashboard/settings/agents`):
- Enrollment token generation modal with optional expiry and max-enrollment count
- QR code generation using `qrcode` npm package (client-side via dynamic import)
- One-time token display in amber-bordered input with Copy button
- Enrollment tokens table: collapsible section with prefix, usage count, expiry, status badges (Active/Expired/Revoked), revoke inline confirmation
- Agents table: ONLINE/OFFLINE/STALE status badges per UI-SPEC colors, hostname clickable link, delete inline confirmation
- Empty state with call-to-action to generate first enrollment token

**API Keys page** (`/dashboard/settings/api-keys`):
- Create modal: name (required), scopes multi-checkbox (tickets.read/write, assets.read, ci.read), optional rate limit override
- One-time display: amber banner with full key in read-only input + Copy button, persists at top of list until dismissed
- Keys table: name, prefix (monospace badge), scopes (colored badges), rate limit, last used, created, revoke action
- Revoke inline confirmation with key prefix in message text
- Empty state

**Settings index update**: Added 4 new navigation cards (Agents, API Keys, Webhooks, Alert Channels) following existing card grid pattern.

### Task 2: Webhooks + Alert Channels

**Webhooks list page** (`/dashboard/settings/webhooks`):
- Card-style rows (not pure table) for better action layout
- Auto-disabled warning banner per UI-SPEC: "automatically disabled after 50 consecutive failures"
- Send Test button: loading state + success/error inline toast
- Enable/Disable toggle, Edit button (opens form modal), Delete with inline confirmation
- Form modal: name, URL (required), events multi-checkbox (15 webhook event types), custom headers (key-value pairs, add/remove)

**Webhook detail page** (`/dashboard/settings/webhooks/[id]`):
- Header: webhook name, status badge, endpoint URL, Send Test button, Edit link
- Subscribed events section: badges showing all subscribed event types
- Delivery history timeline: list of deliveries with DeliveryStatusBadge (success green/failed red/pending blue), HTTP status, response time ms, ISO timestamp
- Retry count badge (amber) shown only when retryCount > 0
- Expandable payload preview: collapsible `<pre>` block with monospace 12px font, light gray background
- Empty delivery state per UI-SPEC copy
- Delivery overflow note when more deliveries exist beyond shown

**Alert Channels page** (`/dashboard/settings/alerts`):
- Responsive card grid: 3+ cols on wide viewport, auto-fill minmax(280px)
- Channel type icon with color-matched background tint (Slack #4a154b, Teams #5059c9, Email #0891b2)
- Create/edit modal with channel type picker (button group with active border highlight)
- Dynamic config fields: Email = recipients text, Slack = webhook URL with hooks.slack.com validation, Teams = connector URL with https:// validation
- URL validation on blur (immediate feedback) and on submit
- Test delivery button per card, inline delete confirmation with channel name

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pnpm workspace install blocked by mobile app react@18.3.2**
- **Found during:** Task 1 (qrcode package installation)
- **Issue:** The apps/mobile package.json requires react@18.3.2, which is no longer available on npm (removed due to CVE-2025-55182). This blocks all pnpm workspace-level installs.
- **Fix:** Added qrcode and @types/qrcode to apps/web/package.json, then manually copied the packages from the pnpm store (node_modules/.pnpm/) into apps/web/node_modules/. Also copied dijkstrajs and pngjs dependencies of qrcode.
- **Files modified:** apps/web/package.json, apps/web/node_modules/qrcode/ (manual copy)
- **Note:** The mobile app react@18.3.2 issue is pre-existing and out-of-scope for this plan.

**2. [Rule 1 - Bug] TypeScript error in webhook detail page requestPayload conditional**
- **Found during:** Task 2 TypeScript compilation check
- **Issue:** `{delivery.requestPayload && (...)}` fails TypeScript check because `unknown` is not assignable to `ReactNode`
- **Fix:** Changed to explicit null/undefined check: `{delivery.requestPayload !== undefined && delivery.requestPayload !== null && (...)}`
- **Files modified:** apps/web/src/app/dashboard/settings/webhooks/[id]/page.tsx

## Verification

- TypeScript: Passes (`pnpm --filter web tsc --noEmit`) — only pre-existing error in tickets/page.tsx (out of scope)
- All 5 settings pages exist at expected paths
- All UI-SPEC copy strings used correctly
- All inline-style patterns consistent with existing settings pages
- All destructive actions use inline confirmation dialogs

## Self-Check: PASSED

- [x] apps/web/src/app/dashboard/settings/agents/page.tsx — exists, contains `Agents`, `Generate Enrollment Token`, `settings/agents`, `#d1fae5`, `#fef3c7`, `No agents enrolled`
- [x] apps/web/src/app/dashboard/settings/api-keys/page.tsx — exists, contains `API Keys`, `Create API Key`, `it will not be shown again`
- [x] apps/web/src/app/dashboard/settings/webhooks/page.tsx — exists, contains `Webhooks`, `Add Webhook`, `Send Test`, `50 consecutive failures`
- [x] apps/web/src/app/dashboard/settings/webhooks/[id]/page.tsx — exists, contains delivery history, `#d1fae5`, `#fee2e2`
- [x] apps/web/src/app/dashboard/settings/alerts/page.tsx — exists, contains `Alert Channels`, `Add Channel`, `hooks.slack.com`
- [x] Commit fe2074c exists (Task 1)
- [x] Commit 2d807cd exists (Task 2)
