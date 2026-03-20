# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MeridianITSM** — a multi-tenant SaaS ITSM (IT Service Management) platform. This is a **clean rewrite** project guided by comprehensive documentation in `DOCUMENTATION .md`. The application supports MSP, Enterprise, and B2C tenant models with subscription-based licensing via Stripe.

Current completion: ~62% (235/380 tasks). The `DOCUMENTATION .md` file is the single source of truth for the full application specification.

## Architecture

### Monorepo Structure (pnpm + Turborepo)

| App | Stack | Port | Purpose |
|-----|-------|------|---------|
| `apps/web` | Next.js 16 (App Router), React 19 | 3000 | Main customer-facing app |
| `apps/mobile` | React Native + Expo SDK 52 | — | Native iOS/Android app |
| `apps/owner` | Next.js 16 (App Router) | 3800 | Private owner admin (billing, tenants, impersonation) — **never** customer-facing |
| `apps/inventory-agent` | .NET 8/9 | 8787 (local UI) | Cross-platform endpoint inventory agent |
| `apps/instance-manager` | Next.js 16 | 3700 | Multi-tenant instance orchestration |
| `apps/org-lookup` | Next.js 15 | 3600 | Tenant resolution by subdomain |

### Core Technology Stack

- **ORM**: Prisma 6 with PostgreSQL 15+
- **Cache/Queue**: Redis 7 + BullMQ
- **Auth**: NextAuth.js v5 (beta) — JWT strategy, credentials provider
- **CSS**: Tailwind CSS 4 + shadcn/ui (Radix primitives)
- **Icons**: Material Design Icons via `@mdi/react` + `@mdi/js` (tree-shakeable SVG, NOT the webfont)
- **Data Fetching**: TanStack Query v5
- **Forms**: React Hook Form + Zod
- **Rich Text**: TipTap
- **Testing**: Playwright (E2E), Vitest (unit)

### Local Dev Services (Docker Compose)

```bash
docker-compose up    # PostgreSQL:5432, Redis:6379, MinIO:9001, MailHog:8025
```

## Critical Design Rules

### 1. Multi-Tenancy — Every Query Must Be Scoped by tenantId
Every database table has a `tenantId` column. **Every query, without exception, must filter by `tenantId`**. This is the #1 security rule.

### 2. Owner Admin Is Fully Isolated
`apps/owner-admin` shares the PostgreSQL database but uses separate auth (`OwnerUser` table, separate JWT secret `OWNER_JWT_SECRET`), separate cookie domain, and is never exposed through Cloudflare. No code in `apps/web` may authenticate to or call the owner admin.

### 3. Plan Enforcement via planGate Middleware
Resource-creating API endpoints pass through `planGate` middleware that checks `TenantSubscription` usage vs. `planLimitsJson`. Returns `402 Payment Required` when limits exceeded. Feature flags (CMDB, mobile, webhooks) are in the `features[]` array on `SubscriptionPlan`.

### 4. API Route Pattern
All API routes are under `/api/v1/`, authenticate via `auth()` (NextAuth session), scope by `tenantId`, return JSON. External integrations use `/api/v1/external/` with API key auth. Owner admin routes are under `/api/admin/` in the separate app.

### 5. Icon Usage
```tsx
// Web & owner-admin: SVG approach only
import Icon from '@mdi/react';
import { mdiTicket } from '@mdi/js';
<Icon path={mdiTicket} size={1} color="currentColor" />

// Mobile: react-native-vector-icons
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
<MaterialCommunityIcons name="ticket" size={24} color="#000" />
```

## Build & Run Commands

