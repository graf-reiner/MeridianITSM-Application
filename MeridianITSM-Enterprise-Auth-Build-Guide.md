# MeridianITSM — Enterprise Authentication Implementation Guide

## Document Purpose

This is a **build specification for Claude Code**. Follow each phase sequentially. Do not skip ahead. Confirm each phase compiles and passes basic smoke tests before proceeding to the next.

---

## Application Context

| Item | Value |
|------|-------|
| **Application** | MeridianITSM — MSP ITIL-Compliant Service Desk & Change Management System |
| **Repository** | `https://github.com/graf-reiner/MeridianITSM-Application` |
| **Stack** | Next.js, TypeScript, Prisma, PostgreSQL |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Existing Auth** | Local database-backed user/password authentication (Prisma User model, bcrypt hashing, session/JWT) |

## What We Are Building

Enterprise-grade authentication supporting:

1. **SAML 2.0 SSO** — Okta and Azure AD (Entra ID) as Identity Providers
2. **OpenID Connect (OIDC) SSO** — Okta and Azure AD (Entra ID)
3. **Multi-Factor Authentication (MFA)** — TOTP, WebAuthn/Passkeys, Email codes, SMS codes
4. **Coexistence with existing local auth** — tenants choose their auth method; local login remains available

---

## Architecture Decisions

### Auth Library: `next-auth` (Auth.js v5)

Use **Auth.js v5** (`next-auth@5` / `@auth/core`) as the authentication framework. Rationale:

- Native Next.js integration (App Router + API routes)
- Built-in OIDC provider support (Okta, Azure AD are first-class)
- Extensible callback system for mapping IdP claims to local users
- Session management with JWT or database sessions
- Already TypeScript-native

### SAML Library: `@boxyhq/saml-jackson`

Use **SAML Jackson** (by BoxyHQ) as the SAML-to-OIDC bridge. Rationale:

- Converts SAML into an OIDC-compatible flow — Auth.js sees it as just another OIDC provider
- Handles SAML metadata parsing, assertion validation, and signature verification
- Supports multiple IdPs per tenant (critical for multi-tenant)
- Open source, self-hosted, no external SaaS dependency
- Battle-tested in production at scale
- Stores SAML connections in PostgreSQL (shares your existing DB)

### MFA Library: Custom implementation using established packages

| Factor | Package |
|--------|---------|
| TOTP | `otpauth` (RFC 6238 compliant, generates QR URIs) |
| WebAuthn/Passkeys | `@simplewebauthn/server` + `@simplewebauthn/browser` |
| Email codes | Custom — generate 6-digit code, store hashed in DB, send via existing email service |
| SMS codes | Custom — generate 6-digit code, store hashed in DB, send via Twilio SDK (`twilio`) |

### Multi-Tenant Auth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Login Page                               │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│   │ Email/Pass   │    │ SSO (OIDC)   │    │ SSO (SAML 2.0)  │ │
│   │ (Local Auth) │    │ Okta/AzureAD │    │ Okta/AzureAD    │ │
│   └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘ │
│          │                   │              ┌──────┘           │
│          │                   │              ▼                  │
│          │                   │     SAML Jackson Bridge         │
│          │                   │     (converts to OIDC)          │
│          │                   │              │                  │
│          │                   ◄──────────────┘                  │
│          │                   │                                 │
│          ▼                   ▼                                 │
│   ┌──────────────────────────────────────┐                    │
│   │         Auth.js (next-auth v5)       │                    │
│   │   - Session management               │                    │
│   │   - JWT / DB session                 │                    │
│   │   - Callback hooks                   │                    │
│   └──────────────────┬───────────────────┘                    │
│                      │                                        │
│                      ▼                                        │
│   ┌──────────────────────────────────────┐                    │
│   │         MFA Challenge Layer          │                    │
│   │   - TOTP (Authenticator App)         │                    │
│   │   - WebAuthn / Passkeys              │                    │
│   │   - Email Code                       │                    │
│   │   - SMS Code                         │                    │
│   └──────────────────┬───────────────────┘                    │
│                      │                                        │
│                      ▼                                        │
│   ┌──────────────────────────────────────┐                    │
│   │      Prisma User (Local DB)          │                    │
│   │   - JIT provisioning from IdP        │                    │
│   │   - Link SSO identity to local user  │                    │
│   │   - Tenant-scoped                    │                    │
│   └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0 — Pre-Flight Assessment

**Goal:** Understand the current state before changing anything.

### Tasks

1. **Read and document the existing auth implementation**
   - Find the current Prisma schema (`schema.prisma`) — identify the `User`, `Session`, `Account` models (or equivalent)
   - Identify how passwords are currently hashed (bcrypt? argon2?)
   - Identify how sessions are currently managed (JWT cookies? express-session? next-auth already?)
   - Identify any existing middleware that checks auth on API routes and pages
   - Document the current login/logout flow end-to-end

2. **Read `CLAUDE.md`** at the repo root — follow any project conventions documented there

3. **Check for existing next-auth configuration**
   - Search for `next-auth`, `authOptions`, `auth.ts`, `[...nextauth]` in the codebase
   - If Auth.js is already in use, document the current configuration and providers

4. **Document the current tenant model**
   - How is multi-tenancy implemented? (schema-per-tenant, row-level with `tenantId`, subdomain routing, etc.)
   - How is the current user associated with a tenant?

5. **Output a summary file** at `.planning/auth-assessment.md` with your findings before proceeding

### Acceptance Criteria
- [ ] Current auth flow documented
- [ ] Prisma schema models identified
- [ ] Tenant model understood
- [ ] No code changes made yet

---

## Phase 1 — Database Schema Extensions

**Goal:** Extend the Prisma schema to support SSO connections, MFA credentials, and account linking.

### New Prisma Models

Add these models to the existing `schema.prisma`. Do NOT modify or remove existing models — only extend.

