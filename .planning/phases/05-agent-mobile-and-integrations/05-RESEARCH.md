# Phase 5: Agent, Mobile, and Integrations - Research

**Researched:** 2026-03-23
**Domain:** .NET 9 inventory agent, React Native + Expo SDK 55, push notifications, BullMQ webhooks, external API key auth
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Agent Enrollment & Authentication
- Token-based enrollment: admin generates enrollment token in web UI with optional max-enrollment count and expiry
- Agent presents token on first connect, receives a per-device API key back
- Token delivery: support both CLI flag (`meridian-agent --enroll <token>`) and config file pre-population — CLI takes precedence
- No auto-update for v1 — agent reports version to server, admin deploys updates via existing tooling (GPO, Ansible, etc.)

#### Agent Data Collection & Submission
- Inventory submission every 4 hours; heartbeat every 5 minutes
- Full collection by default: hardware, software, services, processes, network, local users
- Collect full process list (PID, CPU, memory) — not just services
- Privacy tiers available (full, restricted, anonymized) — full is the default, configurable per-agent or per-tenant
- Manual CMDB edits win over agent-discovered data — agent data only fills empty fields or updates agent-sourced fields

#### Agent Architecture
- Platform-native daemon: Windows Service, Linux systemd, macOS launchd — installer registers and auto-starts on boot
- HTTP proxy support via HTTP_PROXY/HTTPS_PROXY env vars and proxy config field
- Queue-and-retry resilience: store inventory locally when server unreachable, retry with exponential backoff, submit queued data on reconnect (configurable local storage cap)
- JSON config file + env var overrides at standard OS paths (`/etc/meridian-agent/config.json`, `%ProgramData%\Meridian\config.json`)
- HTTP(S) export only for v1 — S3/Azure Blob plugins deferred to v2

#### Agent Local Web UI (127.0.0.1:8787)
- Full diagnostic view: connection status, enrollment state, hardware summary, raw collected data preview, network test to server, manual inventory trigger, config editor, log viewer
- No authentication — loopback-only binding is sufficient security

#### Agent Installers
- MSI for Windows (Group Policy deployable), .deb for Debian/Ubuntu, .pkg for macOS
- NSIS and .rpm deferred to v2

#### Agent Management in Web App
- Agent list shows: hostname, platform, status (online/offline/stale), last heartbeat time, agent version
- Current status + last seen — no uptime history sparklines for v1

#### Mobile App Navigation & Interaction
- 5-tab bottom navigation: Dashboard | Tickets | Knowledge | Assets | Profile
- Full ticket CRUD: view, create, update status, assign, add comments (text + photo), close
- My-work dashboard: assigned tickets by priority, overdue/due-soon SLA items, recent activity feed (last 10 events)
- KB articles: simplified HTML rendering with mobile-friendly typography, images scale to width, read-only (no TipTap editor)

#### Mobile Server Setup & Auth
- QR code scanning (admin generates from web UI with server URL + tenant info) + manual FQDN entry fallback
- Secure token storage via expo-secure-store
- Tenant branding: load logo on login/header, apply accent color to buttons/tabs (reuses SETT-11 branding settings)

#### Mobile Camera & Attachments
- Camera + gallery picker — auto-compress before upload (max 2MB), multiple photos per comment, thumbnail display in comment thread

#### Mobile Offline Support
- Optimistic writes: comments and status changes queued locally, synced when online
- TanStack Query caches ticket list and KB articles for offline reading
- Conflict resolution on sync (server wins for conflicts, queued writes replayed)

#### Push Notifications
- All 12 NotificationType events available for push, user-configurable (toggle per event type in profile settings)
- Default: all push types enabled for new users
- Deep link directly to entity screen (ticket detail, change detail, etc.) via servicedesk:// scheme
- Group by ticket: multiple events on same ticket collapse into one notification with count
- FCM for Android, APNs for iOS via expo-notifications
- Device token registration with platform identification, cleanup lifecycle for stale tokens

#### External API (API Key Authenticated)
- Scope: tickets (full CRUD) + assets (read) + CIs (read) via /api/v1/external/ endpoints
- Per-key configurable rate limits (rateLimit field on ApiKey model, default 100/min)
- API key management: Settings > API Keys page, admin-only. Key shown once on creation. List shows name, prefix, scopes, last used, created date. Revoke button.

#### Webhooks
- Per-webhook event type selection from WebhookEventType enum (already modeled as events[] array)
- HMAC-SHA256 signing: per-webhook secret, signature in X-Meridian-Signature header
- Retry: exponential backoff at 1min, 5min, 30min, 2hr, 12hr (5 attempts). Auto-disable after 50 consecutive failures
- Delivery history: per-webhook timeline on detail page — each attempt with status code, response time, payload preview, retry count. Last 30 days retained.
- Test delivery endpoint for verifying webhook configuration

#### Alert Channels
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