```bash
# Install dependencies
pnpm install

# Run main web app (dev)
pnpm --filter web dev

# Run owner admin (dev)
pnpm --filter owner-admin dev

# Database
pnpm --filter web prisma generate
pnpm --filter web prisma migrate dev
pnpm --filter web prisma db seed

# Mobile
cd apps/mobile
npx expo run:ios
npx expo run:android
eas build --platform ios --profile production
eas build --platform android --profile production

# Agent (.NET)
cd apps/inventory-agent
dotnet build
dotnet run --project src/InvAgent.CLI -- --run-once

# E2E tests (base URL: http://localhost:3500)
pnpm --filter web playwright test
pnpm --filter web playwright test tests/specific-test.spec.ts

# Unit tests
pnpm --filter web vitest run
pnpm --filter web vitest run path/to/test.ts
```

## Data Model (50+ Prisma Models)

Key domains: Core Tenancy (Tenant, User, Role, UserGroup), Service Desk (Ticket, TicketComment, Queue, SLA, Category), Change Management (Change, ChangeApproval, CABMeeting), Knowledge (KnowledgeArticle), Assets (Asset, Site), Applications (Application, ApplicationDependency), Agents (Agent, AgentEnrollmentToken, InventorySnapshot), CMDB (CmdbConfigurationItem, CmdbRelationship, CmdbChangeRecord), Owner/Billing (OwnerUser, SubscriptionPlan, TenantSubscription, TenantUsageSnapshot).

Full schema documentation with all fields is in `DOCUMENTATION .md` Section 3.

## Key Backend Patterns

### Services (`lib/services/`)
Business logic is in dedicated service files: `sla-service.ts`, `email-service.ts`, `push-notification.service.ts`, `webhook.service.ts`, `cmdb.service.ts`, `cmdb-discovery.service.ts`, `change-lifecycle.service.ts`, etc.

### Background Workers (`lib/workers/`)
BullMQ workers: SLA monitoring (every minute), email notifications (event-driven), email polling (every 5 min), CMDB reconciliation (every 15 min). Auto-started in dev via `auto-start.ts`.

### Auth & RBAC
System roles: `admin`, `msp_admin`, `agent`, `end_user`. Custom roles with JSON permission arrays. Check via `hasPermission(userId, tenantId, PERMISSIONS.X)`. CMDB permissions: `CMDB_VIEW`, `CMDB_EDIT`, `CMDB_DELETE`, `CMDB_IMPORT`.

### Rate Limiting (`lib/rate-limit.ts`)
Redis token-bucket: AUTH 5/15min, API 100/min, API_READ 300/min, API_WRITE 30/min, EXPENSIVE 5/min.

## Frontend Architecture

- **Staff routes**: `/dashboard/*` — full ITSM interface
- **End-user routes**: `/portal/*` — simplified self-service (middleware auto-redirects end_users)
- **Providers**: `session-provider`, `tenant-provider`, `theme-provider`
- **55 dashboard pages**, 8 portal pages. Full page listing in `DOCUMENTATION .md` Section 5.

## Mobile Architecture (React Native + Expo)

- Navigation: React Navigation v7 (Stack + Bottom Tabs)
- State: Zustand + TanStack Query
- Push: `expo-notifications` (unified FCM for Android, APNs for iOS)
- Auth tokens stored in `expo-secure-store`
- Deep link scheme: `servicedesk://`
- API client: Axios with tenant-aware interceptors

## Agent Architecture (.NET)

10 C# projects under `apps/inventory-agent/src/`. Platform-specific collectors for Windows (WMI), Linux (/proc, dpkg/rpm), macOS (IOKit, system_profiler). Communicates with server via enrollment (`POST /api/v1/agents/enroll`), heartbeat, inventory submission, and CMDB sync (`POST /api/v1/agents/cmdb-sync`).

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| MSP Admin | admin@msp.local | Admin123! |
| Agent | agent@msp.local | Agent123! |
| End User | user@customer.local | User123! |

## Subscription Tiers

Starter → Professional → Business → Enterprise. Feature gates: CMDB, mobile, API, webhooks, scheduled reports, multi-tenant, SSO. See `DOCUMENTATION .md` Section 11 for full matrix.