```prisma
// ============================================================
// SSO Configuration — Per-tenant identity provider connections
// ============================================================

model SsoConnection {
  id              String   @id @default(cuid())
  tenantId        String
  // tenant relation — match whatever your existing Tenant model FK pattern is
  
  name            String   // Display name: "Corporate Okta", "Azure AD Prod"
  protocol        String   // "saml" | "oidc"
  status          String   @default("active") // "active" | "disabled" | "pending_setup"
  
  // --- OIDC fields ---
  oidcClientId      String?
  oidcClientSecret  String?   // Encrypted at rest — see Phase 1 notes
  oidcIssuerUrl     String?   // e.g. https://login.microsoftonline.com/{tenant}/v2.0
  oidcDiscoveryUrl  String?   // .well-known/openid-configuration URL
  
  // --- SAML fields (used by SAML Jackson) ---
  samlMetadataUrl   String?   // IdP metadata URL
  samlMetadataRaw   String?   // Raw XML metadata (if uploaded instead of URL)
  samlEntityId      String?   // SP entity ID
  samlAcsUrl        String?   // Assertion Consumer Service URL
  
  // --- Behavioral settings ---
  autoProvision     Boolean  @default(true)  // JIT create users on first SSO login
  defaultRole       String   @default("user") // Role assigned to JIT-provisioned users
  forceMfa          Boolean  @default(false)  // Require MFA even after SSO
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@unique([tenantId, name])
  @@index([tenantId])
}

// ============================================================
// Federated Identity — Links external IdP identities to local users
// ============================================================

model FederatedIdentity {
  id              String   @id @default(cuid())
  userId          String
  // user relation — match existing User model FK pattern
  
  provider        String   // "okta" | "azure-ad" | "saml-jackson" | "local"
  providerAccountId String // External user ID from the IdP (sub claim / NameID)
  
  email           String?  // Email from IdP (may differ from local user email)
  displayName     String?  // Name from IdP claims
  rawClaims       Json?    // Full claim set from last login (for debugging)
  
  lastLoginAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([provider, providerAccountId])
  @@index([userId])
}

// ============================================================
// MFA — Credential storage for all second factors
// ============================================================

model MfaDevice {
  id              String   @id @default(cuid())
  userId          String
  // user relation — match existing User model FK pattern
  
  type            String   // "totp" | "webauthn" | "email" | "sms"
  name            String   // User-friendly label: "My YubiKey", "Work Phone"
  status          String   @default("active") // "active" | "disabled" | "pending_setup"
  
  // --- TOTP fields ---
  totpSecret      String?  // Encrypted at rest — base32 encoded secret
  totpVerified    Boolean  @default(false) // Has user confirmed with a valid code?
  
  // --- WebAuthn fields ---
  webauthnCredentialId    String?  @unique
  webauthnPublicKey       Bytes?   // COSE public key
  webauthnCounter         BigInt   @default(0)
  webauthnTransports      String[] // ["usb", "ble", "nfc", "internal"]
  webauthnAaguid          String?  // Authenticator attestation GUID
  
  // --- Email/SMS fields ---
  contactValue    String?  // Email address or phone number (for email/sms types)
  
  lastUsedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([userId])
  @@index([userId, type])
}

model MfaChallenge {
  id              String   @id @default(cuid())
  userId          String
  
  type            String   // "totp" | "webauthn" | "email" | "sms"
  codeHash        String?  // bcrypt hash of the 6-digit code (email/sms)
  webauthnChallenge String? // base64url challenge for WebAuthn ceremony
  
  expiresAt       DateTime
  usedAt          DateTime?
  attempts        Int      @default(0)
  maxAttempts     Int      @default(5)
  
  createdAt       DateTime @default(now())
  
  @@index([userId])
  @@index([expiresAt])
}

// ============================================================
// Tenant Auth Settings — Per-tenant authentication policy
// ============================================================

model TenantAuthSettings {
  id              String   @id @default(cuid())
  tenantId        String   @unique
  // tenant relation
  
  // --- Auth methods allowed ---
  allowLocalAuth    Boolean @default(true)    // Email/password login
  allowOidcSso      Boolean @default(false)   // OIDC-based SSO
  allowSamlSso      Boolean @default(false)   // SAML-based SSO
  enforceSso        Boolean @default(false)   // If true, local auth disabled when SSO is configured
  
  // --- MFA policy ---
  mfaPolicy         String  @default("optional") // "disabled" | "optional" | "required"
  mfaGracePeriodDays Int    @default(7)          // Days before MFA enforcement after enablement
  allowedMfaTypes   String[] @default(["totp", "webauthn", "email", "sms"])
  
  // --- Session policy ---
  sessionMaxAgeMins   Int   @default(480)   // 8 hours
  sessionIdleTimeoutMins Int @default(60)   // 1 hour
  
  // --- Password policy (for local auth) ---
  passwordMinLength     Int  @default(12)
  passwordRequireUpper  Boolean @default(true)
  passwordRequireLower  Boolean @default(true)
  passwordRequireNumber Boolean @default(true)
  passwordRequireSymbol Boolean @default(true)
  passwordMaxAgeDays    Int  @default(90)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### Important Implementation Notes for This Phase

1. **Encryption at rest for secrets:** `oidcClientSecret` and `totpSecret` MUST be encrypted before storage. Create a utility at `lib/encryption.ts`:
   - Use `aes-256-gcm` via Node.js `crypto` module
   - Encryption key sourced from environment variable `AUTH_ENCRYPTION_KEY` (32-byte hex string)
   - Store as `iv:authTag:ciphertext` (all base64)
   - Provide `encrypt(plaintext)` and `decrypt(ciphertext)` functions

2. **Relations:** Connect the new models to your EXISTING `User` and `Tenant` models using the same relation patterns already in the schema. Do not rename or restructure existing models.

3. **Migration:** Create the migration with `pnpm prisma migrate dev --name add_enterprise_auth_models`

4. **Seed data:** Add to your seed script:
   - A default `TenantAuthSettings` row for each existing tenant (all defaults — local auth only)

### Acceptance Criteria
- [ ] `prisma migrate dev` succeeds without errors
- [ ] `prisma generate` produces updated client
- [ ] `lib/encryption.ts` created and tested with a simple unit test
- [ ] Existing application still functions identically (no regressions)
- [ ] Seed script updated

---

## Phase 2 — Auth.js (next-auth v5) Integration

**Goal:** Replace or wrap the existing auth system with Auth.js v5, preserving local email/password login.

### Tasks

#### 2.1 Install Dependencies

```bash
pnpm add next-auth@5 @auth/prisma-adapter @auth/core
```

#### 2.2 Create the Auth Configuration

Create `lib/auth/auth.config.ts`:

```typescript
// This is the central Auth.js configuration.
// It will be extended in later phases with OIDC and SAML providers.

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma"; // your existing Prisma client
import bcrypt from "bcrypt"; // or whatever your current hashing library is

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt", // Use JWT — needed for Credentials provider
    maxAge: 8 * 60 * 60, // 8 hours — will be overridden per-tenant later
  },
  pages: {
    signIn: "/login",        // Your existing login page
    error: "/login",         // Redirect auth errors to login
    // Do not set signOut — use default
  },
  providers: [
    CredentialsProvider({
      id: "local-credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantId: { label: "Tenant", type: "hidden" },
      },
      async authorize(credentials) {
        // 1. Validate inputs
        if (!credentials?.email || !credentials?.password) return null;

        // 2. Find user by email + tenant
        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email as string,
            tenantId: credentials.tenantId as string,
            // Add any existing active/status checks
          },
        });
        if (!user) return null;

        // 3. Check tenant allows local auth
        const authSettings = await prisma.tenantAuthSettings.findUnique({
          where: { tenantId: user.tenantId },
        });
        if (authSettings && !authSettings.allowLocalAuth) return null;

        // 4. Verify password (match your existing hashing approach)
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        // 5. Return user object (Auth.js will create the session)
        return {
          id: user.id,
          email: user.email,
          name: user.name, // adjust field names to match your User model
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // On initial sign-in, attach custom fields to the JWT
      if (user) {
        token.userId = user.id;
        token.tenantId = (user as any).tenantId;
        token.role = (user as any).role;
        token.authMethod = account?.provider || "local-credentials";
        token.mfaVerified = false; // Will be set true after MFA challenge
      }
      return token;
    },
    async session({ session, token }) {
      // Expose custom fields on the client session
      if (session.user) {
        session.user.id = token.userId as string;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).role = token.role;
        (session.user as any).authMethod = token.authMethod;
        (session.user as any).mfaVerified = token.mfaVerified;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      // Hook point for SSO — JIT provisioning will go here in Phase 3
      return true;
    },
  },
});
```

#### 2.3 Create the API Route

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth/auth.config";
export const { GET, POST } = handlers;
```