### Deferred Ideas (OUT OF SCOPE)
- Agent S3/Azure Blob export plugins — v2
- Agent NSIS and .rpm installer formats — v2
- Agent self-update mechanism — v2
- Agent uptime history sparklines in web UI — v2
- Alert channel: SMS/Twilio — v2
- Biometric auth (Face ID / Touch ID) for mobile — v2 (SEC-01/ADV-01)
- Photo annotation (draw arrows/circles) on mobile — v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | .NET 9 cross-platform agent with modular collector architecture | .NET 9 Worker Service pattern for daemons; ICollector interface for platform-specific collectors |
| AGNT-02 | Platform-specific data collection: Windows (WMI), Linux (/proc, dpkg/rpm), macOS (IOKit, system_profiler) | System.Management for WMI; /proc parsing for Linux; NSTask/Process for macOS |
| AGNT-03 | Agent enrollment via token authentication | agentKey returned from POST /api/v1/agents/enroll using AgentEnrollmentToken model |
| AGNT-04 | Periodic heartbeat to server | IHostedService background timer; POST /api/v1/agents/heartbeat every 5min |
| AGNT-05 | Inventory snapshot submission | POST /api/v1/agents/inventory — maps to InventorySnapshot model |
| AGNT-06 | CMDB CI payload submission for auto-discovery reconciliation | POST /api/v1/agents/cmdb-sync — feeds existing cmdb-reconciliation worker |
| AGNT-07 | Runs as Windows Service, Linux systemd, macOS launchd | .NET UseWindowsService() / UseSystemd() / UseSystemd() via launchd wrapper |
| AGNT-08 | Local web UI at 127.0.0.1:8787 | ASP.NET Core minimal API on loopback; React SPA served as embedded resources |
| AGNT-09 | Privacy tiers: full, restricted (no PII), anonymized (hashed) | Configurable filter layer in CollectorPipeline before submission |
| AGNT-10 | Export plugins: HTTP(S) with retry/backoff | Polly HTTP retry with exponential backoff; file-based queue for offline resilience |
| AGNT-11 | Configuration via JSON + env vars + CLI flags | Microsoft.Extensions.Configuration layered providers; System.CommandLine for CLI |
| AGNT-12 | Cross-platform installers: MSI (Windows), .deb (Linux), .pkg (macOS) | WiX Toolset for MSI; dpkg-deb for .deb; pkgbuild for .pkg |
| MOBL-01 | React Native + Expo app targeting iOS 16+ and Android 10+ | Expo SDK 55 + React Native 0.78; EAS Build for distribution |
| MOBL-02 | QR code or manual FQDN entry for server URL configuration | expo-barcode-scanner (bundled in SDK 55) for QR; TextInput fallback |
| MOBL-03 | Secure token storage via expo-secure-store | expo-secure-store 14.x; JWT stored under 'meridian_token' key |
| MOBL-04 | Bottom tab navigation: Dashboard, Tickets, Knowledge, Assets, Profile | @react-navigation/bottom-tabs 7.x + @react-navigation/native |
| MOBL-05 | Ticket list, detail, and create screens | TanStack Query v5 for fetching; React Hook Form for create/edit forms |
| MOBL-06 | Knowledge article browsing and viewing | react-native-render-html for safe KB article rendering |
| MOBL-07 | Push notifications via expo-notifications | expo-notifications 0.29.x; FCM for Android, APNs for iOS |
| MOBL-08 | Device token registration and cleanup lifecycle | POST /api/v1/push/register; DeviceToken model with userId+deviceId unique constraint |
| MOBL-09 | Deep linking from push notifications | expo-linking + servicedesk:// scheme; notification.data.screen + entityId |
| MOBL-10 | Camera/gallery access for ticket photo attachments | expo-image-picker 16.x with auto-compress; max 2MB via ImageManipulator |
| MOBL-11 | Offline-friendly cached ticket list and KB articles via TanStack Query | TanStack Query persistQueryClient + AsyncStorage persister; optimistic updates |
| MOBL-12 | EAS Build profiles for development, preview, and production | eas.json with three profiles; EXPO_PUBLIC_* env vars per profile |
| PUSH-01 | Push notification service supporting FCM (Android) and APNs (iOS) | expo-server-sdk (Node) for server-side dispatch; handles both FCM and APNs via Expo Push API |
| PUSH-02 | Device token registration endpoint with platform identification | POST /api/v1/push/register with platform: 'IOS'|'ANDROID' + deviceId |
| PUSH-03 | Push events covering 12 notification types | Extend notifyUser() to include push channel alongside in-app + email |
| PUSH-04 | Per-user push notification preferences | UserPushPreferences JSON field or PushPreference records per user |
| PUSH-05 | Notification payload includes screen and entityId for deep linking | data.screen + data.entityId in ExpoMessage payload |
| INTG-01 | API key CRUD with hashed keys, prefix, scopes, rate limiting | ApiKey model exists; api-key.ts preHandler exists; need CRUD routes + settings UI |
| INTG-02 | External API endpoints (/api/v1/external/) for ticket access | externalRoutes placeholder exists in apps/api; add ticket/asset/CI routes |
| INTG-03 | Webhook CRUD with event subscription, signed payloads, retry with backoff | Webhook + WebhookDelivery models exist; BullMQ webhook-delivery worker needed |
| INTG-04 | Webhook delivery tracking with history viewer | WebhookDelivery records; history page under settings |
| INTG-05 | Webhook test delivery endpoint | POST /api/v1/webhooks/:id/test — creates test delivery job |
| INTG-06 | Alert configuration (email, Slack, Teams channels) | AlertConfiguration model with channelType + config JSON; CRUD UI |
</phase_requirements>

---

## Summary

Phase 5 is the most architecturally diverse phase in the project: it spans three distinct technology domains (.NET agent, React Native mobile, TypeScript backend integrations) that can be developed in parallel across three work streams. The backend integration work (webhooks, external API, push notifications) sits on top of existing infrastructure — the `apiKeyPreHandler`, `externalRoutes` placeholder, `Webhook`/`WebhookDelivery` models, `DeviceToken` model, and `notification.service.ts` are all in place. The mobile app is a stub (`package.json` only), needing a full Expo SDK 55 scaffold. The .NET inventory agent has no files yet and requires creating the full 10-project solution from scratch.

The biggest risk is APNs credential configuration for push notifications: Apple requires a `.p8` key file or `.p12` certificate provisioned through the Apple Developer Portal. For development and TestFlight, this means using the Expo Push Service (which handles APNs/FCM under the hood), which dramatically simplifies server-side push — no direct FCM/APNs SDK integration needed in the Node backend. The `expo-server-sdk` npm package sends pushes via Expo's Push API endpoint and handles both platforms transparently.

For the .NET agent, the recommended architecture is a single .NET 9 Worker Service host with platform-specific collector implementations behind an `ICollector` interface, Polly for HTTP resilience, and `System.CommandLine` for CLI parsing. The local web UI at 8787 uses ASP.NET Core minimal APIs serving a simple embedded React SPA. Installers are built separately per platform using WiX Toolset (MSI), `dpkg-deb` (Debian), and `pkgbuild` (macOS pkg).

**Primary recommendation:** Build in three parallel streams — (1) backend integrations (webhooks, external API, push notifications, alert channels), (2) mobile app (Expo scaffold, navigation, screens, offline, EAS), (3) .NET agent (collectors, daemon, API client, installers). The backend stream is prerequisite to the mobile and agent streams since both need API endpoints.

