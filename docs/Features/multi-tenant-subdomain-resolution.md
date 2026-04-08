# Multi-Tenant Subdomain Resolution & Public Portal Access

## Overview

This document explains how tenant identification works in MeridianITSM, the current state of subdomain-based resolution, and the implementation plan for enabling public portal access per tenant.

---

## Current State (as of April 2026)

### How Tenant Identification Works Today

Every API request must carry a `tenantId`. Currently, this is embedded in the JWT token issued at login:

```
Login Flow:
1. User visits /login
2. Types tenant slug ("msp-default"), email, password
3. Backend finds tenant by slug → validates credentials → issues JWT with tenantId
4. JWT stored in meridian_session cookie
5. All subsequent API calls → auth middleware → extracts tenantId from JWT
```

**This means:** Without logging in, the system has no way to determine which tenant a request belongs to.

### Database Schema

```prisma
model Tenant {
  slug       String  @unique    // Required, used for login (e.g., "msp-default")
  subdomain  String? @unique    // Optional, for subdomain routing (e.g., "acme")
  backendUrl String?            // For future multi-instance deployments
}
```

### What's Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| `Tenant.subdomain` field | Schema exists | Nullable, unique, but rarely populated |
| `Tenant.slug` field | Fully working | Used in login flow |
| org-lookup API | Code exists | `GET /api/resolve?subdomain=x` → tenantId. Not consumed by anything |
| Subdomain extraction in middleware | Not implemented | Middleware only handles JWT auth |
| Owner admin subdomain provisioning | Not implemented | Provision form captures name, slug, plan — no subdomain |
| Public portal toggle | Not implemented | No per-tenant setting for public access |
| DNS wildcard | Not configured | No `*.meridianitsm.com` wildcard DNS entry |
| Nginx/Cloudflare subdomain routing | Not configured | Single-origin routing only |

### The Gap for Public/Anonymous Access

For **public forms**, **knowledge base**, or **portal pages** to work without login, the system needs a way to determine the tenant. Two approaches exist:

1. **UUID-based (already working)**: The anonymous forms feature uses form UUIDs (`/public/forms/[formId]`). The form record itself contains `tenantId`, so the API resolves the tenant from the data. No subdomain needed.

2. **Subdomain-based (planned)**: `acme.meridianitsm.com/portal/forms/it-service-request` where `acme` identifies the tenant from the URL.

---

## Architecture: How Subdomain Resolution Will Work

```
User visits:  acme.app-dev.meridianitsm.com/portal/forms
                ↓
Next.js middleware extracts "acme" from Host header
  (requires APP_DOMAIN env var to identify base domain)
                ↓
Middleware queries DB: subdomain "acme" → tenantId "uuid-123"
                ↓
Sets meridian_tenant cookie with tenantId + tenant slug
                ↓
For authenticated routes: JWT takes precedence (existing behavior)
For public routes: API reads tenantId from X-Tenant-Id header or cookie
```

### Subdomain Extraction Logic

```typescript
function extractSubdomain(host: string): string | null {
  const appDomain = process.env.APP_DOMAIN; // e.g., "app-dev.meridianitsm.com"
  if (!appDomain) return null;
  if (host === appDomain || host.startsWith('localhost')) return null;
  
  const subdomain = host.replace(`.${appDomain}`, '');
  if (subdomain === host) return null; // Host didn't contain the base domain
  return subdomain; // e.g., "acme"
}
```

---

## Public Portal Access Control

### Per-Tenant Settings

Each tenant admin can toggle public portal access in Settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `allowPublicPortal` | boolean | false | Master toggle for unauthenticated portal access |
| `publicPortalFeatures` | string[] | [] | Which features are publicly accessible |

Available public features:
- `knowledge_base` — Browse and read knowledge articles
- `service_forms` — Submit forms that have `requireAuth=false`
- `ticket_lookup` — Check ticket status by ticket number + email

### Access Decision Matrix

| Request | Has JWT? | Has Subdomain? | Tenant Setting | Result |
|---------|----------|----------------|----------------|--------|
| `/portal/forms` | Yes | Any | Any | Allowed (authenticated) |
| `/portal/forms` | No | Yes (`acme`) | `allowPublicPortal=true` | Allowed (public) |
| `/portal/forms` | No | Yes (`acme`) | `allowPublicPortal=false` | Redirect to login |
| `/portal/forms` | No | No | Any | Redirect to login |
| `/public/forms/[uuid]` | No | Any | N/A | Allowed (UUID-based, checks `requireAuth` on form) |

### How This Differs from Anonymous Forms

| Feature | Anonymous Forms (`/public/forms/[uuid]`) | Subdomain Portal (`acme.../portal/forms`) |
|---------|------------------------------------------|-------------------------------------------|
| Tenant resolution | From form UUID → tenantId | From subdomain → tenantId |
| URL format | `/public/forms/7edd1d6e-...` | `/portal/forms/it-service-request` |
| Requires subdomain setup | No | Yes |
| Requires DNS wildcard | No | Yes |
| Works today | Yes | No (needs implementation) |
| Best for | Shareable links, embedding | Branded tenant portals |

---

## Implementation Phases

### Phase 1: Owner Admin — Subdomain Provisioning
Add subdomain field to tenant creation and edit forms in the owner admin app.

### Phase 2: Middleware — Subdomain Extraction
Add `APP_DOMAIN` env var. Update Next.js middleware to extract subdomain from Host header and resolve to tenantId.

### Phase 3: Tenant Settings — Public Portal Toggle
Add `allowPublicPortal` setting. Build admin UI toggle. Update middleware to allow unauthenticated access when enabled.

### Phase 4: API — Subdomain-Based Tenant Context
Add `X-Tenant-Id` header support for public API routes. Create subdomain-tenant middleware plugin for Fastify.

### Phase 5: Login Enhancement
Auto-fill tenant slug from subdomain on the login page.

---

## Infrastructure Requirements

### DNS
- **Production**: `*.meridianitsm.com` CNAME → Cloudflare/load balancer
- **Dev**: `*.app-dev.meridianitsm.com` CNAME → dev server IP
- **SSL**: Cloudflare provides automatic wildcard SSL, or use Let's Encrypt with DNS challenge

### Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `APP_DOMAIN` | `app-dev.meridianitsm.com` | Base domain for subdomain extraction |
| `NEXT_PUBLIC_APP_DOMAIN` | `app-dev.meridianitsm.com` | Client-side base domain |

### Proxy (if needed)
Nginx or Cloudflare Workers can extract subdomain at the edge and forward as `X-Tenant-Id` header. This is optional if Next.js middleware handles it directly.