#### 2.4 Type Extensions

Create `types/next-auth.d.ts`:

```typescript
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    tenantId?: string;
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      tenantId: string;
      role: string;
      authMethod: string;
      mfaVerified: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    tenantId?: string;
    role?: string;
    authMethod?: string;
    mfaVerified?: boolean;
  }
}
```

#### 2.5 Update the Login Page

Modify the existing login page to use Auth.js `signIn()`:

- Import `signIn` from `next-auth/react`
- Replace the existing login form submission handler to call `signIn("local-credentials", { email, password, tenantId, redirect: false })`
- Handle the response: check `result.error` for auth failures, redirect on success
- Add a `<SessionProvider>` wrapper in your root layout if not already present

#### 2.6 Update Middleware / Route Protection

Create or update `middleware.ts` to use Auth.js:

```typescript
import { auth } from "@/lib/auth/auth.config";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLoginPage = req.nextUrl.pathname.startsWith("/login");
  const isPublicRoute = ["/", "/login", "/api/auth"].some(p =>
    req.nextUrl.pathname.startsWith(p)
  );

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn && isOnLoginPage) {
    return Response.redirect(new URL("/dashboard", req.nextUrl));
  }

  // MFA enforcement — will be activated in Phase 4
  // if (isLoggedIn && !req.auth.user.mfaVerified && requiresMfa(req)) {
  //   return Response.redirect(new URL("/mfa/challenge", req.nextUrl));
  // }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

#### 2.7 Migrate Existing Sessions

If users are currently logged in with the old session mechanism:
- Clear all existing sessions on deployment (force re-login)
- Add a note in release notes that users will need to log in again
- This is a one-time migration cost

### Acceptance Criteria
- [ ] Existing email/password login works through Auth.js
- [ ] JWT session contains `userId`, `tenantId`, `role`
- [ ] Protected routes redirect to `/login` when unauthenticated
- [ ] Login page shows errors for invalid credentials
- [ ] Logout works and clears the session
- [ ] No regressions in existing application functionality

---

## Phase 3 — OIDC SSO (Okta + Azure AD)

**Goal:** Add OIDC-based single sign-on for Okta and Azure AD (Entra ID).

### Tasks

#### 3.1 Install Dependencies

```bash
# No additional packages needed — Auth.js includes OIDC support natively
```

#### 3.2 Dynamic OIDC Provider

The challenge with multi-tenant SSO is that each tenant has different IdP settings. Auth.js providers are defined at config time, but we need them at runtime. Solution: use a **custom OIDC provider** that reads config from the database.

Create `lib/auth/providers/dynamic-oidc.ts`:

```typescript
import type { OIDCConfig } from "next-auth/providers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export function DynamicOIDCProvider(): OIDCConfig<any> {
  return {
    id: "enterprise-oidc",
    name: "Enterprise SSO (OIDC)",
    type: "oidc",

    // These will be overridden per-request, but Auth.js needs defaults
    clientId: "dynamic",
    clientSecret: "dynamic",
    issuer: "https://placeholder.example.com",

    authorization: {
      params: {
        scope: "openid email profile",
      },
    },

    // Dynamic configuration lookup
    async [Symbol.for("auth:options")](request: Request) {
      // Extract tenant + connection ID from the state or callback params
      const url = new URL(request.url);
      const connectionId = url.searchParams.get("connection_id");

      if (!connectionId) {
        throw new Error("Missing SSO connection identifier");
      }

      const connection = await prisma.ssoConnection.findUnique({
        where: { id: connectionId },
      });

      if (!connection || connection.protocol !== "oidc" || connection.status !== "active") {
        throw new Error("Invalid or inactive SSO connection");
      }

      return {
        clientId: connection.oidcClientId!,
        clientSecret: decrypt(connection.oidcClientSecret!),
        issuer: connection.oidcIssuerUrl!,
        wellKnown: connection.oidcDiscoveryUrl || undefined,
      };
    },

    profile(profile) {
      return {
        id: profile.sub,
        email: profile.email,
        name: profile.name || profile.preferred_username,
        image: profile.picture,
      };
    },
  };
}
```

> **Note to Claude Code:** The `Symbol.for("auth:options")` pattern above is pseudocode to illustrate the intent. The actual implementation will depend on which Auth.js v5 extension pattern works. The recommended approach is:
>
> **Option A (Recommended):** Instead of dynamic provider config, create a **custom OAuth handler** at `app/api/auth/sso/oidc/[connectionId]/route.ts` that:
> 1. Reads the `SsoConnection` from DB by `connectionId`
> 2. Constructs the OIDC authorization URL manually using the stored `oidcDiscoveryUrl`
> 3. Redirects the user to the IdP
> 4. Handles the callback, validates the ID token, and calls `signIn()` programmatically
>
> **Option B:** Use Auth.js's `providers` array with environment-variable-based config for a limited set of IdPs, and use the `signIn` callback to handle tenant routing.
>
> Choose whichever approach integrates most cleanly with the existing codebase. The critical requirement is that **each tenant's OIDC configuration is read from the `SsoConnection` table at runtime**, not hardcoded.

#### 3.3 JIT User Provisioning

Add to the Auth.js `signIn` callback in `auth.config.ts`:

```typescript
async signIn({ user, account, profile }) {
  if (account?.provider === "enterprise-oidc" || account?.provider === "saml-jackson") {
    // JIT provisioning for SSO users
    const email = user.email;
    if (!email) return false;

    // Determine tenant from the SSO connection
    const connectionId = account.providerAccountId; // or from state
    const connection = await prisma.ssoConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) return false;

    // Look for existing local user
    let localUser = await prisma.user.findFirst({
      where: { email, tenantId: connection.tenantId },
    });

    if (!localUser && connection.autoProvision) {
      // Create the local user
      localUser = await prisma.user.create({
        data: {
          email,
          name: user.name || email,
          tenantId: connection.tenantId,
          role: connection.defaultRole,
          passwordHash: "", // No password for SSO-only users
          // Set any other required fields with sensible defaults
        },
      });
    }

    if (!localUser) return false;

    // Upsert the federated identity link
    await prisma.federatedIdentity.upsert({
      where: {
        provider_providerAccountId: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      },
      update: {
        lastLoginAt: new Date(),
        rawClaims: profile as any,
        displayName: user.name,
      },
      create: {
        userId: localUser.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        email: user.email,
        displayName: user.name,
        lastLoginAt: new Date(),
        rawClaims: profile as any,
      },
    });

    // Override the Auth.js user object so the JWT has the LOCAL user ID
    user.id = localUser.id;
    (user as any).tenantId = localUser.tenantId;
    (user as any).role = localUser.role;

    return true;
  }

  return true; // Allow local credentials through
},
```

#### 3.4 SSO Login Flow on the Frontend

Update the login page to support SSO:

1. **Tenant detection:** When the user enters their email or lands on a tenant-specific subdomain:
   - Query `GET /api/auth/sso/discover?email=user@company.com` (or `?tenantId=xxx`)
   - This endpoint looks up `SsoConnection` records for the tenant
   - Returns available SSO options: `{ connections: [{ id, name, protocol }] }`

2. **SSO button rendering:** If SSO connections exist, show buttons like:
   - "Sign in with Corporate SSO (Okta)"
   - "Sign in with Azure AD"

3. **SSO initiation:** Clicking an SSO button calls:
   ```typescript
   signIn("enterprise-oidc", {
     callbackUrl: "/dashboard",
     connection_id: connection.id,
   });
   ```

4. **SSO Discovery API:** Create `app/api/auth/sso/discover/route.ts`:
   ```typescript
   export async function GET(req: Request) {
     const url = new URL(req.url);
     const email = url.searchParams.get("email");
     const tenantId = url.searchParams.get("tenantId");
     
     // Determine tenant from email domain or explicit tenantId
     let tenant;
     if (email) {
       const domain = email.split("@")[1];
       tenant = await prisma.tenant.findFirst({
         where: { domain }, // Assumes tenant has a domain field
       });
     } else if (tenantId) {
       tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
     }
     
     if (!tenant) return NextResponse.json({ connections: [] });
     
     const connections = await prisma.ssoConnection.findMany({
       where: { tenantId: tenant.id, status: "active" },
       select: { id: true, name: true, protocol: true },
     });
     
     const authSettings = await prisma.tenantAuthSettings.findUnique({
       where: { tenantId: tenant.id },
     });
     
     return NextResponse.json({
       connections,
       allowLocalAuth: authSettings?.allowLocalAuth ?? true,
       enforceSso: authSettings?.enforceSso ?? false,
     });
   }
   ```

#### 3.5 Azure AD (Entra ID) — Configuration Reference

When a tenant admin configures Azure AD OIDC, they will provide:

| Field | Example Value |
|-------|---------------|
| Client ID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| Client Secret | `~xxxxx` |
| Issuer URL | `https://login.microsoftonline.com/{azure-tenant-id}/v2.0` |
| Discovery URL | `https://login.microsoftonline.com/{azure-tenant-id}/v2.0/.well-known/openid-configuration` |