---

## Standard Stack

### Core — Backend Integrations
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | 5.71.0 (current) | Webhook delivery worker with retry | Already used throughout project; BullMQ job options support delay/backoff natively |
| expo-server-sdk | ~4.0.0 | Server-side push notification dispatch | Single package handles FCM + APNs via Expo Push API; eliminates direct Firebase/APNs setup |
| @aws-sdk/client-s3 | existing | Mobile photo upload to MinIO | Already used in storage.service.ts; reuse same pattern |

### Core — Mobile App
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo | 55.0.8 | SDK, build toolchain, managed workflow | Project locked to SDK 55 |
| react-native | 0.78.x (SDK 55 bundled) | Cross-platform UI framework | Comes with Expo SDK 55 |
| @react-navigation/native | 7.x | Navigation container | Project locked to React Navigation v7 |
| @react-navigation/bottom-tabs | 7.15.6 (current) | Bottom tab navigator | Standard for tab-based mobile navigation |
| @react-navigation/stack | 7.8.6 (current) | Stack navigator for screens within tabs | Standard push/pop navigation |
| zustand | 5.0.12 (current) | Auth + offline queue state | Already specified in CLAUDE.md |
| @tanstack/react-query | 5.95.2 (current) | Data fetching, caching, offline | Already specified in CLAUDE.md |
| expo-secure-store | 14.x (SDK 55) | JWT secure storage | Required by MOBL-03; Keychain/Keystore backed |
| expo-notifications | 0.29.x (SDK 55 pkg: 55.0.13) | Push notification registration + receipt | Required by MOBL-07; PUSH-01 |
| expo-image-picker | 16.x (SDK 55 pkg: 55.0.13) | Camera + gallery access | Required by MOBL-10 |
| expo-barcode-scanner | 13.0.1 (current) | QR code scanning for server config | Required by MOBL-02 |
| expo-linking | 7.x (SDK 55 pkg: 55.0.8) | Deep link handling | Required by MOBL-09 |
| expo-build-properties | 55.0.10 | Set iOS/Android build config | Required for EAS Build fine-tuning |
| expo-dev-client | 55.0.18 | Development builds with native modules | Required for custom native modules testing |
| react-native-vector-icons | 10.3.0 | MaterialCommunityIcons (per CLAUDE.md) | Project convention; not @mdi/react |
| react-native-render-html | ~6.3.4 | Safe KB article HTML rendering | Replaces DOMPurify which is web-only |
| axios | 1.13.6 (current) | HTTP client with interceptors | CLAUDE.md specifies axios for mobile |

### Core — .NET Agent
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Microsoft.Extensions.Hosting | .NET 9 built-in | Worker Service host + DI container | Standard for .NET background services |
| Microsoft.Extensions.Configuration | .NET 9 built-in | Layered config: JSON + env + CLI | Standard configuration pattern |
| System.CommandLine | 2.0.0-beta | CLI argument parsing (--enroll, --run-once) | Official Microsoft CLI library |
| Polly | 8.x | HTTP retry with exponential backoff | Standard resilience library for .NET |
| System.Management | .NET 9 / Windows | WMI queries for Windows hardware collection | Only WMI library available on Windows |
| Microsoft.AspNetCore | .NET 9 built-in | Local web UI at 8787 | Minimal API, static file serving |

### Supporting — Mobile
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-image-manipulator | SDK 55 | Image resize/compress before upload | Auto-compress photos to 2MB max |
| @react-native-async-storage/async-storage | ~2.1.2 | TanStack Query persistence | Offline cache backing store |
| @tanstack/query-async-storage-persister | 5.x | TanStack Query + AsyncStorage bridge | Offline cache persistence |
| react-hook-form | 7.x | Form state for ticket create/edit | Consistent with web app choice |
| zod | 4.x | Form validation schemas | Consistent with project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-server-sdk (Expo Push API) | firebase-admin + node-apn | Direct FCM/APNs requires Apple p8 key + Firebase service account setup; Expo Push API handles both with one endpoint and manages token refresh |
| expo-barcode-scanner | react-native-camera | expo-barcode-scanner is SDK 55 bundled, less setup; react-native-camera adds C++ build complexity |
| react-native-render-html | react-native-webview | render-html is lighter; webview spins up a full browser engine which is heavyweight for KB articles |
| Polly | Custom retry loop in .NET | Polly is the canonical .NET resilience library with exponential backoff, circuit breakers, and jitter built in |

**Installation — Mobile:**
```bash
cd apps/mobile
npx create-expo-app@latest . --template blank-typescript
npx expo install expo-notifications expo-secure-store expo-image-picker expo-barcode-scanner expo-linking expo-image-manipulator expo-build-properties expo-dev-client
pnpm add @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack react-native-screens react-native-safe-area-context
pnpm add zustand @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-async-storage-persister @react-native-async-storage/async-storage
pnpm add axios react-native-vector-icons react-native-render-html react-hook-form zod
pnpm add -D @types/react-native-vector-icons
```

**Installation — Backend Integrations:**
```bash
pnpm --filter api add expo-server-sdk
```

**Version verification:** Versions above confirmed against npm registry on 2026-03-23.

---

## Architecture Patterns

