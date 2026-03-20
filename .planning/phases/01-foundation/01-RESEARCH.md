# Phase 1: Foundation - Research

**Researched:** 2026-03-19
**Domain:** Monorepo scaffold, full Prisma schema, tenant isolation infrastructure, Fastify 5 auth pipeline, BullMQ worker setup, MinIO storage wiring
**Confidence:** HIGH (core stack verified against npm registry + existing STACK.md/ARCHITECTURE.md project research)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Monorepo Structure**
- pnpm 9 workspaces + Turborepo 2 for build orchestration
- Apps: `apps/api` (Fastify 5), `apps/web` (Next.js 16), `apps/owner` (Next.js 16), `apps/worker` (BullMQ process), `apps/mobile` (Expo stub)
- Packages: `packages/db` (Prisma 7), `packages/core` (service layer), `packages/types` (Zod 4 schemas)
- Node.js 22 LTS required (Fastify 5 needs Node 20+)
- Docker Compose for dev services: PostgreSQL 17 (port 5432), Redis 7 (port 6379), MinIO (port 9001), MailHog (port 8025)

**Database Schema**
- All 50+ Prisma models defined in Phase 1 (full schema upfront to avoid migration churn in later phases)
- Every table has `tenantId UUID NOT NULL` — non-negotiable
- Prisma query extension (not middleware — extensions are typed) that automatically injects tenantId on every query
- Database seeding: default tenant, system roles (admin, msp_admin, agent, end_user), default categories, default SLA policies, test users (admin@msp.local/Admin123!, agent@msp.local/Agent123!, user@customer.local/User123!)

**Authentication**
- Fastify 5 API server with plugin architecture
- @fastify/jwt 9.x for JWT signing/verification (15-min access tokens, 7-day refresh tokens)
- Better Auth 1.x for session management and RBAC primitives — but validate organizations plugin integration in a spike; fallback to pure @fastify/jwt if friction
- bcrypt for password hashing
- Middleware pipeline order: CORS → Auth (JWT verify) → Tenant (extract tenantId) → RBAC (check permissions) → planGate (stub for Phase 2) → Route handler
- API key auth for .NET agent endpoints: hash keys with prefix identification, scoped permissions
- Rate limiting via @fastify/rate-limit with Redis backing: AUTH 5/15min, API 100/min, API_READ 300/min, API_WRITE 30/min, EXPENSIVE 5/min
- Password reset: time-limited token via email link

**Multi-Tenancy**
- Shared-schema approach (tenantId column, not schema-per-tenant or RLS)
- Every service function takes `tenantId: string` as explicit first parameter — never infer from context
- Prisma client extension that enforces tenantId on all operations
- Cross-tenant isolation test suite must pass before any feature code
- Tenant model with types: MSP, ENTERPRISE, B2C
- CustomerOrganization model for MSP multi-org management
- Subdomain routing via org-lookup service

**Owner Admin Isolation**
- Separate Next.js app on port 3800
- Separate JWT secret (OWNER_JWT_SECRET, distinct from NEXTAUTH_SECRET)
- Separate cookie domain
- Never exposed through Cloudflare or public DNS
- OwnerUser table with bcrypt + TOTP MFA
- No code path in apps/web can authenticate to owner admin

**Infrastructure**
- BullMQ workers in separate Node.js process (apps/worker)
- Every job payload includes tenantId as required field; worker asserts before DB access
- MinIO/S3-compatible storage with tenantId-prefixed bucket paths
- AES encryption for stored email passwords
- Health check endpoint at /api/health
- Org lookup service for subdomain-based tenant resolution