Required scopes: `openid email profile`

Azure AD App Registration requirements (document for tenant admins):
- Redirect URI: `https://{your-app-domain}/api/auth/callback/enterprise-oidc`
- Token configuration: Add `email` optional claim to ID token
- API permissions: `User.Read` (delegated)

#### 3.6 Okta — Configuration Reference

| Field | Example Value |
|-------|---------------|
| Client ID | `0oa1bcdef2GhIjKlM3n4` |
| Client Secret | `xxxxx` |
| Issuer URL | `https://{okta-domain}.okta.com/oauth2/default` |
| Discovery URL | `https://{okta-domain}.okta.com/oauth2/default/.well-known/openid-configuration` |

Okta App Integration requirements:
- Sign-in redirect URI: `https://{your-app-domain}/api/auth/callback/enterprise-oidc`
- Sign-out redirect URI: `https://{your-app-domain}`
- Assignments: Assign users/groups in Okta

### Acceptance Criteria
- [ ] OIDC SSO login works end-to-end with a test Okta developer account
- [ ] OIDC SSO login works end-to-end with a test Azure AD tenant
- [ ] JIT user provisioning creates local users on first SSO login
- [ ] Existing local login still works
- [ ] Login page dynamically shows SSO buttons based on tenant configuration
- [ ] SSO users are linked via `FederatedIdentity` table
- [ ] Tenant admin can configure SSO connections (admin UI or API endpoint)