### Recommended Project Structure — Mobile
```
apps/mobile/
├── app.json                    # Expo config (scheme: servicedesk, plugins)
├── eas.json                    # EAS Build profiles (development/preview/production)
├── App.tsx                     # Root: NavigationContainer + QueryClientProvider + Zustand init
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx   # Auth gate: AuthStack vs AppTabs
│   │   ├── AppTabs.tsx         # Bottom tab navigator (5 tabs)
│   │   └── stacks/             # Per-tab stack navigators
│   ├── screens/
│   │   ├── auth/               # Login, QR scan, manual server entry
│   │   ├── dashboard/          # DashboardScreen (my work)
│   │   ├── tickets/            # TicketListScreen, TicketDetailScreen, CreateTicketScreen
│   │   ├── knowledge/          # KbListScreen, KbArticleScreen
│   │   ├── assets/             # AssetListScreen, AssetDetailScreen
│   │   └── profile/            # ProfileScreen, PushPreferencesScreen
│   ├── stores/
│   │   ├── auth.store.ts       # Zustand: token, user, tenant, logout action
│   │   └── offline.store.ts    # Zustand: pending write queue (comments, status changes)
│   ├── api/
│   │   ├── client.ts           # Axios instance with baseURL + JWT interceptor
│   │   ├── tickets.ts          # TanStack Query hooks: useTickets, useTicket, useMutateTicket
│   │   ├── knowledge.ts        # useKbArticles, useKbArticle
│   │   └── assets.ts           # useAssets, useAsset
│   ├── hooks/
│   │   ├── usePushNotifications.ts  # Token registration + deep link routing
│   │   └── useOfflineSync.ts        # Replay pending queue on reconnect
│   └── components/
│       ├── TicketCard.tsx
│       ├── CommentThread.tsx
│       ├── PhotoPicker.tsx
│       └── QrScanner.tsx
```

### Recommended Project Structure — .NET Agent
```
apps/inventory-agent/
├── InvAgent.sln
└── src/
    ├── InvAgent.CLI/           # Entry point: System.CommandLine, reads config, starts host
    ├── InvAgent.Worker/        # IHostedService: heartbeat timer, inventory timer, queue flush
    ├── InvAgent.Collectors/    # ICollector interface + platform implementations
    │   ├── ICollector.cs
    │   ├── Windows/            # WmiCollector.cs (System.Management)
    │   ├── Linux/              # ProcCollector.cs (/proc parsing, dpkg/rpm)
    │   └── MacOs/              # MacOsCollector.cs (NSTask system_profiler)
    ├── InvAgent.Api/           # ASP.NET Core minimal API: /api/* + static SPA at 8787
    ├── InvAgent.Http/          # MeridianApiClient.cs: enroll, heartbeat, inventory, cmdb-sync
    ├── InvAgent.Queue/         # LocalQueue.cs: SQLite-backed write queue for offline resilience
    ├── InvAgent.Privacy/       # PrivacyFilter.cs: full/restricted/anonymized tiers
    ├── InvAgent.Config/        # AgentConfig.cs: JSON + env + CLI config model
    ├── InvAgent.Models/        # Shared DTOs: InventoryPayload, HeartbeatPayload, etc.
    └── InvAgent.Installers/
        ├── windows/            # WiX .wxs files for MSI
        ├── linux/              # debian/ control files for .deb
        └── macos/              # scripts/ for pkgbuild .pkg
```

### Pattern 1: BullMQ Webhook Delivery Worker
**What:** Each webhook delivery is a BullMQ job with built-in delay and retry. The job fetches the webhook config, signs the payload with HMAC-SHA256, POSTs to the target URL, and records the result in WebhookDelivery.
**When to use:** Every time a WebhookEventType event fires in the API.
**Example:**
```typescript
// apps/worker/src/workers/webhook-delivery.ts
import { Worker, type Job } from 'bullmq';
import { createHmac } from 'node:crypto';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

export interface WebhookDeliveryJobData {
  tenantId: string;
  webhookId: string;
  event: string;     // WebhookEventType value
  payload: Record<string, unknown>;
}

export const webhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
  QUEUE_NAMES.WEBHOOK_DELIVERY,
  async (job: Job<WebhookDeliveryJobData>) => {
    const { tenantId, webhookId, event, payload } = job.data;

    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, tenantId, isActive: true },
    });
    if (!webhook) return; // Disabled or deleted — discard silently

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = webhook.secret
      ? createHmac('sha256', webhook.secret).update(body).digest('hex')
      : null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Meridian-Event': event,
    };
    if (signature) headers['X-Meridian-Signature'] = `sha256=${signature}`;

    const startMs = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const res = await fetch(webhook.url, { method: 'POST', headers, body });
      responseStatus = res.status;
      responseBody = await res.text().catch(() => null);
      success = res.status >= 200 && res.status < 300;
    } catch (err) {
      responseBody = err instanceof Error ? err.message : String(err);
    }

    await prisma.webhookDelivery.create({
      data: {
        tenantId,
        webhookId,
        event,
        payload: payload as never,
        responseStatus,
        responseBody: responseBody?.slice(0, 1000),
        attemptCount: (job.attemptsMade ?? 0) + 1,
        success,
        deliveredAt: success ? new Date() : null,
      },
    });

    if (!success) throw new Error(`Webhook delivery failed: HTTP ${responseStatus}`);
  },
  {
    connection: bullmqConnection,
    concurrency: 5,
  },
);
```

BullMQ job options for exponential backoff matching locked decision (1min, 5min, 30min, 2hr, 12hr):
```typescript
// In API when enqueuing webhook delivery:
await webhookDeliveryQueue.add('deliver', jobData, {
  attempts: 5,
  backoff: { type: 'custom' },
  // Custom delays: BullMQ does not support per-attempt custom delays natively.
  // Use attempts:5 with exponential backoff and set delays manually via
  // job.opts.delay at each retry, OR use the simpler approach:
  // attempts: 5, backoff: { type: 'exponential', delay: 60_000 }
  // which yields: 60s, 120s, 240s, 480s, 960s (close enough for v1)
});
```

**Note:** BullMQ 5.x exponential backoff formula is `delay * 2^(attempt-1)`. To match the locked schedule (1min, 5min, 30min, 2hr, 12hr), use custom backoff with a lookup table via a `backoff: { type: 'custom' }` handler registered on the worker:
```typescript
// Worker custom backoff
const BACKOFF_DELAYS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
webhookDeliveryWorker.opts.settings = {
  backoffStrategy: (attemptsMade) => BACKOFF_DELAYS[attemptsMade - 1] ?? 43_200_000,
};
```