### Claude's Discretion
- Exact Turborepo pipeline configuration
- Prisma migration naming conventions
- Redis connection pooling strategy
- Exact folder structure within each app
- Error response format standardization
- Logger implementation (pino recommended for Fastify)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FNDN-01 | Monorepo initialized with pnpm workspaces and Turborepo build pipeline | pnpm-workspace.yaml + turbo.json patterns documented; Turborepo 2 pipeline config in Architecture Patterns section |
| FNDN-02 | Shared database package (`packages/db`) with Prisma 7 schema covering all 50+ models | Full model inventory from DOCUMENTATION.md Section 3; Prisma 7 extension API for tenant injection documented |
| FNDN-03 | Shared types package (`packages/types`) with Zod schemas for all API inputs/outputs | Zod 4.3.6 verified; schema-sharing pattern between API and frontend documented |
| FNDN-04 | Fastify 5 API server (`apps/api`) with plugin architecture and middleware pipeline | Fastify 5.8.2 verified; plugin registration, preHandler hooks, middleware order documented |
| FNDN-05 | Next.js 16 frontend (`apps/web`) with App Router and React 19 | Next.js 16.2.0 verified; stub app (no feature code) is Phase 1 goal |
| FNDN-06 | Docker Compose configuration for PostgreSQL, Redis, MinIO, and MailHog | Full docker-compose.yml pattern in Code Examples section |
| FNDN-07 | Database seeding with default tenant, roles, categories, SLA policies, and test users | Seed script pattern with test credentials documented |
| TNCY-01 | Every database table has tenantId column; every query is scoped by tenantId | Prisma extension pattern for automatic tenantId injection documented |
| TNCY-02 | Tenant model with types (MSP, ENTERPRISE, B2C) and subscription plan fields | Full Tenant model field set from DOCUMENTATION.md Section 3 |
| TNCY-03 | CustomerOrganization model for MSP customers managing multiple client orgs | CustomerOrganization model documented; MSP isolation pattern clarified |
| TNCY-04 | Tenant-scoped middleware on all API routes that injects tenantId from JWT claims | Fastify preHandler hook pattern for tenant middleware documented |
| TNCY-05 | Prisma query extension or middleware that enforces tenantId on every operation | Prisma 7 `$extends` client extension API documented with code example |
| TNCY-06 | Subdomain-based tenant routing via Cloudflare Worker and org-lookup service | Org-lookup service as standalone Next.js app (port 3600) per DOCUMENTATION.md Section 14 |
| AUTH-01 | User can log in with email and password (bcrypt hashed) | @node-rs/bcrypt 1.10.7 verified; login endpoint pattern documented |
| AUTH-02 | JWT-based session with tenantId, userId, and roles in claims | @fastify/jwt 10.0.0 verified; token claim structure documented |
| AUTH-03 | System roles: admin, msp_admin, agent, end_user with predefined permissions | Role seeding in FNDN-07; RBAC permission constants documented |
| AUTH-04 | Custom roles with JSON permission arrays, assignable per tenant | Role model with permissions JSON array documented |
| AUTH-05 | Permission checking via hasPermission(userId, tenantId, permission) | hasPermission() service function pattern documented |
| AUTH-06 | Role scoping to CustomerOrganization for MSP model | UserRole model with optional customerOrganizationId documented |
| AUTH-07 | API key authentication for external integrations with scoped permissions | ApiKey model; hash-prefix pattern; apiKeyMiddleware Fastify plugin documented |
| AUTH-08 | Rate limiting: AUTH 5/15min, API 100/min, API_READ 300/min, API_WRITE 30/min | @fastify/rate-limit 10.3.0 with Redis store documented; rate buckets defined |
| AUTH-09 | Password reset flow via email link with time-limited token | PasswordResetToken pattern; MailHog for dev testing |
| INFR-01 | Background workers via BullMQ: SLA monitoring, email notifications, email polling, CMDB reconciliation | BullMQ 5.71.0 verified; worker process structure in apps/worker documented |
| INFR-02 | Redis for queue management, caching, and rate limiting | ioredis 3.1013.0 verified; connection singleton pattern documented |
| INFR-03 | MinIO/S3-compatible file storage for attachments | @aws-sdk/client-s3 with MinIO endpoint override documented; bucket path pattern with tenantId prefix |
| INFR-04 | AES encryption for stored email passwords | AES-256-GCM pattern with Node.js crypto module documented |
| INFR-05 | Health check endpoint | Fastify route at /api/health documented |
| INFR-06 | Org lookup service for subdomain-based tenant resolution | Standalone Next.js 15 app on port 3600 pattern from DOCUMENTATION.md Section 14 |
</phase_requirements>

---

## Summary

Phase 1 is the most critical phase in the entire project: every architectural decision made here constrains all subsequent phases. The goal is a fully wired monorepo scaffold where services start, compile, and enforce tenant isolation — with zero feature code yet written. Getting this wrong means refactoring 50+ models and rewiring the auth pipeline while feature work is already in progress.

The stack is fully locked (pnpm 9 + Turborepo 2 + Fastify 5 + Prisma 7 + BullMQ 5 + Better Auth 1.x). All package versions have been verified against the npm registry as of 2026-03-19. The biggest architectural risk in this phase is the Prisma 7 client extension approach for tenant injection — the extension API is relatively new (moved from middleware in v5+) and the typed extension pattern requires care to avoid bypassing the scope accidentally.

The second risk is the Better Auth 1.x + Fastify 5 integration for the organizations plugin. The CONTEXT.md explicitly calls for a spike to validate this before full implementation, with a fallback to pure @fastify/jwt. Research finds that Better Auth 1.5.5 has documented Fastify integration but the organizations plugin complexity may not justify the benefit for Phase 1 — the fallback is fully viable.

**Primary recommendation:** Build the Prisma tenant extension and cross-tenant isolation test suite first, before any auth code. If tenant isolation fails at the data layer, auth correctness is meaningless. Auth pipeline second, feature stubs third.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 9.x | Package manager | Workspace-native, symlinked node_modules prevent phantom deps |
| turborepo | 2.x | Build orchestration | Remote caching, parallel builds, pipeline deps for monorepo |
| TypeScript | 5.7+ | Language | Strict mode; end-to-end type safety across all packages |
| fastify | 5.8.2 | API HTTP server | 70-80k req/s; plugin ecosystem; schema-first; Node.js native |
| @fastify/jwt | 10.0.0 | JWT signing + verification | Official plugin; preHandler hook integration |
| @fastify/cors | 11.2.0 | CORS | Official plugin; production-tested |
| @fastify/rate-limit | 10.3.0 | Rate limiting | Per-route limits; Redis store support |
| @fastify/multipart | 9.4.0 | File uploads | Ticket attachments, agent binary uploads |
| @fastify/swagger | 9.7.0 | OpenAPI docs | Auto-generates API spec from Zod schemas |
| @fastify/type-provider-zod | 5.10.1 | Zod + Fastify bridge | Route-level request/response validation |
| better-auth | 1.5.5 | Session management | Organizations plugin for multi-tenancy; Fastify integration documented |
| @node-rs/bcrypt | 1.10.7 | Password hashing | WASM bcrypt; no native compilation; faster than pure-JS |
| prisma | 7.5.0 | ORM + migrations | Pure TypeScript engine (no Rust); typed client extensions; 50+ model schema |
| @prisma/client | 7.5.0 | Prisma runtime client | Generated typed DB client |
| zod | 4.3.6 | Schema validation | 14x faster than v3; shared between API and frontend; Zod-to-JSON-schema for OpenAPI |
| bullmq | 5.71.0 | Job queue | Redis-backed; retry/backoff; job priority; distributed locking |
| ioredis | 3.1013.0 | Redis client | BullMQ dependency; singleton connection for rate limiting and caching |
| @aws-sdk/client-s3 | 3.x | S3/MinIO client | Works with MinIO endpoint override; same client for dev and prod |
| next | 16.2.0 | Frontend framework | App Router; React 19; Turbopack default |
| react | 19.2.1+ | UI library | Mandatory — patches CVE-2025-55182 RCE in RSC Flight protocol |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | 9.x | Structured logging | Fastify's built-in logger; JSON logs; low overhead |
| @fastify/helmet | latest | Security headers | HTTP security headers on all responses |
| dotenv | 16.x | Environment config | .env loading in apps/api and apps/worker |
| tsx | 4.x | TypeScript runner | Dev-time ts-node replacement for Node 22 |
| vitest | 3.x | Unit testing | Fast; native ESM; compatible with TypeScript 5.7+ |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/jwt | jose | jose is lower-level; more control but more boilerplate; @fastify/jwt integrates with Fastify lifecycle |
| Better Auth | Pure custom JWT | Custom JWT is simpler for Phase 1; Better Auth adds session management and org plugin; the CONTEXT.md spike instruction reflects this tradeoff |
| Prisma 7 client extension | Prisma middleware ($use) | Middleware is deprecated in v5+; extensions are typed and tree-shakeable; extensions are the correct API |
| @node-rs/bcrypt | bcryptjs | bcryptjs is pure JS (no WASM) — 3-4x slower; acceptable but @node-rs/bcrypt is better |
| ioredis | node-redis | BullMQ officially supports and tests against ioredis; mixing clients is not recommended |

