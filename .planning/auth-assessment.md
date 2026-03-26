# MeridianITSM Auth Pre-Flight Assessment

## Current Auth Implementation

| Component | Technology | Details |
|-----------|-----------|---------|
| Password Hashing | `@node-rs/bcrypt` | Cost factor 10, sync interface |
| Session/Auth | JWT via `@fastify/jwt` + `jose` | 15min access, 7d refresh |
| Cookie | `meridian_session` | httpOnly: false, SameSite: Lax |
| Multi-tenancy | Row-level with tenantId | Prisma extension auto-scoping |
| RBAC | JSON permission arrays on Role | Wildcard support (e.g., `tickets.*`) |
| API Key Auth | SHA-256 hash lookup | Separate from JWT auth |
| Owner Admin | Separate JWT + optional TOTP | Fully isolated |
| next-auth | **NOT USED** | Custom JWT system |

## Key Models
- **User**: id, tenantId, email, passwordHash, status, firstName, lastName
- **Role**: id, tenantId, name, slug, permissions (JSON array), isSystemRole
- **UserRole**: userId, roleId, tenantId (many-to-many)
- **Session**: exists but unused (JWT-based instead)
- **ApiKey**: keyHash (SHA-256), scopes (JSON), rate limiting

## Login Flow
1. Login page POSTs to `/auth-action` (Next.js Route Handler)
2. Route handler POSTs to `API_URL/api/auth/login` (Fastify)
3. Fastify validates credentials via bcrypt, loads roles, generates JWT pair
4. Route handler sets `meridian_session` cookie via Set-Cookie header
5. Client redirects to dashboard; middleware verifies JWT on each request

## Critical Constraint
- `/auth-action` route and login page are LOCKED — do not modify without user approval
- The login flow works through Cloudflare proxy (meridian.cybordyne.net)
- App runs in production mode (next build + next start)

## Tenant Model
- Row-level tenancy: every table has tenantId
- Tenant resolved by slug at login time
- User email unique per tenant: @@unique([tenantId, email])
- No subdomain routing currently active