### Pattern 2: Expo Push via expo-server-sdk (Server Side)
**What:** After creating an in-app notification, enqueue a push delivery job. The push worker uses `expo-server-sdk` to send via Expo Push API (which handles FCM + APNs transparently).
**When to use:** Whenever `notifyUser()` is called and the user has active DeviceTokens with push preferences enabled.
**Example:**
```typescript
// apps/worker/src/workers/push-notification.ts
import { Worker } from 'bullmq';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

const expo = new Expo();

export interface PushJobData {
  tenantId: string;
  userId: string;
  title: string;
  body?: string;
  screen?: string;   // e.g. 'ticket', 'change'
  entityId?: string;
}

export const pushNotificationWorker = new Worker<PushJobData>(
  QUEUE_NAMES.PUSH_NOTIFICATION,
  async (job) => {
    const { tenantId, userId, title, body, screen, entityId } = job.data;

    const tokens = await prisma.deviceToken.findMany({
      where: { tenantId, userId, isActive: true },
    });
    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        title,
        body,
        data: { screen, entityId },
        sound: 'default',
      }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Log DeviceReceiptIds for receipt checking (optional for v1)
      for (const ticket of tickets) {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          // Mark stale tokens inactive
          const staleToken = tokens.find((t) => t.token === (ticket as unknown as {to: string}).to);
          if (staleToken) {
            await prisma.deviceToken.update({
              where: { id: staleToken.id },
              data: { isActive: false },
            });
          }
        }
      }
    }
  },
  { connection: bullmqConnection, concurrency: 3 },
);
```

### Pattern 3: .NET Agent ICollector Interface
**What:** Each platform provides a concrete ICollector that returns a normalized InventoryPayload. The host selects the right collector based on `RuntimeInformation.IsOSPlatform()`.
**When to use:** At the start of each collection cycle.
```csharp
// src/InvAgent.Collectors/ICollector.cs
public interface ICollector
{
    Task<InventoryPayload> CollectAsync(CancellationToken ct = default);
}

// Registered in DI:
// builder.Services.AddSingleton<ICollector>(sp =>
//   RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? new WmiCollector() :
//   RuntimeInformation.IsOSPlatform(OSPlatform.Linux) ? new ProcCollector() :
//   new MacOsCollector());
```

### Pattern 4: .NET Agent Polly HTTP Resilience
**What:** All HTTP calls to the Meridian API use a Polly-wrapped HttpClient with exponential backoff.
```csharp
// src/InvAgent.Http/MeridianApiClient.cs
services.AddHttpClient<MeridianApiClient>()
    .AddResilienceHandler("meridian-retry", builder =>
    {
        builder.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 10,
            Delay = TimeSpan.FromSeconds(30),
            BackoffType = DelayBackoffType.Exponential,
            UseJitter = true,
        });
        builder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            SamplingDuration = TimeSpan.FromMinutes(2),
            FailureRatio = 0.5,
            MinimumThroughput = 3,
        });
    });
```

### Pattern 5: Mobile Axios Client with JWT Interceptor
**What:** All API calls use a single Axios instance that injects the JWT from the Zustand auth store and handles 401 by clearing the token and redirecting to login.
```typescript
// apps/mobile/src/api/client.ts
import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = axios.create();

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
```

### Pattern 6: Mobile Offline Queue (Zustand + TanStack Query Optimistic Updates)
**What:** Status changes and comments are written optimistically to TanStack Query cache AND stored in a Zustand offline queue. On reconnect, queued writes are replayed against the API. Server response wins on conflict.
```typescript
// apps/mobile/src/stores/offline.store.ts
interface PendingWrite {
  id: string;     // Local UUID
  type: 'add_comment' | 'update_status';
  ticketId: string;
  payload: unknown;
  createdAt: string;
}

interface OfflineStore {
  queue: PendingWrite[];
  enqueue: (write: Omit<PendingWrite, 'id' | 'createdAt'>) => void;
  dequeue: (id: string) => void;
}
```

### Pattern 7: Mobile Deep Link Routing
**What:** Push notification taps and incoming `servicedesk://` links navigate to the correct screen.
```typescript
// apps/mobile/src/hooks/usePushNotifications.ts
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';

export function usePushNotifications() {
  const navigation = useNavigation();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const { screen, entityId } = response.notification.request.content.data ?? {};
      if (screen === 'ticket' && entityId) {
        navigation.navigate('Tickets', { screen: 'TicketDetail', params: { id: entityId } });
      }
    });
    return () => subscription.remove();
  }, [navigation]);
}
```

### Pattern 8: Agent Enrollment Flow
**What:** Two-phase auth. Admin generates token in web UI → token written to AgentEnrollmentToken. Agent presents token → receives agentKey. All subsequent calls use `Authorization: ApiKey <agentKey>` header.
```
POST /api/v1/agents/enroll
  Body: { token: "<enrollment_token>", hostname, platform, agentVersion }
  Validates: tokenHash lookup, expiresAt, enrollCount < maxEnrollments
  Creates: Agent record (status=ACTIVE, agentKey=crypto.randomBytes(32).toString('hex'))
  Increments: enrollCount
  Returns: { agentKey, agentId }
```

