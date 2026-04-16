# Phase 5: Agent, Mobile, and Integrations - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The .NET inventory agent auto-discovers and reconciles hardware into the CMDB, the React Native mobile app gives field technicians full ticket management with push notifications, and webhooks/API keys let external tools integrate with the platform. This is the final phase of v1.

</domain>

<decisions>
## Implementation Decisions

### Agent Enrollment & Authentication
- Token-based enrollment: admin generates enrollment token in web UI with optional max-enrollment count and expiry
- Agent presents token on first connect, receives a per-device API key back
- Token delivery: support both CLI flag (`meridian-agent --enroll <token>`) and config file pre-population — CLI takes precedence
- No auto-update for v1 — agent reports version to server, admin deploys updates via existing tooling (GPO, Ansible, etc.)

### Agent Data Collection & Submission
- Inventory submission every 4 hours; heartbeat every 5 minutes
- Full collection by default: hardware, software, services, processes, network, local users
- Collect full process list (PID, CPU, memory) — not just services
- Privacy tiers available (full, restricted, anonymized) — full is the default, configurable per-agent or per-tenant
- Manual CMDB edits win over agent-discovered data — agent data only fills empty fields or updates agent-sourced fields

### Agent Architecture
- Platform-native daemon: Windows Service, Linux systemd, macOS launchd — installer registers and auto-starts on boot
- HTTP proxy support via HTTP_PROXY/HTTPS_PROXY env vars and proxy config field
- Queue-and-retry resilience: store inventory locally when server unreachable, retry with exponential backoff, submit queued data on reconnect (configurable local storage cap)
- JSON config file + env var overrides at standard OS paths (`/etc/meridian-agent/config.json`, `%ProgramData%\Meridian\config.json`)
- HTTP(S) export only for v1 — S3/Azure Blob plugins deferred to v2

### Agent Local Web UI (127.0.0.1:8787)
- Full diagnostic view: connection status, enrollment state, hardware summary, raw collected data preview, network test to server, manual inventory trigger, config editor, log viewer
- No authentication — loopback-only binding is sufficient security

### Agent Installers
- MSI for Windows (Group Policy deployable), .deb for Debian/Ubuntu, .pkg for macOS
- NSIS and .rpm deferred to v2

### Agent Management in Web App
- Agent list shows: hostname, platform, status (online/offline/stale), last heartbeat time, agent version
- Current status + last seen — no uptime history sparklines for v1

### Mobile App Navigation & Interaction
- 5-tab bottom navigation: Dashboard | Tickets | Knowledge | Assets | Profile
- Full ticket CRUD: view, create, update status, assign, add comments (text + photo), close
- My-work dashboard: assigned tickets by priority, overdue/due-soon SLA items, recent activity feed (last 10 events)
- KB articles: simplified HTML rendering with mobile-friendly typography, images scale to width, read-only (no TipTap editor)

### Mobile Server Setup & Auth
- QR code scanning (admin generates from web UI with server URL + tenant info) + manual FQDN entry fallback
- Secure token storage via expo-secure-store
- Tenant branding: load logo on login/header, apply accent color to buttons/tabs (reuses SETT-11 branding settings)

### Mobile Camera & Attachments
- Camera + gallery picker — auto-compress before upload (max 2MB), multiple photos per comment, thumbnail display in comment thread

### Mobile Offline Support
- Optimistic writes: comments and status changes queued locally, synced when online
- TanStack Query caches ticket list and KB articles for offline reading
- Conflict resolution on sync (server wins for conflicts, queued writes replayed)

### Push Notifications
- All 12 NotificationType events available for push, user-configurable (toggle per event type in profile settings)
- Default: all push types enabled for new users
- Deep link directly to entity screen (ticket detail, change detail, etc.) via servicedesk:// scheme
- Group by ticket: multiple events on same ticket collapse into one notification with count
- FCM for Android, APNs for iOS via expo-notifications
- Device token registration with platform identification, cleanup lifecycle for stale tokens

### External API (API Key Authenticated)
- Scope: tickets (full CRUD) + assets (read) + CIs (read) via /api/v1/external/ endpoints
- Per-key configurable rate limits (rateLimit field on ApiKey model, default 100/min)
- API key management: Settings > API Keys page, admin-only. Key shown once on creation. List shows name, prefix, scopes, last used, created date. Revoke button.

### Webhooks
- Per-webhook event type selection from WebhookEventType enum (already modeled as events[] array)
- HMAC-SHA256 signing: per-webhook secret, signature in X-Meridian-Signature header
- Retry: exponential backoff at 1min, 5min, 30min, 2hr, 12hr (5 attempts). Auto-disable after 50 consecutive failures
- Delivery history: per-webhook timeline on detail page — each attempt with status code, response time, payload preview, retry count. Last 30 days retained.
- Test delivery endpoint for verifying webhook configuration

### Alert Channels
- Email (existing SMTP), Slack (incoming webhook URL), Teams (connector URL)
- SMS/Twilio deferred to v2