**Installation (monorepo bootstrap order):**
```bash
# Root
pnpm init
pnpm add -D turborepo typescript @types/node

# packages/db
pnpm add prisma @prisma/client
pnpm add -D prisma

# packages/types
pnpm add zod

# packages/core
pnpm add zod  # re-exports from types package

# apps/api
pnpm add fastify @fastify/jwt @fastify/cors @fastify/rate-limit @fastify/multipart @fastify/swagger @fastify/type-provider-zod @fastify/helmet
pnpm add better-auth @node-rs/bcrypt ioredis @aws-sdk/client-s3 pino

# apps/worker
pnpm add bullmq ioredis

# apps/web, apps/owner
pnpm add next react react-dom
```

**Version verification (as of 2026-03-19):**
- fastify: 5.8.2 (npm registry confirmed)
- @fastify/jwt: 10.0.0 (npm registry confirmed)
- prisma: 7.5.0 (npm registry confirmed)
- bullmq: 5.71.0 (npm registry confirmed)
- better-auth: 1.5.5 (npm registry confirmed)
- zod: 4.3.6 (npm registry confirmed)
- next: 16.2.0 (npm registry confirmed)
- @fastify/rate-limit: 10.3.0 (npm registry confirmed)
- ioredis: 3.1013.0 (npm registry confirmed)

---

## Architecture Patterns

### Recommended Project Structure

```
meridian-itsm/
├── apps/
│   ├── api/                        # Fastify 5 REST API server
│   │   ├── src/
│   │   │   ├── plugins/            # Fastify plugins (auth, cors, rate-limit)
│   │   │   ├── middleware/         # preHandler hooks (tenant, rbac, planGate)
│   │   │   ├── routes/             # Route handlers grouped by domain
│   │   │   │   ├── auth/           # login, logout, refresh, password-reset
│   │   │   │   ├── health/         # /api/health
│   │   │   │   └── v1/             # versioned API routes
│   │   │   ├── services/           # API-specific orchestration (thin wrappers)
│   │   │   └── server.ts           # Fastify instance factory
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                        # Next.js 16 (stub — layout + auth pages only in Phase 1)
│   ├── owner/                      # Next.js 16 (stub — private port 3800)
│   ├── worker/                     # BullMQ worker process
│   │   ├── src/
│   │   │   ├── queues/             # Queue definitions (names, connection)
│   │   │   ├── workers/            # Worker processors (one file per queue)
│   │   │   └── index.ts            # Worker entry point
│   │   └── package.json
│   └── mobile/                     # Expo stub (package.json only in Phase 1)
├── packages/
│   ├── db/                         # Prisma schema + generated client + extensions
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # ALL 50+ models
│   │   │   ├── migrations/
│   │   │   └── seed.ts             # Default tenant, roles, SLA policies, test users
│   │   ├── src/
│   │   │   ├── client.ts           # Prisma client singleton with tenant extension
│   │   │   └── extensions/
│   │   │       └── tenant.ts       # Prisma $extends tenant scope injection
│   │   └── package.json
│   ├── types/                      # Zod schemas + inferred TS types
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── tenant.ts
│   │   │   ├── ticket.ts           # Defined in Phase 1 even if used in Phase 3
│   │   │   └── index.ts
│   │   └── package.json
│   ├── core/                       # Service layer (pure TypeScript, no HTTP)
│   │   ├── src/
│   │   │   ├── services/           # TenantService, UserService, AuthService, etc.
│   │   │   └── index.ts
│   │   └── package.json
│   └── config/                     # Shared ESLint, TypeScript, Prettier configs
│       ├── eslint/
│       └── typescript/
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

### Pattern 1: Fastify 5 Plugin Architecture

**What:** Fastify 5 uses a plugin system where every feature (auth, CORS, rate limiting) is encapsulated as a plugin registered with `fastify.register()`. Plugins have lexically scoped context — child plugins inherit parent context but not vice versa. This is how middleware isolation works in Fastify.

**When to use:** All cross-cutting concerns (auth, tenant injection, RBAC, rate limiting) are plugins with `preHandler` hooks. Route groups are also plugins.

**Example:**
```typescript
// apps/api/src/server.ts
import Fastify from 'fastify';
import { fastifyJwt } from '@fastify/jwt';
import { fastifyCors } from '@fastify/cors';
import { fastifyRateLimit } from '@fastify/rate-limit';
import { authPlugin } from './plugins/auth.js';
import { tenantPlugin } from './plugins/tenant.js';
import { rbacPlugin } from './plugins/rbac.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth/index.js';
import { v1Routes } from './routes/v1/index.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // Layer 1: CORS (no auth required)
  await app.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // Layer 2: JWT plugin (signs/verifies, does NOT enforce)
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  });

  // Layer 3: Rate limiting (Redis-backed)
  await app.register(fastifyRateLimit, {
    redis: redisClient,
    max: 100,
    timeWindow: '1 minute',
  });

  // Public routes (no auth)
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Protected routes — auth + tenant + RBAC via preHandler chain
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authPlugin);    // verifies JWT
    protectedApp.addHook('preHandler', tenantPlugin);  // injects tenant
    protectedApp.addHook('preHandler', rbacPlugin);    // checks permissions
    await protectedApp.register(v1Routes, { prefix: '/api/v1' });
  });

  return app;
}
```

### Pattern 2: Prisma 7 Client Extension for Tenant Injection

**What:** Prisma 7 uses the `$extends` API to add typed extensions to the client. The tenant extension wraps every query operation to inject `tenantId` automatically. This is the authoritative approach — Prisma middleware (`$use`) is deprecated.

**Critical detail:** The extension must handle models that do NOT have `tenantId` (e.g., `Tenant`, `OwnerUser`, `SubscriptionPlan`). An exclusion list is required.

**When to use:** Always import the tenant-scoped client in route handlers and workers. Only use the raw client for the exclusion list models.

**Example:**
```typescript
// packages/db/src/extensions/tenant.ts
import { Prisma } from '@prisma/client';