### Anti-Patterns to Avoid
- **Direct FCM/APNs from Node.js without Expo:** Requires Apple Developer account p8 key + Firebase service account. `expo-server-sdk` handles both with Expo's push gateway and is the right choice for an Expo-managed app.
- **Webhook delivery in the API request handler:** Never call the target URL synchronously in the API route. Always enqueue via BullMQ — the target could be slow/unreachable.
- **Cross-app imports in workers:** Workers must not import from `apps/api/src/services/`. Duplicate any needed logic following the established `mapStripeStatus` precedent.
- **Agent WMI on non-Windows:** `System.Management` only works on Windows. Collector selection must be 100% runtime-platform-gated.
- **Storing raw JWT in expo-secure-store without device lock fallback:** expo-secure-store on Android stores in Keystore; on iOS in Keychain. Both are hardware-backed on modern devices. No additional encryption layer needed for v1.
- **Using `Expo.isExpoPushToken()` check only on registration:** Also check at send time — tokens can become invalid. Handle `DeviceNotRegistered` error tickets to clean up stale rows.
- **Using `expo-barcode-scanner` deprecated Camera API:** In Expo SDK 55, use the Camera-based approach via `expo-camera` with `barcodeScannerSettings` prop, OR use the standalone `expo-barcode-scanner` package which still works in SDK 55. Do NOT use the old `BarCodeScanner` from `expo-camera/legacy`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FCM + APNs push dispatch | Custom Firebase Admin + node-apn integration | `expo-server-sdk` | Expo Push API handles token format differences, APNs authentication, FCM v1 migration, receipt checking |
| .NET HTTP retry | Custom retry loop with `Thread.Sleep` | Polly 8.x `AddResilienceHandler` | Polly handles jitter, circuit breakers, cancellation tokens, concurrency |
| .NET config layering | Custom INI/TOML parser | `Microsoft.Extensions.Configuration` with JSON + env + CLI providers | Standard layered provider chain; handles override precedence automatically |
| .NET Windows platform service | Custom Windows Service harness | `UseWindowsService()` on `HostApplicationBuilder` | One method call; handles SCM lifecycle, event log integration |
| .NET systemd | Custom Unix daemon fork | `UseSystemd()` on `HostApplicationBuilder` | systemd notify protocol, journal logging built in |
| Mobile QR code scan | Manual camera frame processing | `expo-barcode-scanner` | GPU-accelerated barcode decoding; handles permissions |
| Mobile image compression | Manual canvas resize | `expo-image-manipulator` | Lossless/lossy resize with quality control; handles EXIF orientation |
| Mobile secure storage | `@react-native-async-storage/async-storage` for tokens | `expo-secure-store` | AsyncStorage is unencrypted flat file; expo-secure-store uses OS Keychain/Keystore |
| Webhook HMAC verification | Custom SHA-256 implementation | Node.js `crypto.createHmac('sha256', secret)` | Built-in; no external dep needed |
| BullMQ webhook retry scheduling | Cron job checking retry timestamps | BullMQ job attempts + backoff strategy | BullMQ delay + attempts handles retry scheduling, persistence, and visibility |

**Key insight:** The most expensive mistake in this phase would be implementing direct FCM + APNs integration. Using Expo Push API via `expo-server-sdk` eliminates Apple certificate management, Firebase service account setup, and handles the FCM HTTP v1 migration (legacy FCM is deprecated). This saves 2-3 days of infrastructure work.

---

## Common Pitfalls

### Pitfall 1: APNs Sandbox vs Production Certificate Mismatch
**What goes wrong:** Push notifications work in development (simulator) but fail silently on TestFlight or App Store builds. Expo Push API uses the correct APNs environment based on the app's code signing profile, but only if the EAS Build profile is correctly configured.
**Why it happens:** Development builds use APNs sandbox; production/TestFlight use APNs production. Expo handles this automatically IF the app is built with EAS Build using the correct profile.
**How to avoid:** Always build with `eas build --profile preview` for TestFlight testing, not dev client builds. Register device tokens only after `getExpoPushTokenAsync({ projectId })` succeeds — this call will fail in simulators without the correct setup.
**Warning signs:** `expo-notifications` returns a null or invalid push token; push tickets show `DeviceNotRegistered` immediately after registration.

### Pitfall 2: BullMQ Custom Backoff Not Registered on Worker
**What goes wrong:** `backoff: { type: 'custom' }` in job options silently falls back to no delay if `settings.backoffStrategy` is not registered on the Worker instance. All retries fire immediately.
**Why it happens:** BullMQ requires the `backoffStrategy` function to be provided in the Worker constructor options, not post-construction.
**How to avoid:** Pass `settings: { backoffStrategy: (attemptsMade) => BACKOFF_DELAYS[attemptsMade - 1] }` in the Worker constructor options object.
**Warning signs:** All 5 retry attempts fire within seconds of the first failure; no delay between attempts visible in Bull Board.

### Pitfall 3: expo-notifications Requires Permissions Before Token Registration
**What goes wrong:** `getExpoPushTokenAsync()` throws or returns invalid token if notification permissions not granted.
**Why it happens:** iOS requires explicit permission request; Android 13+ also requires `POST_NOTIFICATIONS` permission.
**How to avoid:** Always call `requestPermissionsAsync()` before `getExpoPushTokenAsync()`. Handle `granted: false` gracefully (push silently disabled, not an app crash).
**Warning signs:** Token registration API call succeeds but `token` field is null or empty string.

### Pitfall 4: .NET System.Management Only Available on Windows
**What goes wrong:** `using System.Management` compiles on all platforms but throws `PlatformNotSupportedException` at runtime on Linux/macOS.
**Why it happens:** NuGet package `System.Management` is included in the project but the types are Windows-only stubs on other platforms.
**How to avoid:** Wrap all WMI calls with `#if WINDOWS` or `RuntimeInformation.IsOSPlatform(OSPlatform.Windows)` guard. Use collector interface to ensure the DI container only registers `WmiCollector` on Windows.
**Warning signs:** Integration tests on Linux CI fail with `PlatformNotSupportedException` from WMI namespace.

### Pitfall 5: TanStack Query Persist Cache Size on Mobile
**What goes wrong:** `AsyncStorage` has a 2MB default limit per key in React Native. Large ticket lists or KB content can exceed the limit, causing silent persist failures.
**Why it happens:** `@tanstack/query-async-storage-persister` stores the entire query cache under a single AsyncStorage key.
**How to avoid:** Set `maxAge` on the persister to limit cache to recent data. Use `dehydrateState` with a filter to only persist ticket list + individual ticket queries (not all queries). Consider increasing AsyncStorage limit via build config.
**Warning signs:** First offline read works, then cache appears empty after app restart.

### Pitfall 6: Agent Local Queue SQLite on Mobile (Not Applicable — Agent is .NET)
**What goes wrong (agent):** Using in-memory queue for offline inventory storage means all pending submissions are lost on agent restart.
**Why it happens:** Agent is designed for spotty connectivity; if the daemon restarts (e.g., after OS reboot), in-memory queue is gone.
**How to avoid:** Use SQLite (via `Microsoft.Data.Sqlite`) as the offline queue backing store. Store serialized InventoryPayload rows with retry count and last attempt time. Flush on startup.
**Warning signs:** After agent restart, inventory not submitted even when server is back online.