---

## Phase 4 — SAML 2.0 SSO via SAML Jackson

**Goal:** Add SAML 2.0 support using BoxyHQ SAML Jackson as a SAML-to-OIDC bridge.

### Tasks

#### 4.1 Install SAML Jackson

```bash
pnpm add @boxyhq/saml-jackson
```

#### 4.2 Initialize SAML Jackson

Create `lib/auth/saml-jackson.ts`:

```typescript
import jackson, { type JacksonOption } from "@boxyhq/saml-jackson";

let jacksonInstance: Awaited<ReturnType<typeof jackson>> | null = null;

export async function getJacksonInstance() {
  if (jacksonInstance) return jacksonInstance;

  const opts: JacksonOption = {
    externalUrl: process.env.NEXTAUTH_URL!, // Your app's public URL
    samlPath: "/api/auth/saml/acs",         // ACS endpoint
    samlAudience: process.env.SAML_AUDIENCE || "https://saml.your-app.com",
    db: {
      engine: "sql",
      type: "postgres",
      url: process.env.DATABASE_URL!,
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY!,
    },
    idpEnabled: true,
  };

  jacksonInstance = await jackson(opts);
  return jacksonInstance;
}
```

#### 4.3 Create SAML API Routes

**ACS (Assertion Consumer Service)** — `app/api/auth/saml/acs/route.ts`:

```typescript
import { getJacksonInstance } from "@/lib/auth/saml-jackson";

export async function POST(req: Request) {
  const { oauthController } = await getJacksonInstance();
  const formData = await req.formData();
  const samlResponse = formData.get("SAMLResponse") as string;
  const relayState = formData.get("RelayState") as string;

  // SAML Jackson converts the SAML assertion into an OAuth-like redirect
  const result = await oauthController.samlResponse({
    SAMLResponse: samlResponse,
    RelayState: relayState,
  });

  // Redirect to the OAuth callback with the authorization code
  return Response.redirect(result.redirect_url);
}
```

**SAML Connection Management API** — `app/api/admin/sso/saml/route.ts`:

```typescript
// POST — Create a new SAML connection
// GET — List SAML connections for a tenant
// DELETE — Remove a SAML connection

import { getJacksonInstance } from "@/lib/auth/saml-jackson";

export async function POST(req: Request) {
  const { connectionAPIController } = await getJacksonInstance();
  const body = await req.json();

  // Validate that the requesting user is a tenant admin
  // ...auth check...

  const connection = await connectionAPIController.createSAMLConnection({
    tenant: body.tenantId,
    product: "meridian-itsm", // Your product identifier
    rawMetadata: body.samlMetadataRaw,
    metadataUrl: body.samlMetadataUrl,
    defaultRedirectUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback/saml-jackson`,
    redirectUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback/saml-jackson`,
    name: body.name,
  });

  // Also store in SsoConnection table for the UI
  await prisma.ssoConnection.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      protocol: "saml",
      samlMetadataUrl: body.samlMetadataUrl,
      samlMetadataRaw: body.samlMetadataRaw,
      samlEntityId: connection.idpMetadata?.entityID,
      // ...
    },
  });

  return NextResponse.json(connection);
}
```

#### 4.4 Add SAML Jackson as an Auth.js Provider

In `auth.config.ts`, add a custom OAuth provider that talks to SAML Jackson's built-in OAuth endpoints:

```typescript
{
  id: "saml-jackson",
  name: "Enterprise SSO (SAML)",
  type: "oauth",
  authorization: {
    url: `${process.env.NEXTAUTH_URL}/api/auth/saml/authorize`,
    params: {
      scope: "openid email profile",
    },
  },
  token: `${process.env.NEXTAUTH_URL}/api/oauth/token`,
  userinfo: `${process.env.NEXTAUTH_URL}/api/oauth/userinfo`,
  clientId: "dummy", // SAML Jackson uses tenant+product for identification
  clientSecret: "dummy",
  profile(profile) {
    return {
      id: profile.id || profile.sub,
      email: profile.email,
      name: profile.firstName
        ? `${profile.firstName} ${profile.lastName}`
        : profile.email,
    };
  },
}
```

#### 4.5 SAML Metadata Endpoint

Create `app/api/auth/saml/metadata/route.ts` — serves your SP metadata XML for tenant admins to import into their IdP:

```typescript
import { getJacksonInstance } from "@/lib/auth/saml-jackson";

export async function GET() {
  const { spConfig } = await getJacksonInstance();
  const metadata = await spConfig.get();

  return new Response(metadata.metadata, {
    headers: { "Content-Type": "application/xml" },
  });
}
```

#### 4.6 Testing SAML