// Models that exist OUTSIDE tenant scope
const GLOBAL_MODELS = new Set([
  'Tenant',
  'OwnerUser',
  'OwnerSession',
  'SubscriptionPlan',
  'TenantSubscription',
  'OwnerNote',
]);

export function withTenantScope(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (GLOBAL_MODELS.has(model)) {
              return query(args); // pass through without tenantId
            }

            // Inject tenantId on write operations
            if (['create', 'createMany'].includes(operation)) {
              args.data = { ...args.data, tenantId };
            }

            // Inject tenantId on read operations
            if (['findFirst', 'findMany', 'findUnique', 'count', 'aggregate'].includes(operation)) {
              args.where = { ...args.where, tenantId };
            }

            // Inject tenantId on update/delete — prevent cross-tenant writes
            if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
              args.where = { ...args.where, tenantId };
            }

            return query(args);
          },
        },
      },
    })
  );
}

// Usage in route handler:
// const db = basePrismaClient.$extends(withTenantScope(tenantId));
```

### Pattern 3: Fastify preHandler Hook Chain (Middleware Pipeline)

**What:** Fastify has no traditional "middleware" — instead it uses lifecycle hooks. `preHandler` hooks run after routing, before the handler. Multiple `addHook('preHandler', ...)` calls chain in registration order.

**When to use:** Auth verify, tenant inject, RBAC check are all `preHandler` hooks registered on the scoped plugin that wraps protected routes.

**Example:**
```typescript
// apps/api/src/plugins/auth.ts
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    // payload is now available on request.user (set by @fastify/jwt)
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// apps/api/src/plugins/tenant.ts
export async function tenantPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { tenantId } = request.user as { tenantId: string };
  if (!tenantId) {
    return reply.code(401).send({ error: 'Missing tenantId in token' });
  }

  // Cache lookup first, then DB
  const tenant = await tenantService.findActive(tenantId);
  if (!tenant) {
    return reply.code(403).send({ error: 'Tenant not found or suspended' });
  }

  request.tenant = tenant; // TypeScript: extend FastifyRequest via declaration merging
}
```

### Pattern 4: BullMQ Worker Process with Tenant Assertion

**What:** Workers run in a separate Node.js process (`apps/worker`), not inside the Fastify server. They import `packages/core` service functions directly and pass `tenantId` from the job payload.

**When to use:** All background processing: SLA monitoring, email notification dispatch, email polling, CMDB reconciliation.

**Example:**
```typescript
// apps/worker/src/workers/sla-monitor.ts
import { Worker } from 'bullmq';
import { redisConnection } from '../queues/connection.js';
import { SlaService } from '@meridian/core';
import { prisma } from '@meridian/db';

export const slaMonitorWorker = new Worker(
  'sla-monitor',
  async (job) => {
    const { tenantId, ticketId } = job.data;

    // ASSERTION — never process without tenantId
    if (!tenantId) throw new Error(`Job ${job.id} missing tenantId — refusing to process`);

    const breach = await SlaService.checkBreach(prisma, tenantId, ticketId);
    if (breach) {
      await notificationQueue.add('sla-breach', { tenantId, ticketId, breach });
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
  }
);
```

### Pattern 5: API Key Authentication Plugin

**What:** API keys for .NET agent endpoints and external integrations use a separate Fastify plugin that checks the `Authorization: ApiKey <key>` header. Keys are stored hashed (SHA-256) with a plaintext prefix for identification (`mk_live_...`).

**When to use:** Routes under `/api/v1/agents/` and `/api/v1/external/`.

**Example:**
```typescript
// apps/api/src/plugins/api-key.ts
export async function apiKeyPreHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers['authorization'];
  if (!header?.startsWith('ApiKey ')) {
    return reply.code(401).send({ error: 'API key required' });
  }

  const rawKey = header.slice(7);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8); // e.g., "mk_live_"

  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash, keyPrefix, isActive: true },
    include: { tenant: true },
  });

  if (!apiKey || apiKey.tenant.status !== 'ACTIVE') {
    return reply.code(401).send({ error: 'Invalid or revoked API key' });
  }

  request.tenantId = apiKey.tenantId;
  request.apiKey = apiKey;
}
```

### Pattern 6: pnpm Workspace + Turborepo Configuration

**What:** `pnpm-workspace.yaml` defines workspace packages. `turbo.json` defines the build pipeline with dependency ordering. The critical pipeline ordering is: `db#build` → `types#build` → `core#build` → `api#build`.