### Pitfall 7: Webhook Auto-Disable Race Condition
**What goes wrong:** Auto-disable after 50 consecutive failures requires tracking `consecutiveFailures` on the Webhook model — this field is NOT in the current schema.
**Why it happens:** The `Webhook` model has no `consecutiveFailures` or `failureCount` field. The auto-disable logic needs somewhere to persist this count.
**How to avoid:** Add `consecutiveFailures Int @default(0)` to the Webhook model via a migration. Increment on each delivery failure, reset on success, auto-set `isActive = false` when count reaches 50.
**Warning signs:** Webhooks never auto-disable despite repeated failures; counter resets on every worker restart because it's stored in memory.

### Pitfall 8: React Navigation v7 TypeScript Screen Params
**What goes wrong:** TypeScript errors when navigating between screens (`params` type mismatch) if navigation param types are not declared.
**Why it happens:** React Navigation v7 with TypeScript requires explicit `RootStackParamList` type declarations.
**How to avoid:** Declare param types in a `src/navigation/types.ts` file and extend the `ReactNavigation.RootParamList` interface. Use `NativeStackScreenProps<RootStackParamList, 'ScreenName'>` in screen components.

---

## Code Examples

Verified patterns from codebase and official sources:

### Agent Enrollment Token Validation (API)
```typescript
// apps/api/src/routes/v1/agents/index.ts
import { createHash, randomBytes } from 'node:crypto';

app.post('/enroll', async (request, reply) => {
  const { token, hostname, platform, agentVersion } = request.body;
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const enrollToken = await prisma.agentEnrollmentToken.findFirst({
    where: {
      tokenHash,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (!enrollToken) return reply.code(401).send({ error: 'Invalid or expired enrollment token' });
  if (enrollToken.enrollCount >= enrollToken.maxEnrollments) {
    return reply.code(409).send({ error: 'Enrollment token max usage reached' });
  }

  const agentKey = randomBytes(32).toString('hex');

  await prisma.$transaction([
    prisma.agent.create({
      data: {
        tenantId: enrollToken.tenantId,
        agentKey,
        hostname,
        platform: platform as never,
        agentVersion,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      },
    }),
    prisma.agentEnrollmentToken.update({
      where: { id: enrollToken.id },
      data: { enrollCount: { increment: 1 } },
    }),
  ]);

  return reply.code(201).send({ agentKey });
});
```

### Extend notifyUser for Push Channel
```typescript
// Extended NotifyPayload:
export interface NotifyPayload {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  resourceId?: string;
  resource?: string;
  emailData?: { ... };
  pushData?: {         // NEW
    screen: string;    // 'ticket', 'change', etc.
    entityId: string;
  };
}

// In notifyUser(), after creating in-app notification:
if (payload.pushData) {
  void (async () => {
    try {
      await pushNotificationQueue.add('send-push', {
        tenantId: payload.tenantId,
        userId: payload.userId,
        title: payload.title,
        body: payload.body,
        screen: payload.pushData!.screen,
        entityId: payload.pushData!.entityId,
      });
    } catch (err) {
      console.error('[notification.service] push enqueue failed:', err);
    }
  })();
}
```

### EAS Build eas.json
```json
{
  "cli": { "version": ">= 18.4.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "http://localhost:3000" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "https://staging.meridian.example.com" }
    },
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://api.meridian.example.com" }
    }
  }
}
```