- **Okta SAML:** Create a "SAML 2.0" app integration in Okta developer console. Set the SSO URL to your ACS endpoint, Audience URI to your SAML audience, and attribute mappings for email/name.
- **Azure AD SAML:** Create an Enterprise Application > "Non-gallery application" > configure SAML SSO. Set Entity ID and Reply URL to match your SP metadata.
- **Mock IdP for dev:** Use `https://samltest.id` or `https://mocksaml.com` for local testing without a real IdP.

### Acceptance Criteria
- [ ] SAML Jackson initializes and creates its tables in PostgreSQL
- [ ] Tenant admin can upload SAML metadata (URL or raw XML)
- [ ] SP metadata endpoint returns valid XML
- [ ] SAML SSO login works end-to-end with a test Okta SAML app
- [ ] SAML SSO login works end-to-end with a test Azure AD SAML app
- [ ] JIT provisioning works for SAML users (reuses Phase 3 logic)
- [ ] Login page shows SAML SSO buttons for configured tenants

---

## Phase 5 — Multi-Factor Authentication

**Goal:** Implement MFA with TOTP, WebAuthn/Passkeys, Email codes, and SMS codes.

### Tasks

#### 5.1 Install Dependencies

```bash
pnpm add otpauth qrcode @simplewebauthn/server @simplewebauthn/browser twilio
pnpm add -D @types/qrcode @simplewebauthn/types
```

#### 5.2 MFA Middleware / Enforcement

The MFA flow inserts between successful primary authentication and full access:

1. User authenticates (local or SSO) → Auth.js issues JWT with `mfaVerified: false`
2. Middleware checks: does this user/tenant require MFA?
3. If MFA required and `mfaVerified === false` → redirect to `/mfa/challenge`
4. User completes MFA → API updates JWT to set `mfaVerified: true`
5. User proceeds to the application

Create `lib/auth/mfa/enforcement.ts`:

```typescript
import { prisma } from "@/lib/prisma";

export async function requiresMfa(userId: string, tenantId: string, authMethod: string): Promise<boolean> {
  const authSettings = await prisma.tenantAuthSettings.findUnique({
    where: { tenantId },
  });

  if (!authSettings || authSettings.mfaPolicy === "disabled") return false;

  // If SSO and tenant doesn't force MFA after SSO, skip
  if (authMethod !== "local-credentials" && !authSettings.mfaPolicy) {
    const ssoConnection = await prisma.ssoConnection.findFirst({
      where: { tenantId, status: "active" },
    });
    if (ssoConnection && !ssoConnection.forceMfa) return false;
  }

  if (authSettings.mfaPolicy === "required") {
    // Check if user has at least one active MFA device
    const deviceCount = await prisma.mfaDevice.count({
      where: { userId, status: "active" },
    });
    return true; // Always require, even if no devices (will prompt enrollment)
  }

  if (authSettings.mfaPolicy === "optional") {
    // Only enforce if user has opted in (has active devices)
    const deviceCount = await prisma.mfaDevice.count({
      where: { userId, status: "active" },
    });
    return deviceCount > 0;
  }

  return false;
}
```

Update the middleware.ts (from Phase 2) to activate the MFA redirect:

```typescript
// In the auth middleware, after checking isLoggedIn:
if (isLoggedIn && !(req.auth as any)?.user?.mfaVerified) {
  const mfaRequired = await requiresMfa(
    req.auth!.user!.id,
    (req.auth as any).user.tenantId,
    (req.auth as any).user.authMethod
  );
  
  if (mfaRequired && !req.nextUrl.pathname.startsWith("/mfa")) {
    return Response.redirect(new URL("/mfa/challenge", req.nextUrl));
  }
}
```

#### 5.3 TOTP Implementation

Create `lib/auth/mfa/totp.ts`:

```typescript
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { encrypt, decrypt } from "@/lib/encryption";

const APP_NAME = "MeridianITSM";

export function generateTotpSecret(): { secret: string; encryptedSecret: string } {
  const secret = new Secret({ size: 20 });
  return {
    secret: secret.base32,
    encryptedSecret: encrypt(secret.base32),
  };
}

export async function generateTotpQrCode(email: string, secret: string): Promise<string> {
  const totp = new TOTP({
    issuer: APP_NAME,
    label: email,
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  return QRCode.toDataURL(totp.toString());
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const secret = decrypt(encryptedSecret);
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  // Allow 1 window of drift (±30 seconds)
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}
```

#### 5.4 WebAuthn Implementation

Create `lib/auth/mfa/webauthn.ts`:

```typescript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";

const RP_NAME = "MeridianITSM";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"; // Your domain
const ORIGIN = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function generateWebAuthnRegistration(userId: string, userEmail: string, existingCredentials: { id: string; transports?: string[] }[]) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    attestationType: "none", // Don't require attestation — maximizes compatibility
    excludeCredentials: existingCredentials.map(c => ({
      id: c.id,
      transports: c.transports as any,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function verifyWebAuthnRegistration(response: RegistrationResponseJSON, expectedChallenge: string) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
}

export async function generateWebAuthnAuthentication(allowCredentials: { id: string; transports?: string[] }[]) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: allowCredentials.map(c => ({
      id: c.id,
      transports: c.transports as any,
    })),
    userVerification: "preferred",
  });
}

export async function verifyWebAuthnAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credentialPublicKey: Uint8Array,
  credentialCounter: bigint
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: response.id,
      publicKey: credentialPublicKey,
      counter: Number(credentialCounter),
    },
  });
}
```

#### 5.5 Email & SMS Code Implementation

Create `lib/auth/mfa/codes.ts`:

```typescript
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export function generateCode(): string {
  // Cryptographically secure 6-digit code
  return crypto.randomInt(100000, 999999).toString();
}

export async function createChallenge(
  userId: string,
  type: "email" | "sms",
  code: string
): Promise<string> {
  const codeHash = await bcrypt.hash(code, 10);
  const challenge = await prisma.mfaChallenge.create({
    data: {
      userId,
      type,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      maxAttempts: 5,
    },
  });
  return challenge.id;
}

export async function verifyChallenge(challengeId: string, code: string): Promise<boolean> {
  const challenge = await prisma.mfaChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) return false;
  if (challenge.usedAt) return false;
  if (challenge.expiresAt < new Date()) return false;
  if (challenge.attempts >= challenge.maxAttempts) return false;

  // Increment attempts
  await prisma.mfaChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
  });

  const valid = await bcrypt.compare(code, challenge.codeHash!);

  if (valid) {
    await prisma.mfaChallenge.update({
      where: { id: challengeId },
      data: { usedAt: new Date() },
    });
  }

  return valid;
}
```