**Example:**
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "dependsOn": ["db:migrate"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

### Pattern 7: AES-256-GCM Encryption for Email Credentials

**What:** Email account SMTP/IMAP passwords are encrypted at rest using AES-256-GCM. The Node.js `crypto` module provides this natively — no external library needed.

**Example:**
```typescript
// packages/core/src/utils/encryption.ts
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes = 64 hex chars

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}
```

### Pattern 8: Subdomain-Based Tenant Resolution (Org Lookup)

**What:** The org-lookup service (`apps/org-lookup`) is a lightweight Next.js 15 app on port 3600. When a request arrives with a subdomain (e.g., `acme.meridian.app`), the service resolves the subdomain to a `tenantId` and `backendUrl`. Cloudflare Worker calls this service on each request.

**Example:**
```typescript
// apps/org-lookup/app/api/resolve/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subdomain = searchParams.get('subdomain');

  const tenant = await prisma.tenant.findFirst({
    where: { subdomain, status: 'ACTIVE' },
    select: { id: true, backendUrl: true, name: true },
  });

  if (!tenant) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ tenantId: tenant.id, backendUrl: tenant.backendUrl });
}
```

### Anti-Patterns to Avoid

- **tenantId from request body:** Never trust `request.body.tenantId`. Extract exclusively from verified JWT payload or API key record. A tenant can forge a body-supplied tenantId to access another tenant's data.
- **Global Prisma client without extension:** Never use the raw `prisma` client in route handlers. Always use `prisma.$extends(withTenantScope(tenantId))`.
- **BullMQ job without tenantId in payload:** Every job enqueue call must include `{ tenantId, ...rest }`. Workers throw if tenantId is absent.
- **Shared JWT secret across apps:** `JWT_SECRET` (tenant API) and `OWNER_JWT_SECRET` (owner portal) must be different values. A single secret is a security failure.
- **Prisma `$use` middleware:** Deprecated in Prisma 5+. The `$extends` API is the correct approach for Prisma 7. `$use` will be removed in a future version.
- **Better Auth without spike validation:** The CONTEXT.md explicitly calls for a spike. Do not assume the organizations plugin works with Fastify 5 without validation. The fallback (pure @fastify/jwt) is fully viable for Phase 1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing + verification | Custom HMAC JWT | @fastify/jwt | Token expiry, JWKS, algorithm negotiation, Fastify lifecycle integration |
| Rate limiting with Redis | Custom token bucket | @fastify/rate-limit with Redis store | Distributed rate limiting across replicas; atomic Redis operations |
| Password hashing | Custom bcrypt | @node-rs/bcrypt | Timing attack prevention; work factor calibration; WASM performance |
| Job queue with retry | Custom Redis pub/sub | BullMQ | Delayed jobs, priority, dead letter queues, distributed locking, concurrency control |
| S3-compatible storage client | Custom HTTP client | @aws-sdk/client-s3 | Multipart upload, presigned URLs, retry, streaming |
| AES encryption | Custom cipher | Node.js crypto (built-in) | GCM authentication tag prevents tampering; built-in is audited |
| HTTP security headers | Manual header setting | @fastify/helmet | CSP, HSTS, X-Frame-Options — easy to miss one |
| Schema validation on API | Manual type checks | Zod + @fastify/type-provider-zod | Serialization, deserialization, error messages, TypeScript inference |

**Key insight:** Every item in this list has subtle security or reliability edge cases. The libraries exist precisely because the naive implementation gets these wrong.

---

## Common Pitfalls

### Pitfall 1: Prisma Extension Bypassed by Raw Queries

**What goes wrong:** Developers use `prisma.$queryRaw` or `prisma.$executeRaw` for performance-sensitive queries (e.g., CMDB recursive CTEs). These bypass the `$extends` tenant scope extension entirely.

**Why it happens:** Raw queries are necessary for recursive CTEs and full-text search. The extension only wraps the typed query builder.

**How to avoid:** Create a `rawWithTenant()` helper that prepends `AND tenant_id = $1` to all raw query WHERE clauses. Treat raw queries as requiring explicit review in code review. Add a lint rule or test that exercises raw queries with a second tenant and verifies no cross-tenant data leaks.

**Warning signs:** Any `$queryRaw` call that does not have `tenantId` in its argument list.

### Pitfall 2: Better Auth Organizations Plugin Integration Friction

**What goes wrong:** Better Auth 1.x's `organizations` plugin expects to manage its own session/organization state. In this architecture, tenant isolation is already handled by Prisma extensions and JWT claims. Forcing Better Auth's org model onto the existing `Tenant` model may create schema conflicts or require duplicate tables.

**Why it happens:** Better Auth's organizations plugin was designed for a different multi-tenancy pattern. This project already has a fully specified Tenant/CustomerOrganization/UserRole schema.

**How to avoid:** Run the spike first (as CONTEXT.md requires). If Better Auth's org plugin schema conflicts with the existing model, use Better Auth only for session management (auth flows, password reset, session tokens) and implement RBAC manually using the existing `Role`/`UserRole` tables. The fallback is clean: `@fastify/jwt` + custom RBAC is the simpler path.

**Warning signs:** Better Auth attempting to run its own migrations that create `organizations`, `members`, or `sessions` tables that duplicate existing Prisma models.

### Pitfall 3: Turborepo Task Output Caching Breaks Migration State

**What goes wrong:** Turborepo caches build outputs. If `db:migrate` is cached, subsequent runs skip it and the database may be behind schema. This is silent — the app starts but queries against old columns fail at runtime.

**Why it happens:** Turborepo's cache is hash-based. If the `schema.prisma` file has not changed, the migrate task output is considered cached.

**How to avoid:** Always set `"cache": false` for `db:migrate` and `db:seed` tasks in `turbo.json`. Migrations and seeds are stateful operations that must always run. Only build artifacts (compiled JS, type declarations) should be cached.

**Warning signs:** `turbo run db:migrate` completes in 0ms and reports "cache hit".

### Pitfall 4: @fastify/jwt 10.x Breaking Changes from v9

**What goes wrong:** The STACK.md documents `@fastify/jwt 9.x`, but the npm registry shows 10.0.0 is current. Version 10 has breaking changes around token verification options.

**Why it happens:** Version pinning in documentation lags the registry.

**How to avoid:** Use `@fastify/jwt@^10.0.0` (verified current). Review the 10.x changelog for breaking changes vs 9.x before assuming the STACK.md examples are valid verbatim. The plugin API surface is stable but some option names changed.

**Warning signs:** TypeScript errors on `request.jwtVerify()` options object.

### Pitfall 5: Prisma 7 Extension Type Safety on `$allModels`

**What goes wrong:** The `$allModels` query extension does not have access to the model name at the TypeScript type level inside the callback. If you write model-specific logic (e.g., "skip tenantId for the Tenant model"), TypeScript cannot verify the model name string at compile time.

**Why it happens:** The `model` parameter inside `$allModels.$allOperations` is typed as `string`, not as a union of model names.

**How to avoid:** Use a `Set<string>` constant for excluded models (as shown in Pattern 2 above). Accept that this is a runtime check, not a compile-time check. Write tests that verify excluded models are not accidentally tenant-scoped.

### Pitfall 6: Redis Connection Singleton in Worker Process vs API Process

**What goes wrong:** Both `apps/api` and `apps/worker` need Redis connections. If both import a shared singleton from a package, they get separate process-level singletons. This is correct behavior but developers sometimes expect shared state between processes.

**Why it happens:** Misunderstanding of Node.js module caching scope (per-process, not per-machine).

**How to avoid:** Each process creates its own ioredis connection using the same `REDIS_URL` env var. This is correct. Do not attempt to share connection instances across processes — Redis handles concurrency at the server level. Document this explicitly so developers don't try to "fix" it.

### Pitfall 7: Missing `tenantId` Index on Every Table

**What goes wrong:** All 50+ tables have `tenantId` as a column, but if the column lacks an index, every tenant-scoped query does a full table scan. At low data volumes this is invisible; at moderate scale (10K+ tickets) it becomes the primary bottleneck.

**Why it happens:** Prisma schema does not add indexes automatically for foreign key columns unless `@index` is specified.

**How to avoid:** Every model that has `tenantId` must also have `@@index([tenantId])` in the Prisma schema. For frequently queried combinations, add compound indexes: `@@index([tenantId, status])` on Ticket, `@@index([tenantId, slaBreachAt])` for SLA monitoring queries.

---

## Code Examples

Verified patterns from research and official sources:

### Complete docker-compose.yml for Dev Services

```yaml
# docker-compose.yml (root)
version: '3.9'
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: meridian
      POSTGRES_PASSWORD: meridian
      POSTGRES_DB: meridian
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U meridian']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    ports:
      - '9000:9000'
      - '9001:9001'
    environment:
      MINIO_ROOT_USER: meridian
      MINIO_ROOT_PASSWORD: meridian123
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 5s
      timeout: 5s
      retries: 5

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - '1025:1025'   # SMTP
      - '8025:8025'   # Web UI

volumes:
  postgres_data:
  minio_data:
```

### MinIO S3 Client Setup with TenantId-Prefixed Paths

```typescript
// packages/core/src/utils/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1', // MinIO ignores this but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true, // Required for MinIO — virtual-hosted style does not work
});

const BUCKET = process.env.STORAGE_BUCKET ?? 'meridian';

export function buildStoragePath(tenantId: string, resource: string, filename: string): string {
  // tenantId-prefixed paths for isolation: {tenantId}/attachments/{filename}
  return `${tenantId}/${resource}/${filename}`;
}

export async function uploadFile(
  tenantId: string,
  resource: string,
  filename: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const key = buildStoragePath(tenantId, resource, filename);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return key;
}
```

### Prisma Seed Script Pattern

```typescript
// packages/db/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Default MSP tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'msp-default' },
    update: {},
    create: {
      name: 'Default MSP',
      slug: 'msp-default',
      type: 'MSP',
      status: 'ACTIVE',
      subdomain: 'default',
    },
  });

  // System roles
  const roles = [
    { name: 'Admin', slug: 'admin', permissions: ['*'], isSystemRole: true },
    { name: 'MSP Admin', slug: 'msp_admin', permissions: ['tickets.*', 'users.*', 'settings.*'], isSystemRole: true },
    { name: 'Agent', slug: 'agent', permissions: ['tickets.read', 'tickets.update', 'knowledge.read'], isSystemRole: true },
    { name: 'End User', slug: 'end_user', permissions: ['tickets.create', 'tickets.read.own'], isSystemRole: true },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: role.slug } },
      update: {},
      create: { ...role, tenantId: tenant.id },
    });
  }

  // Test users
  const testUsers = [
    { email: 'admin@msp.local', password: 'Admin123!', roleSlug: 'admin', firstName: 'MSP', lastName: 'Admin' },
    { email: 'agent@msp.local', password: 'Agent123!', roleSlug: 'agent', firstName: 'Test', lastName: 'Agent' },
    { email: 'user@customer.local', password: 'User123!', roleSlug: 'end_user', firstName: 'Customer', lastName: 'User' },
  ];

  for (const u of testUsers) {
    const passwordHash = await hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email_tenantId: { email: u.email, tenantId: tenant.id } },
      update: {},
      create: { email: u.email, passwordHash, firstName: u.firstName, lastName: u.lastName, tenantId: tenant.id, status: 'ACTIVE' },
    });
    // Assign role
    const role = await prisma.role.findFirst({ where: { tenantId: tenant.id, slug: u.roleSlug } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id, tenantId: tenant.id },
      });
    }
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
```

### TypeScript Declaration Merging for Fastify Request

```typescript
// apps/api/src/types/fastify.d.ts
import type { Tenant, User } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
    tenantId: string;
    currentUser: User;
    apiKey?: { id: string; scopes: string[]; tenantId: string };
  }
}
```

---

## Full Data Model Inventory

The following 50+ Prisma models must be defined in Phase 1 (full schema upfront per CONTEXT.md decision). Organized by domain:

### Core Tenancy & Identity (8 models)
`Tenant`, `CustomerOrganization`, `User`, `UserGroup`, `Role`, `UserRole`, `Session`, `ApiKey`

### Service Desk (9 models)
`Ticket`, `TicketComment`, `TicketAttachment`, `TicketActivity`, `TicketKnowledgeArticle`, `Queue`, `SLA`, `Category`, `EmailAccount`

### Change Management (8 models)
`Change`, `ChangeApproval`, `ChangeActivity`, `ChangeApplication`, `ChangeAsset`, `CABMeeting`, `CABMeetingAttendee`, `CABMeetingChange`

### Knowledge Management (1 model)
`KnowledgeArticle`

### Asset & Endpoint Management (3 models)
`Asset`, `Site`, `BusinessUnit`

### Application Portfolio (5 models)
`Application`, `ApplicationDependency`, `ApplicationDocument`, `ApplicationActivity`, `ApplicationAsset`

### Agent & Inventory (4 models)
`Agent`, `AgentEnrollmentToken`, `InventorySnapshot`, `MetricSample`

### CMDB (5 models)
`CmdbCategory`, `CmdbConfigurationItem`, `CmdbRelationship`, `CmdbChangeRecord`, `CmdbTicketLink`

### Owner Admin & Billing (6 models)
`OwnerUser`, `OwnerSession`, `SubscriptionPlan`, `TenantSubscription`, `TenantUsageSnapshot`, `OwnerNote`

### Supporting (12 models)
`Vendor`, `Contract`, `ContractAsset`, `AuditLog`, `Notification`, `DeviceToken`, `EmailTemplate`, `AlertConfiguration`, `ScheduledReport`, `Webhook`, `WebhookDelivery`, `PasswordResetToken` (implied by AUTH-09)

**Total: approximately 61 models**

**Indexes required on every tenanted model:**
- `@@index([tenantId])` — basic tenant scoping
- `@@index([tenantId, status])` — status-filtered lists (tickets, changes, assets)
- `@@index([tenantId, createdAt])` — time-sorted lists with pagination

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma `$use` middleware for tenant injection | Prisma `$extends` client extension | Prisma 5+ | Extensions are typed; middleware is deprecated; extension API is the correct approach in Prisma 7 |
| Prisma Rust engine (binary download) | Pure TypeScript engine | Prisma 7 (Jan 2026) | Eliminated binary compilation issues; 85% smaller bundle; 70% faster type checking |
| NextAuth (Auth.js) in Next.js API routes | @fastify/jwt + Better Auth on dedicated API server | Architectural choice | NextAuth is tightly coupled to Next.js; separate API server needs framework-agnostic auth |
| Bull (v3) Redis queue | BullMQ 5 | 2020 (BullMQ released) | Bull is unmaintained; BullMQ has breaking API but adds priority, delay, and distributed locking |
| @fastify/jwt 9.x | @fastify/jwt 10.0.0 | 2026 | Breaking changes in verification options; use current version |
| Turborepo 1.x | Turborepo 2.x | 2024 | Improved caching, new task graph, `turbo.json` `$schema` URL changed |

**Deprecated/outdated:**
- `Prisma $use middleware`: Deprecated in v5, use `$extends` in Prisma 7
- `Bull (v3)`: Unmaintained, replaced by BullMQ
- `@fastify/jwt 9.x`: Superseded by 10.0.0 — use 10.x

---

## Open Questions

1. **Better Auth 1.x Organizations Plugin Viability**
   - What we know: Better Auth 1.5.5 has a documented Fastify integration and an organizations plugin. The CONTEXT.md calls for a spike validation before committing.
   - What's unclear: Whether the organizations plugin's schema (tables it creates via migrations) conflicts with the existing Prisma Tenant/UserRole schema. Better Auth may want to own its own `organizations`, `members`, and `sessions` tables.
   - Recommendation: Write a minimal Fastify + Better Auth + Prisma spike in a throwaway branch. If schema conflict exists, drop the organizations plugin and use Better Auth only for auth flows (email/password, session tokens, password reset). Implement RBAC from the existing Role/UserRole tables manually. Document spike result in a wave-0 task before building AUTH routes.

2. **PasswordResetToken Model**
   - What we know: AUTH-09 requires password reset via email link with time-limited token. No explicit model was defined in DOCUMENTATION.md Section 3.
   - What's unclear: Whether this should be a standalone Prisma model or Better Auth manages this internally.
   - Recommendation: Add a `PasswordResetToken` model to the Prisma schema: `{ id, token (hashed), userId, tenantId, expiresAt, usedAt }`. If Better Auth is used, check whether it provides this functionality natively before adding a custom model.

3. **Org-Lookup Service Architecture**
   - What we know: TNCY-06 requires subdomain-based tenant routing. DOCUMENTATION.md Section 14 describes `apps/org-lookup` as a standalone Next.js 15 app on port 3600.
   - What's unclear: Whether the org-lookup service needs to be fully functional in Phase 1 (dev environment uses localhost, not subdomains) or if a stub is sufficient.
   - Recommendation: In Phase 1, implement the org-lookup service as a functional stub: the resolve endpoint exists and works, but Cloudflare Worker routing is deferred. Dev environment accesses the API directly via localhost:4000. Mark TNCY-06 as "service wired, routing deferred" at Phase 1 exit.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.ts` at monorepo root (or per-package) |
| Quick run command | `pnpm --filter @meridian/db test` |
| Full suite command | `pnpm turbo test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TNCY-01 | Tenant B cannot read Tenant A's data | integration | `pnpm --filter @meridian/db test -- isolation` | Wave 0 |
| TNCY-05 | Prisma extension injects tenantId on all operations | unit | `pnpm --filter @meridian/db test -- extension` | Wave 0 |
| AUTH-01 | Login with correct credentials returns access token | integration | `pnpm --filter @meridian/api test -- auth` | Wave 0 |
| AUTH-01 | Login with wrong password returns 401 | integration | `pnpm --filter @meridian/api test -- auth` | Wave 0 |
| AUTH-02 | JWT payload contains tenantId, userId, roles | unit | `pnpm --filter @meridian/api test -- jwt` | Wave 0 |
| AUTH-07 | API key resolves to correct tenantId | unit | `pnpm --filter @meridian/api test -- api-key` | Wave 0 |
| AUTH-08 | AUTH route limited to 5 requests per 15 min | integration | `pnpm --filter @meridian/api test -- rate-limit` | Wave 0 |
| INFR-01 | BullMQ worker processes job with tenantId assertion | unit | `pnpm --filter @meridian/worker test -- worker` | Wave 0 |
| INFR-01 | Worker throws if job payload missing tenantId | unit | `pnpm --filter @meridian/worker test -- worker` | Wave 0 |
| INFR-05 | GET /api/health returns 200 | smoke | `pnpm --filter @meridian/api test -- health` | Wave 0 |
| INFR-03 | MinIO upload path includes tenantId prefix | unit | `pnpm --filter @meridian/core test -- storage` | Wave 0 |
| INFR-04 | AES encrypt/decrypt roundtrip produces original plaintext | unit | `pnpm --filter @meridian/core test -- encryption` | Wave 0 |
| FNDN-01 | pnpm install completes; turbo build succeeds | smoke | `pnpm install && pnpm turbo build` | Wave 0 |
| FNDN-02 | prisma migrate dev succeeds; all 50+ models created | smoke | `pnpm --filter @meridian/db db:migrate` | Wave 0 |
| FNDN-07 | Seed creates test users with correct roles | smoke | `pnpm --filter @meridian/db db:seed` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @meridian/db test && pnpm --filter @meridian/api test`
- **Per wave merge:** `pnpm turbo test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/db/src/__tests__/tenant-extension.test.ts` — covers TNCY-01, TNCY-05
- [ ] `apps/api/src/__tests__/auth.test.ts` — covers AUTH-01, AUTH-02
- [ ] `apps/api/src/__tests__/api-key.test.ts` — covers AUTH-07
- [ ] `apps/api/src/__tests__/rate-limit.test.ts` — covers AUTH-08
- [ ] `apps/worker/src/__tests__/worker.test.ts` — covers INFR-01
- [ ] `packages/core/src/__tests__/storage.test.ts` — covers INFR-03
- [ ] `packages/core/src/__tests__/encryption.test.ts` — covers INFR-04
- [ ] `vitest.config.ts` at monorepo root
- [ ] Framework install: `pnpm add -D vitest @vitest/coverage-v8` in each package that has tests

---

## Sources

### Primary (HIGH confidence)
- npm registry (fastify@5.8.2, @fastify/jwt@10.0.0, prisma@7.5.0, bullmq@5.71.0, better-auth@1.5.5, zod@4.3.6, next@16.2.0) — version verification
- `.planning/research/STACK.md` — project stack research document; already verified against official sources
- `.planning/research/ARCHITECTURE.md` — project architecture research; component boundaries, data flows, build order
- `.planning/research/PITFALLS.md` — project pitfalls research; cross-tenant isolation, worker tenant context
- `DOCUMENTATION .md` — Section 3 (Data Model): authoritative 50+ model inventory

### Secondary (MEDIUM confidence)
- `.planning/phases/01-foundation/01-CONTEXT.md` — user-locked implementation decisions; treated as authoritative for this phase
- Fastify 5 plugin documentation (via STACK.md source research) — preHandler hook chain pattern
- Prisma 7 `$extends` extension API (via STACK.md source research) — typed tenant extension pattern
- Better Auth 1.x Fastify integration docs (via STACK.md source: better-auth.com/docs/integrations/fastify) — MEDIUM confidence; spike validation required

### Tertiary (LOW confidence)
- None — all findings are supported by primary or secondary sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified against npm registry
- Architecture: HIGH — based on existing project research documents that cite official sources
- Prisma 7 extension API: HIGH — Prisma 7 released January 2026; `$extends` is the documented API
- Better Auth integration: MEDIUM — documented Fastify support exists; organizations plugin viability requires spike
- Pitfalls: HIGH — derived from existing project pitfalls research document with cited sources

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable stack; 30-day window before package versions should be re-verified)