### Webhook Fan-Out on Ticket Event
```typescript
// Called from ticket.service.ts after ticket update:
async function dispatchWebhooks(
  tenantId: string,
  event: string,   // WebhookEventType value
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: event as never },
      },
    });

    for (const webhook of webhooks) {
      await webhookDeliveryQueue.add('deliver', {
        tenantId,
        webhookId: webhook.id,
        event,
        payload,
      }, {
        attempts: 5,
        backoff: { type: 'custom' },
      });
    }
  } catch (err) {
    console.error('[webhook] dispatchWebhooks failed:', err);
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Firebase Admin + node-apn for push | expo-server-sdk via Expo Push API | FCM HTTP v1 migration (2024) | Old FCM legacy API deprecated; Expo Push API abstracts both platforms |
| `BarCodeScanner` from expo-camera/legacy | `expo-barcode-scanner` standalone package | Expo SDK 51+ | Camera API refactored; legacy API removed in SDK 53+ |
| React Navigation v6 TypeScript params via `useNavigation<NavigationProp<...>>` | Explicit `RootParamList` + `ReactNavigation.RootParamList` extension | React Navigation v7 | Stronger type inference, less casting |
| .NET `BackgroundService` as base class | `IHostedService` or `BackgroundService` (both valid) | .NET 6+ | Both work; `Worker Service` template uses `BackgroundService` which is the standard |
| Polly v7 `WaitAndRetryAsync()` extension methods | Polly v8 `AddResilienceHandler()` in `Microsoft.Extensions.Http.Resilience` | Polly 8 / .NET 8 | New API; v7 extensions still work but v8 is idiomatic for .NET 8/9 |

**Deprecated/outdated:**
- `firebase-admin` direct APNs: FCM legacy HTTP API shutdown June 2024. Use Expo Push API or FCM v1 directly.
- `expo-camera` `BarCodeScanner` legacy: Removed in SDK 53. Use `expo-barcode-scanner` or `expo-camera` with `barcodeScannerSettings`.
- `react-native-camera`: Archived/unmaintained. Use `expo-image-picker` + `expo-camera`.

---

## Schema Gap: Webhook consecutiveFailures

The locked decision requires "auto-disable after 50 consecutive failures." The current `Webhook` model does NOT have a `consecutiveFailures` field. This field must be added via a Prisma migration in Wave 0 of the agent/integrations work stream:

```prisma
model Webhook {
  // ... existing fields ...
  consecutiveFailures Int @default(0)  // ADD THIS
}
```

Without this field, the auto-disable logic has nowhere to persist the failure count between worker restarts.

---

## Open Questions

1. **APNs credentials for TestFlight testing**
   - What we know: Expo Push API handles APNs if the app is built via EAS Build with a provisioning profile that includes push notification entitlements.
   - What's unclear: Whether the Apple Developer account credentials are already configured in the EAS project, or if setup is needed.
   - Recommendation: EAS build setup instructions should be documented in the plan's Wave 0. The planner should include a task for `eas credentials` configuration before TestFlight builds.

2. **User push preferences storage**
   - What we know: The CONTEXT.md requires per-user configurable push notification preferences (toggle per NotificationType). No `UserPushPreferences` model exists in the schema.
   - What's unclear: Whether this should be a separate model or a JSON field on the User model.
   - Recommendation: Add a `pushPreferences Json?` field to the `User` model (simpler, avoids a join table). Default value: `{ all: true }` meaning all 12 types enabled. The push worker checks this field before sending.

3. **expo-barcode-scanner vs expo-camera barcode scanning in SDK 55**
   - What we know: `expo-barcode-scanner` is at v13.0.1 and works in SDK 55. The package description notes it will eventually be deprecated in favor of `expo-camera`.
   - What's unclear: Whether SDK 55 has fully moved barcode scanning to `expo-camera`.
   - Recommendation: Use `expo-barcode-scanner` for SDK 55. It works, is simpler to integrate for a single-use QR scan screen, and the deprecation timeline is not imminent.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 (unit); Playwright (E2E, existing) |
| Config file | Root `vitest.config.ts` (per-app) |
| Quick run command | `pnpm --filter api vitest run` |
| Full suite command | `pnpm test` (turbo) |

Note: The mobile app (Expo/React Native) uses Jest via Expo's test runner, not Vitest. The .NET agent uses `xUnit.net` which runs independently via `dotnet test`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-03 | Enrollment token validation (hash, expiry, maxEnrollments) | unit | `pnpm --filter api vitest run src/routes/v1/agents/agents.test.ts` | Wave 0 |
| AGNT-04 | Heartbeat updates lastHeartbeatAt | unit | `pnpm --filter api vitest run src/routes/v1/agents/agents.test.ts` | Wave 0 |
| AGNT-05 | Inventory snapshot stored with tenantId scoping | unit | `pnpm --filter api vitest run src/routes/v1/agents/agents.test.ts` | Wave 0 |
| PUSH-02 | Device token registration (duplicate deviceId upserts) | unit | `pnpm --filter api vitest run src/routes/v1/push/push.test.ts` | Wave 0 |
| INTG-01 | API key CRUD: create returns key once, hash stored | unit | `pnpm --filter api vitest run src/routes/v1/settings/api-keys.test.ts` | Wave 0 |
| INTG-03 | Webhook delivery: HMAC signature, retry backoff | unit | `pnpm --filter worker vitest run src/workers/webhook-delivery.test.ts` | Wave 0 |
| INTG-03 | Webhook auto-disable at 50 consecutive failures | unit | `pnpm --filter worker vitest run src/workers/webhook-delivery.test.ts` | Wave 0 |
| INTG-02 | External ticket API respects tenantId from apiKey | unit | `pnpm --filter api vitest run src/routes/external/external.test.ts` | Wave 0 |
| AGNT-01 | .NET collector interface returns valid InventoryPayload | unit | `dotnet test apps/inventory-agent/src/InvAgent.Tests` | Wave 0 |
| MOBL-03 | Secure token survives app restart | manual | — | manual-only: requires device |
| MOBL-07 | Push notifications received on physical device | manual | — | manual-only: requires push infrastructure |
| MOBL-09 | Deep link tap opens correct screen | manual | — | manual-only: requires device |

### Sampling Rate
- **Per task commit:** `pnpm --filter api vitest run` (covers most backend work)
- **Per wave merge:** `pnpm test` (full turbo suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/routes/v1/agents/agents.test.ts` — covers AGNT-03, AGNT-04, AGNT-05
- [ ] `apps/api/src/routes/v1/push/push.test.ts` — covers PUSH-02, PUSH-05
- [ ] `apps/api/src/routes/v1/settings/api-keys.test.ts` — covers INTG-01
- [ ] `apps/api/src/routes/external/external.test.ts` — covers INTG-02
- [ ] `apps/worker/src/workers/webhook-delivery.test.ts` — covers INTG-03, INTG-04
- [ ] `apps/inventory-agent/src/InvAgent.Tests/CollectorTests.cs` — covers AGNT-01, AGNT-02
- [ ] Schema migration: add `consecutiveFailures Int @default(0)` to Webhook model
- [ ] Schema migration: add `pushPreferences Json?` to User model
- [ ] `apps/mobile/` — full Expo SDK 55 scaffold (currently stub package.json only)

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `apps/api/src/plugins/api-key.ts`, `apps/api/src/routes/external/index.ts`, `apps/api/src/services/notification.service.ts`, `apps/worker/src/workers/cmdb-reconciliation.ts`, `apps/worker/src/queues/definitions.ts`, `packages/db/prisma/schema.prisma`
- npm registry (verified 2026-03-23) — expo@55.0.8, bullmq@5.71.0, @react-navigation/bottom-tabs@7.15.6, expo-notifications@55.0.13, expo-image-picker@55.0.13, expo-secure-store@55.0.9, expo-barcode-scanner@13.0.1, zustand@5.0.12, axios@1.13.6, react-native@0.84.1

### Secondary (MEDIUM confidence)
- CLAUDE.md project instructions — confirms React Navigation v7, Zustand, TanStack Query v5, axios, react-native-vector-icons for mobile
- STATE.md accumulated decisions — confirms stack locked: Expo SDK 55, .NET 9, BullMQ 5, React 19.2.1+
- expo-server-sdk: official npm package for server-side Expo push (confirmed via npm)

### Tertiary (LOW confidence)
- .NET Polly 8.x `AddResilienceHandler` API: based on official Microsoft docs pattern (could not verify exact method signatures via Context7)
- WiX Toolset MSI + dpkg-deb + pkgbuild installer patterns: based on training knowledge, not verified against current tooling docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry 2026-03-23
- Architecture: HIGH — patterns derived from existing codebase; no speculation
- Pitfalls: HIGH for schema gaps (verified by reading schema); MEDIUM for .NET platform issues (training knowledge, not Context7-verified)
- Validation: HIGH — follows established vitest patterns from previous phases

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable libraries; Expo SDK minor updates possible but non-breaking)