### Claude's Discretion
- .NET project structure and collector architecture specifics
- Mobile state management approach (Zustand store design)
- Webhook worker implementation (BullMQ job design)
- Push notification service internals (FCM/APNs client setup)
- EAS Build profile configuration
- Exact offline sync conflict resolution algorithm
- Alert channel configuration UI layout

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Full Application Specification
- `DOCUMENTATION .md` — Complete spec with all data models, API endpoints, mobile architecture (Section 6), .NET agent architecture (Section 7), webhook event types, push notification events, external API endpoints

### Database Schema
- `packages/db/prisma/schema.prisma` — All models: Agent, AgentEnrollmentToken, InventorySnapshot, MetricSample, DeviceToken, ApiKey, Webhook, WebhookDelivery, AlertConfiguration, WebhookEventType enum, AgentPlatform enum, AgentStatus enum, DevicePlatform enum, AlertChannelType enum

### Existing API Key Infrastructure
- `apps/api/src/plugins/api-key.ts` — API key authentication preHandler (SHA-256 hash lookup, scope checking, lastUsedAt tracking)
- `apps/api/src/routes/external/index.ts` — External routes placeholder (registered with apiKeyPreHandler)

### Existing Worker Patterns
- `apps/worker/src/workers/cmdb-reconciliation.ts` — CMDB reconciliation worker (cross-tenant sentinel pattern)
- `apps/worker/src/queues/definitions.ts` — Queue definitions and cron schedules

### Existing Notification Infrastructure
- `apps/api/src/services/notification.service.ts` — Fire-and-forget notification dispatch (extend for push channel)
- `apps/api/src/routes/v1/notifications/index.ts` — Notification center API

### Existing Service Patterns
- `apps/api/src/services/ticket.service.ts` — Transactional service pattern with audit trail
- `apps/api/src/services/storage.service.ts` — MinIO upload/presigned URL pattern (reuse for mobile photo uploads)

### Frontend Patterns
- `apps/web/src/app/dashboard/settings/` — Settings page patterns (reuse for API key and webhook management UI)

### Project Instructions
- `CLAUDE.md` — Critical design rules, icon usage (@mdi/react for web, react-native-vector-icons for mobile), API patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `api-key.ts`: Full API key auth preHandler — SHA-256 hash, scope checking, tenant resolution. Ready for external endpoints.
- `external/index.ts`: Placeholder route registered with apiKeyPreHandler in server.ts — add ticket/asset/CI external routes here
- `notification.service.ts`: Fire-and-forget dispatch — extend to include push notification channel alongside in-app + email
- `storage.service.ts`: MinIO upload + presigned URLs — reuse for mobile photo attachments
- `cmdb-reconciliation.ts`: Real reconciliation worker from Phase 4 — extend to accept agent-submitted inventory data
- All Prisma models exist: Agent, AgentEnrollmentToken, InventorySnapshot, DeviceToken, Webhook, WebhookDelivery, ApiKey, AlertConfiguration

### Established Patterns
- Worker code duplication pattern: workers duplicate service logic, don't cross-app import (mapStripeStatus precedent)
- Cross-tenant sentinel workers: SLA monitor, email polling, CMDB reconciliation — no tenantId scoping in job
- Fire-and-forget notifications: `void (async () => try/catch)()` in services
- BullMQ cron repeatable jobs for periodic workers
- Fastify route modules registered via v1 index
- Next.js rewrite proxy routes /api/* to Fastify API

### Integration Points
- `apps/api/src/server.ts`: External routes scope already registered with apiKeyPreHandler
- `apps/api/src/routes/v1/index.ts`: Register webhook and API key management routes
- `apps/worker/src/index.ts`: Register webhook delivery and push notification workers
- `apps/web/src/app/dashboard/settings/`: Add API Keys and Webhooks settings pages
- `apps/mobile/`: Currently a stub (package.json only) — full React Native + Expo project to create

</code_context>

<specifics>
## Specific Ideas

- Agent should feel like a professional enterprise tool — platform-native daemons, standard installer formats, JSON config at standard OS paths
- Mobile optimistic writes are important — field technicians are often in areas with spotty connectivity
- Webhook signing follows the Stripe/GitHub pattern (HMAC-SHA256 in custom header) — familiar to developers building integrations
- QR code onboarding for mobile should be fast and friction-free — scan and go
- Push notification grouping by ticket prevents notification fatigue on busy tickets
- All 12 notification types available for push but user-controlled — respect individual preferences

</specifics>

<deferred>
## Deferred Ideas

- Agent S3/Azure Blob export plugins — v2
- Agent NSIS and .rpm installer formats — v2
- Agent self-update mechanism — v2
- Agent uptime history sparklines in web UI — v2
- Alert channel: SMS/Twilio — v2
- Biometric auth (Face ID / Touch ID) for mobile — v2 (SEC-01/ADV-01)
- Photo annotation (draw arrows/circles) on mobile — v2

</deferred>

---

*Phase: 05-agent-mobile-and-integrations*
*Context gathered: 2026-03-23*