**Email delivery:** Integrate with your existing email sending infrastructure. If none exists, use `nodemailer` or an API-based service (SendGrid, Resend, etc.).

**SMS delivery:** Create `lib/auth/mfa/sms.ts`:

```typescript
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSmsCode(phoneNumber: string, code: string): Promise<void> {
  await client.messages.create({
    body: `Your MeridianITSM verification code is: ${code}. It expires in 10 minutes.`,
    to: phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
  });
}
```

#### 5.6 MFA API Routes

Create the following API routes:

**`app/api/mfa/enroll/route.ts`** — Initiate MFA device enrollment
- `POST { type: "totp" }` → Returns TOTP secret + QR code data URL
- `POST { type: "webauthn" }` → Returns WebAuthn registration options
- `POST { type: "email", contactValue: "user@..." }` → Sends verification code to email
- `POST { type: "sms", contactValue: "+1..." }` → Sends verification code to phone

**`app/api/mfa/enroll/verify/route.ts`** — Confirm enrollment with first valid code
- `POST { deviceId, code }` (TOTP/email/sms)
- `POST { deviceId, response }` (WebAuthn registration response)
- On success: sets `MfaDevice.status = "active"` (and `totpVerified = true` for TOTP)

**`app/api/mfa/challenge/route.ts`** — Generate an MFA challenge for login
- `GET` → Returns available MFA methods for the current user
- `POST { type: "email" | "sms" }` → Sends a code and returns `{ challengeId }`
- `POST { type: "webauthn" }` → Returns WebAuthn authentication options
- (TOTP doesn't need a challenge step — user just enters the code)

**`app/api/mfa/verify/route.ts`** — Verify an MFA challenge during login
- `POST { type: "totp", code: "123456" }`
- `POST { type: "webauthn", response: {...} }`
- `POST { type: "email" | "sms", challengeId, code: "123456" }`
- On success: update the JWT to set `mfaVerified: true`

**`app/api/mfa/devices/route.ts`** — Manage enrolled devices
- `GET` → List user's MFA devices
- `DELETE { deviceId }` → Remove a device (require re-authentication)

#### 5.7 MFA Frontend Pages

**`app/mfa/challenge/page.tsx`** — MFA verification during login:
- Shows the user's enrolled MFA methods
- TOTP: 6-digit code input with auto-submit on 6th digit
- WebAuthn: "Use your security key/passkey" button → triggers browser ceremony
- Email: "Send code to m***@email.com" button → code input
- SMS: "Send code to +1***1234" button → code input
- "Try another method" link to switch between enrolled methods
- Rate limiting display (X attempts remaining)

**`app/settings/security/page.tsx`** — MFA enrollment & management (in user settings):
- List enrolled MFA devices with type, name, last used date
- "Add authenticator app" → QR code + manual entry key + verification step
- "Add security key/passkey" → WebAuthn registration flow
- "Add email verification" → enter/confirm email → verification code
- "Add SMS verification" → enter/confirm phone → verification code
- "Remove" button per device (with confirmation dialog)
- "Rename" device label
- Recovery codes section (see Phase 5.8)

#### 5.8 Recovery Codes

Generate 10 single-use recovery codes when the user first enables MFA. Store them hashed.

Create `lib/auth/mfa/recovery.ts`:

```typescript
import crypto from "crypto";
import bcrypt from "bcrypt";

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase() // 8-char hex codes
  );
}

// Store codes as bcrypt hashes in a RecoveryCode model (add to schema)
// On use: mark as used, don't delete (audit trail)
```

Add a `RecoveryCode` model to the Prisma schema:

```prisma
model RecoveryCode {
  id        String   @id @default(cuid())
  userId    String
  codeHash  String
  usedAt    DateTime?
  createdAt DateTime @default(now())
  
  @@index([userId])
}
```

### Acceptance Criteria
- [ ] TOTP enrollment: QR code displayed, user scans with authenticator app, confirms with code
- [ ] TOTP verification: 6-digit code accepted during login MFA challenge
- [ ] WebAuthn enrollment: browser security key/passkey ceremony completes
- [ ] WebAuthn verification: security key/passkey challenge completes during login
- [ ] Email code: code sent to email, verified within 10 minutes
- [ ] SMS code: code sent via Twilio, verified within 10 minutes
- [ ] MFA enforcement: middleware redirects to challenge page when required
- [ ] Recovery codes: generated on MFA enrollment, accepted as fallback
- [ ] Device management: list, add, remove, rename MFA devices
- [ ] Rate limiting: max 5 attempts per challenge, lockout messaging
- [ ] Tenant policy respected: "disabled", "optional", "required" all work correctly

---

## Phase 6 — Admin UI for SSO & Auth Configuration

**Goal:** Build admin pages for tenant administrators to configure SSO and auth policies.

### Pages to Build

#### 6.1 SSO Configuration Page (`app/admin/settings/sso/page.tsx`)

- **List SSO connections** for the current tenant — table with: name, protocol (OIDC/SAML), status, created date, actions
- **Add OIDC connection** form:
  - Display name
  - Client ID
  - Client Secret (masked input)
  - Issuer URL
  - Discovery URL (auto-populated from issuer if possible)
  - "Test Connection" button — initiates a test OAuth flow
- **Add SAML connection** form:
  - Display name
  - Metadata upload (file or URL)
  - Shows parsed IdP details after upload (entity ID, SSO URL, certificate expiry)
  - "Download SP Metadata" link — for tenant admin to import into their IdP
- **Edit/Disable/Delete** connections
- **Connection status badges:** Active (green), Disabled (yellow), Pending Setup (orange)

#### 6.2 Authentication Policy Page (`app/admin/settings/auth/page.tsx`)

- **Auth methods** toggle: Local auth, OIDC SSO, SAML SSO
- **Enforce SSO** toggle — when on, local auth is hidden for non-admin users
- **MFA policy** selector: Disabled / Optional / Required
- **Allowed MFA types** checkboxes: TOTP, WebAuthn, Email, SMS
- **MFA grace period** — days before enforcement kicks in after enabling "required"
- **Session settings:** max age, idle timeout
- **Password policy** (when local auth is enabled): min length, complexity requirements, max age

#### 6.3 User Federation View (`app/admin/users/[id]/federation/page.tsx`)

- Show which IdP identities are linked to a user
- Show last SSO login timestamp
- Allow admin to unlink a federated identity
- Show MFA enrollment status and enrolled device types

### Acceptance Criteria
- [ ] Tenant admin can configure OIDC connection through the UI
- [ ] Tenant admin can configure SAML connection through the UI (metadata upload)
- [ ] SP metadata is downloadable
- [ ] Auth policy changes take effect immediately
- [ ] MFA policy enforcement respects grace period
- [ ] UI is role-protected — only tenant admins can access

---

## Phase 7 — Hardening & Production Readiness

**Goal:** Security hardening, logging, and operational readiness.

### Tasks

#### 7.1 Security

- [ ] **CSRF protection:** Auth.js handles this for its routes; verify custom API routes are protected
- [ ] **Rate limiting:** Apply to login, MFA challenge, and MFA verify endpoints (e.g., `rate-limiter-flexible` or Vercel/Next.js built-in)
- [ ] **Brute force protection:** Lock accounts after 10 failed login attempts (15-minute lockout); separate counter for MFA
- [ ] **Session fixation:** Auth.js handles token rotation; verify `jwt` callback rotates on re-auth
- [ ] **Secret rotation:** Document process for rotating `AUTH_ENCRYPTION_KEY` (requires re-encrypting all stored secrets)
- [ ] **SAML signature validation:** SAML Jackson handles this; verify certificate pinning is enabled
- [ ] **OIDC token validation:** Verify `nonce`, `iss`, `aud`, `exp` claims are checked (Auth.js does this by default)
- [ ] **Input validation:** Validate all SSO configuration inputs (URLs, metadata XML) before storage
- [ ] **XSS prevention:** Sanitize any IdP-sourced display names or claims before rendering

#### 7.2 Logging & Audit

- [ ] **Auth events audit log:** Log all authentication events to a dedicated table:
  - Login success/failure (local, OIDC, SAML)
  - MFA challenge success/failure
  - MFA device enrollment/removal
  - SSO connection created/modified/deleted
  - Auth policy changes
  - Password changes/resets
- [ ] **Structured logging:** Include `tenantId`, `userId`, `authMethod`, `ipAddress`, `userAgent` in all auth log entries
- [ ] **Failed login alerting:** After N failures, log at WARN level for monitoring pickup

#### 7.3 Testing

- [ ] **Unit tests:** TOTP generation/verification, code generation/verification, encryption utils
- [ ] **Integration tests:** Auth.js callback chain, JIT provisioning logic, MFA enforcement middleware
- [ ] **E2E tests:** Full login flows for local, OIDC, SAML, each MFA type
- [ ] **Mock IdPs for CI:** Use `mocksaml.com` or fixture-based SAML responses for automated testing

#### 7.4 Documentation

- [ ] **Tenant admin guide:** How to configure Okta OIDC, Okta SAML, Azure AD OIDC, Azure AD SAML — step-by-step with screenshots
- [ ] **User guide:** How to set up MFA, manage security keys, use recovery codes
- [ ] **API documentation:** All new auth endpoints documented with request/response examples
- [ ] **Runbook:** Operational procedures for key rotation, tenant SSO debugging, account lockout resolution

---

## Environment Variables Reference

Add these to `.env` (and `.env.example`):

```bash
# ============================================================
# Auth.js
# ============================================================
NEXTAUTH_URL=https://your-app.example.com
NEXTAUTH_SECRET=<generate-with: openssl rand -base64 32>

# ============================================================
# Encryption (for OIDC client secrets, TOTP secrets)
# ============================================================
AUTH_ENCRYPTION_KEY=<generate-with: openssl rand -hex 32>

# ============================================================
# SAML Jackson
# ============================================================
SAML_AUDIENCE=https://saml.your-app.example.com

# ============================================================
# WebAuthn
# ============================================================
WEBAUTHN_RP_ID=your-app.example.com

# ============================================================
# Twilio (SMS MFA)
# ============================================================
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# ============================================================
# Email (for email MFA codes — use your existing email config)
# ============================================================
# If not already configured, add SMTP or API-based email settings
```

---

## Dependency Summary

```bash
# Auth framework
pnpm add next-auth@5 @auth/prisma-adapter @auth/core

# SAML
pnpm add @boxyhq/saml-jackson

# MFA - TOTP
pnpm add otpauth qrcode
pnpm add -D @types/qrcode

# MFA - WebAuthn
pnpm add @simplewebauthn/server @simplewebauthn/browser
pnpm add -D @simplewebauthn/types

# MFA - SMS
pnpm add twilio

# Security
pnpm add rate-limiter-flexible
```

---

## Build Order for Claude Code

Execute phases in this exact order. Do not proceed to the next phase until the current phase compiles and its acceptance criteria are met.

1. **Phase 0** — Assessment (read-only, no code changes)
2. **Phase 1** — Schema + encryption utilities
3. **Phase 2** — Auth.js integration (local auth migration)
4. **Phase 3** — OIDC SSO
5. **Phase 4** — SAML SSO
6. **Phase 5** — MFA (all four factors + recovery codes)
7. **Phase 6** — Admin UI
8. **Phase 7** — Hardening

Each phase should be a logical git commit (or series of commits). Use conventional commit messages: `feat(auth): add OIDC SSO support`, `feat(mfa): implement TOTP enrollment`, etc.
