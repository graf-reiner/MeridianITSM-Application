# OAuth2 Email Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Workspace/Gmail and Microsoft 365/Outlook as OAuth2 email account providers alongside existing manual SMTP/IMAP.

**Architecture:** Extend the existing EmailAccount model with OAuth2 fields. New API endpoints handle the OAuth authorization flow (authorize URL + callback). The worker refreshes tokens before each SMTP/IMAP connection. Frontend adds a provider selection step and popup-based OAuth flow.

**Tech Stack:** Prisma 6, Fastify, Next.js 16, BullMQ, nodemailer (xoauth2), imapflow (xoauth2), google-auth-library, AES-256-GCM encryption

**Spec:** `docs/superpowers/specs/2026-03-31-oauth-email-accounts-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/core/src/utils/oauth.ts` | OAuth2 token exchange, refresh, provider configs (Google + Microsoft) |
| `apps/api/src/routes/v1/email-accounts/oauth.ts` | `/authorize` and `/callback` endpoints |
| `packages/db/prisma/migrations/YYYYMMDD_add_oauth_fields/migration.sql` | Schema migration (auto-generated) |

### Modified Files
| File | Changes |
|------|---------|
| `packages/db/prisma/schema.prisma` | Add OAuth2 fields to EmailAccount model |
| `packages/core/src/index.ts` | Export new OAuth utilities |
| `apps/api/src/routes/v1/email-accounts/index.ts` | Register OAuth routes, update GET/PATCH for OAuth fields |
| `apps/worker/src/services/email-inbound.service.ts` | Branch guard clause on authProvider, use xoauth2 for OAuth accounts |
| `apps/worker/src/workers/email-notification.ts` | Branch auth on authProvider, use xoauth2 for OAuth accounts |
| `apps/web/src/app/dashboard/settings/email/page.tsx` | Provider selection modal, OAuth popup flow, updated account list |

---

## Task 1: Database Schema — Add OAuth2 Fields

**Files:**
- Modify: `packages/db/prisma/schema.prisma:840-872`

- [ ] **Step 1: Add OAuth2 fields to EmailAccount model**

In `packages/db/prisma/schema.prisma`, add these fields inside the `EmailAccount` model block, after `lastProcessedUid`:

```prisma
  // OAuth2
  authProvider          String    @default("MANUAL")  // MANUAL, GOOGLE, MICROSOFT
  oauthAccessTokenEnc   String?
  oauthRefreshTokenEnc  String?
  oauthTokenExpiresAt   DateTime?
  oauthScope            String?
  oauthConnectionStatus String?   // CONNECTED, DISCONNECTED, REFRESH_FAILED
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd apps/web
pnpm prisma migrate dev --name add_oauth_email_fields
```

Expected: Migration created and applied. New columns added to `email_accounts` table.

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add OAuth2 fields to EmailAccount model"
```

---

## Task 2: OAuth2 Utility Module in @meridian/core

**Files:**
- Create: `packages/core/src/utils/oauth.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create OAuth utility module**

Create `packages/core/src/utils/oauth.ts`:

```typescript
import { encrypt, decrypt } from './encryption.js';

// ─── Provider Configurations ────────────────────────────────────────────────

export interface OAuthProviderConfig {
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  GOOGLE: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['https://mail.google.com/', 'openid', 'email', 'profile'],
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
  },
  MICROSOFT: {
    authorizationUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: [
      'https://outlook.office365.com/IMAP.AccessAsUser.All',
      'https://outlook.office365.com/SMTP.Send',
      'offline_access', 'openid', 'email', 'profile',
    ],
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
  },
};

// ─── State Token (CSRF protection) ──────────────────────────────────────────

interface OAuthState {
  tenantId: string;
  userId: string;
  provider: string;
  nonce: string;
  timestamp: number;
}

export function createOAuthState(tenantId: string, userId: string, provider: string): string {
  const state: OAuthState = {
    tenantId,
    userId,
    provider,
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  return encrypt(JSON.stringify(state));
}

export function validateOAuthState(encryptedState: string): OAuthState {
  const state: OAuthState = JSON.parse(decrypt(encryptedState));
  const ageMs = Date.now() - state.timestamp;
  if (ageMs > 10 * 60 * 1000) {
    throw new Error('OAuth state expired (>10 minutes)');
  }
  if (!state.tenantId || !state.userId || !state.provider || !state.nonce) {
    throw new Error('Invalid OAuth state');
  }
  return state;
}

// ─── Authorization URL ──────────────────────────────────────────────────────

export function buildAuthorizationUrl(
  provider: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline',  // Google: ensures refresh token
    prompt: 'consent',       // Force consent to get refresh token
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

// ─── Token Exchange ─────────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export async function exchangeCodeForTokens(
  provider: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  if (!data.refresh_token) {
    throw new Error('No refresh token returned — ensure prompt=consent and access_type=offline');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? '',
  };
}

// ─── Token Refresh ──────────────────────────────────────────────────────────

export async function refreshAccessToken(
  provider: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${err}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

// ─── User Info ──────────────────────────────────────────────────────────────

export interface OAuthUserInfo {
  email: string;
  name: string;
}

export async function fetchUserInfo(provider: string, accessToken: string): Promise<OAuthUserInfo> {
  const config = OAUTH_PROVIDERS[provider];
  if (!config) throw new Error(`Unknown OAuth provider: ${provider}`);

  const res = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user info (${res.status})`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (provider === 'MICROSOFT') {
    return {
      email: (data.mail ?? data.userPrincipalName ?? '') as string,
      name: (data.displayName ?? '') as string,
    };
  }

  // Google
  return {
    email: (data.email ?? '') as string,
    name: (data.name ?? '') as string,
  };
}

// ─── Get Fresh Access Token (with auto-refresh) ─────────────────────────────

/**
 * Returns a fresh access token for an OAuth email account.
 * Refreshes if expired or within 5-minute buffer.
 * Caller must handle updating the DB with new tokens.
 */
export async function getFreshAccessToken(
  provider: string,
  encryptedAccessToken: string,
  encryptedRefreshToken: string,
  expiresAt: Date | null,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshed: boolean; newExpiresAt?: Date }> {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  const isExpired = !expiresAt || (expiresAt.getTime() - Date.now()) < bufferMs;

  if (!isExpired) {
    return { accessToken: decrypt(encryptedAccessToken), refreshed: false };
  }

  const refreshToken = decrypt(encryptedRefreshToken);
  const result = await refreshAccessToken(provider, refreshToken, clientId, clientSecret);

  return {
    accessToken: result.accessToken,
    refreshed: true,
    newExpiresAt: result.expiresAt,
  };
}
```

- [ ] **Step 2: Export from core index**

Add to `packages/core/src/index.ts`:

```typescript
export {
  OAUTH_PROVIDERS,
  createOAuthState,
  validateOAuthState,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserInfo,
  getFreshAccessToken,
  type OAuthProviderConfig,
  type OAuthTokens,
  type OAuthUserInfo,
} from './utils/oauth.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/utils/oauth.ts packages/core/src/index.ts
git commit -m "feat(core): add OAuth2 utility module for Google + Microsoft"
```

---

## Task 3: API — OAuth Authorization and Callback Endpoints

**Files:**
- Create: `apps/api/src/routes/v1/email-accounts/oauth.ts`
- Modify: `apps/api/src/routes/v1/email-accounts/index.ts`

- [ ] **Step 1: Create OAuth routes file**

Create `apps/api/src/routes/v1/email-accounts/oauth.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import {
  encrypt,
  createOAuthState,
  validateOAuthState,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  OAUTH_PROVIDERS,
} from '@meridian/core';
import { requirePermission } from '../../../plugins/rbac.js';

function getOAuthCredentials(provider: string): { clientId: string; clientSecret: string } {
  if (provider === 'GOOGLE') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
    return { clientId, clientSecret };
  }
  if (provider === 'MICROSOFT') {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are required');
    return { clientId, clientSecret };
  }
  throw new Error(`Unknown provider: ${provider}`);
}

function getRedirectUri(request: { protocol: string; hostname: string }): string {
  const baseUrl = process.env.APP_URL ?? `${request.protocol}://${request.hostname}`;
  return `${baseUrl}/api/v1/email-accounts/oauth/callback`;
}

function callbackHtml(message: Record<string, unknown>, targetOrigin: string): string {
  return `<!DOCTYPE html><html><head><title>Connecting...</title></head><body>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify(message)}, ${JSON.stringify(targetOrigin)});
  }
  window.close();
</script>
<p>You can close this window.</p>
</body></html>`;
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/email-accounts/oauth/authorize
  app.get(
    '/api/v1/email-accounts/oauth/authorize',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string; userId: string };
      const query = request.query as { provider?: string };
      const provider = (query.provider ?? '').toUpperCase();

      if (!OAUTH_PROVIDERS[provider]) {
        return reply.status(400).send({ error: 'Invalid provider. Use "google" or "microsoft".' });
      }

      const { clientId } = getOAuthCredentials(provider);
      const redirectUri = getRedirectUri(request);
      const state = createOAuthState(user.tenantId, user.userId, provider);
      const url = buildAuthorizationUrl(provider, clientId, redirectUri, state);

      return reply.send({ url, state });
    },
  );

  // GET /api/v1/email-accounts/oauth/callback
  // Returns HTML — this is the OAuth redirect target
  app.get(
    '/api/v1/email-accounts/oauth/callback',
    async (request, reply) => {
      const query = request.query as { code?: string; state?: string; error?: string };
      const targetOrigin = process.env.APP_URL ?? 'https://meridian.cybordyne.net';

      if (query.error) {
        return reply.type('text/html').send(
          callbackHtml({ type: 'oauth-error', error: query.error }, targetOrigin),
        );
      }

      if (!query.code || !query.state) {
        return reply.type('text/html').send(
          callbackHtml({ type: 'oauth-error', error: 'Missing code or state parameter' }, targetOrigin),
        );
      }

      try {
        const state = validateOAuthState(query.state);
        const { clientId, clientSecret } = getOAuthCredentials(state.provider);
        const redirectUri = getRedirectUri(request);

        const tokens = await exchangeCodeForTokens(
          state.provider, query.code, clientId, clientSecret, redirectUri,
        );

        const userInfo = await fetchUserInfo(state.provider, tokens.accessToken);
        if (!userInfo.email) {
          throw new Error('Could not determine email address from OAuth profile');
        }

        const providerConfig = OAUTH_PROVIDERS[state.provider];

        const account = await prisma.emailAccount.create({
          data: {
            tenantId: state.tenantId,
            name: userInfo.name || userInfo.email.split('@')[0],
            emailAddress: userInfo.email,
            authProvider: state.provider,
            // Auto-populate SMTP/IMAP defaults for the provider
            smtpHost: providerConfig.smtpHost,
            smtpPort: providerConfig.smtpPort,
            smtpUser: userInfo.email,
            smtpSecure: false, // STARTTLS for both Google and Microsoft on port 587
            imapHost: providerConfig.imapHost,
            imapPort: providerConfig.imapPort,
            imapUser: userInfo.email,
            imapSecure: true,
            // OAuth tokens (encrypted)
            oauthAccessTokenEnc: encrypt(tokens.accessToken),
            oauthRefreshTokenEnc: encrypt(tokens.refreshToken),
            oauthTokenExpiresAt: tokens.expiresAt,
            oauthScope: tokens.scope,
            oauthConnectionStatus: 'CONNECTED',
            // Defaults
            pollInterval: 5,
            isActive: true,
            emailToTicket: true,
          },
        });

        return reply.type('text/html').send(
          callbackHtml({
            type: 'oauth-success',
            account: { id: account.id, name: account.name, email: account.emailAddress },
          }, targetOrigin),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth callback failed';
        console.error('[oauth-callback]', message);
        return reply.type('text/html').send(
          callbackHtml({ type: 'oauth-error', error: message }, targetOrigin),
        );
      }
    },
  );
}
```

- [ ] **Step 2: Register OAuth routes in email-accounts index**

In `apps/api/src/routes/v1/email-accounts/index.ts`, add at the top:

```typescript
import { oauthRoutes } from './oauth.js';
```

At the end of `emailAccountRoutes` function (before the closing `}`), add:

```typescript
  // Register OAuth sub-routes
  await oauthRoutes(fastify);
```

- [ ] **Step 3: Update GET /api/v1/email-accounts to include OAuth fields**

In `apps/api/src/routes/v1/email-accounts/index.ts`, in the GET handler (around line 32), update the sanitized response to include OAuth fields:

```typescript
const sanitized = accounts.map(({ smtpPasswordEnc, imapPasswordEnc, oauthAccessTokenEnc, oauthRefreshTokenEnc, ...rest }) => ({
  ...rest,
  hasSmtpPassword: smtpPasswordEnc !== null && smtpPasswordEnc !== '',
  hasImapPassword: imapPasswordEnc !== null && imapPasswordEnc !== '',
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/v1/email-accounts/oauth.ts apps/api/src/routes/v1/email-accounts/index.ts
git commit -m "feat(api): add OAuth2 authorize and callback endpoints for email accounts"
```

---

## Task 4: Worker — OAuth Token Refresh and xoauth2 Auth

**Files:**
- Modify: `apps/worker/src/services/email-inbound.service.ts:155-170`
- Modify: `apps/worker/src/workers/email-notification.ts:92-119`

- [ ] **Step 1: Update email-inbound.service.ts — pollMailbox guard and auth**

In `apps/worker/src/services/email-inbound.service.ts`, add import at the top:

```typescript
import { getFreshAccessToken, encrypt } from '@meridian/core';
```

Replace the guard clause and connection setup (lines 155-169) with:

```typescript
export async function pollMailbox(account: EmailAccount): Promise<{ newTickets: number; comments: number }> {
  if (!account.imapHost) {
    console.warn(`[email-inbound] Account ${account.id} missing IMAP host, skipping`);
    return { newTickets: 0, comments: 0 };
  }

  // Determine auth based on provider
  let imapAuth: { user: string; pass?: string; accessToken?: string };

  if (account.authProvider === 'GOOGLE' || account.authProvider === 'MICROSOFT') {
    if (!account.oauthRefreshTokenEnc) {
      console.warn(`[email-inbound] OAuth account ${account.id} missing refresh token, skipping`);
      return { newTickets: 0, comments: 0 };
    }

    const clientId = account.authProvider === 'GOOGLE'
      ? process.env.GOOGLE_CLIENT_ID! : process.env.MICROSOFT_CLIENT_ID!;
    const clientSecret = account.authProvider === 'GOOGLE'
      ? process.env.GOOGLE_CLIENT_SECRET! : process.env.MICROSOFT_CLIENT_SECRET!;

    try {
      const { accessToken, refreshed, newExpiresAt } = await getFreshAccessToken(
        account.authProvider,
        account.oauthAccessTokenEnc!,
        account.oauthRefreshTokenEnc,
        account.oauthTokenExpiresAt,
        clientId, clientSecret,
      );

      if (refreshed && newExpiresAt) {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            oauthAccessTokenEnc: encrypt(accessToken),
            oauthTokenExpiresAt: newExpiresAt,
            oauthConnectionStatus: 'CONNECTED',
          },
        });
      }

      imapAuth = { user: account.imapUser ?? account.emailAddress, accessToken };
    } catch (err) {
      console.error(`[email-inbound] OAuth refresh failed for account ${account.id}:`, err);
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { oauthConnectionStatus: 'REFRESH_FAILED', isActive: false },
      });
      // Create admin notification
      await prisma.notification.create({
        data: {
          tenantId: account.tenantId,
          userId: account.tenantId, // Will need to resolve to an admin user
          type: 'SYSTEM',
          title: `Email account "${account.name}" disconnected`,
          body: 'OAuth token refresh failed. Please reconnect the account in Settings → Email.',
        },
      }).catch(() => {});
      return { newTickets: 0, comments: 0 };
    }
  } else {
    // Manual SMTP/IMAP — existing password-based auth
    if (!account.imapUser || !account.imapPasswordEnc) {
      console.warn(`[email-inbound] Account ${account.id} missing IMAP credentials, skipping`);
      return { newTickets: 0, comments: 0 };
    }
    let decryptedPassword = '';
    try { decryptedPassword = decrypt(account.imapPasswordEnc); } catch { decryptedPassword = ''; }
    imapAuth = { user: account.imapUser, pass: decryptedPassword };
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: imapAuth,
    logger: false,
  });
```

- [ ] **Step 2: Update email-notification.ts — SMTP auth branching**

In `apps/worker/src/workers/email-notification.ts`, add import at the top:

```typescript
import { getFreshAccessToken, encrypt } from '@meridian/core';
```

Replace the auth and transport creation section (lines 98-119) with:

```typescript
    if (!account || !account.smtpHost) {
      console.warn(
        `[email-notification] No active SMTP account for tenant ${tenantId}, skipping send to ${to}`,
      );
      return;
    }

    let transportConfig: Record<string, unknown>;

    if (account.authProvider === 'GOOGLE' || account.authProvider === 'MICROSOFT') {
      if (!account.oauthRefreshTokenEnc) {
        console.warn(`[email-notification] OAuth account ${account.id} missing refresh token, skipping`);
        return;
      }

      const clientId = account.authProvider === 'GOOGLE'
        ? process.env.GOOGLE_CLIENT_ID! : process.env.MICROSOFT_CLIENT_ID!;
      const clientSecret = account.authProvider === 'GOOGLE'
        ? process.env.GOOGLE_CLIENT_SECRET! : process.env.MICROSOFT_CLIENT_SECRET!;

      try {
        const { accessToken, refreshed, newExpiresAt } = await getFreshAccessToken(
          account.authProvider,
          account.oauthAccessTokenEnc!,
          account.oauthRefreshTokenEnc,
          account.oauthTokenExpiresAt,
          clientId, clientSecret,
        );

        if (refreshed && newExpiresAt) {
          await prisma.emailAccount.update({
            where: { id: account.id },
            data: {
              oauthAccessTokenEnc: encrypt(accessToken),
              oauthTokenExpiresAt: newExpiresAt,
              oauthConnectionStatus: 'CONNECTED',
            },
          });
        }

        transportConfig = {
          host: account.smtpHost,
          port: account.smtpPort ?? 587,
          secure: false,
          auth: {
            type: 'OAuth2',
            user: account.smtpUser ?? account.emailAddress,
            accessToken,
          },
        };
      } catch (err) {
        console.error(`[email-notification] OAuth refresh failed for account ${account.id}:`, err);
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { oauthConnectionStatus: 'REFRESH_FAILED', isActive: false },
        });
        return;
      }
    } else {
      // Manual — existing password-based or unauthenticated relay
      let decryptedPassword = '';
      if (account.smtpPasswordEnc) {
        try { decryptedPassword = decrypt(account.smtpPasswordEnc); } catch { decryptedPassword = ''; }
      }
      const hasAuth = !!(account.smtpUser || decryptedPassword);

      transportConfig = {
        host: account.smtpHost,
        port: account.smtpPort ?? 587,
        secure: account.smtpSecure,
        ...(hasAuth ? { auth: { user: account.smtpUser ?? '', pass: decryptedPassword } } : {}),
      };
    }

    const { subject, html } = await renderTemplate(tenantId, templateName, variables);
    const transport = nodemailer.createTransport(transportConfig);
```

- [ ] **Step 3: Rebuild worker**

```bash
pnpm --filter worker build
pm2 restart worker
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/services/email-inbound.service.ts apps/worker/src/workers/email-notification.ts
git commit -m "feat(worker): support OAuth2 xoauth2 auth for SMTP and IMAP connections"
```

---

## Task 5: Frontend — Provider Selection and OAuth Popup Flow

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/email/page.tsx`

- [ ] **Step 1: Update EmailAccount interface**

At the top of `page.tsx`, update the `EmailAccount` interface to include OAuth fields:

```typescript
interface EmailAccount {
  id: string;
  name: string;
  emailAddress: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  imapSecure: boolean;
  pollInterval: number;
  isActive: boolean;
  lastPolledAt: string | null;
  defaultQueueId: string | null;
  defaultCategoryId: string | null;
  authProvider: string;  // MANUAL, GOOGLE, MICROSOFT
  oauthConnectionStatus: string | null;  // CONNECTED, DISCONNECTED, REFRESH_FAILED
}
```

- [ ] **Step 2: Add ProviderSelectModal component**

Add before the `EmailModal` component:

```typescript
function ProviderSelectModal({ onSelect, onClose }: {
  onSelect: (provider: 'MANUAL' | 'GOOGLE' | 'MICROSOFT') => void;
  onClose: () => void;
}) {
  const providers = [
    {
      id: 'GOOGLE' as const,
      name: 'Google',
      subtitle: 'Workspace & Gmail',
      color: '#4285F4',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      ),
    },
    {
      id: 'MICROSOFT' as const,
      name: 'Microsoft 365',
      subtitle: 'Outlook & Exchange',
      color: '#00a4ef',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24">
          <path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M1 13h10v10H1z"/>
          <path fill="#7fba00" d="M13 1h10v10H13z"/><path fill="#ffb900" d="M13 13h10v10H13z"/>
        </svg>
      ),
    },
    {
      id: 'MANUAL' as const,
      name: 'Manual',
      subtitle: 'SMTP / IMAP',
      color: '#6b7280',
      icon: <Icon path={mdiEmail} size={1.3} color="#6b7280" />,
    },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Add Email Account</h2>
        </div>
        <div style={{ padding: 24, display: 'flex', gap: 16 }}>
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                flex: 1, border: '2px solid #e5e7eb', borderRadius: 12, padding: 20,
                textAlign: 'center', cursor: 'pointer', backgroundColor: '#fff',
                transition: 'border-color 0.15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = p.color)}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>{p.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{p.subtitle}</div>
            </button>
          ))}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add OAuth popup handler and PostConnectModal**

Add after `ProviderSelectModal`:

```typescript
function PostConnectModal({ account, queues, categories, onClose, onSaved }: {
  account: { id: string; name: string; email: string };
  queues: QueueOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [pollInterval, setPollInterval] = useState(5);
  const [defaultQueueId, setDefaultQueueId] = useState('');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600 as const, color: '#6b7280' };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/v1/email-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), pollInterval, defaultQueueId: defaultQueueId || null, defaultCategoryId: defaultCategoryId || null }),
      });
      onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f0fdf4' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#065f46' }}>Account Connected</h2>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Display Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email Address</label>
            <input type="text" value={account.email} disabled style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#6b7280' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Poll Interval (minutes)</label>
            <input type="number" min={1} max={1440} value={pollInterval} onChange={(e) => setPollInterval(Math.max(1, Number(e.target.value) || 5))} style={{ ...inputStyle, maxWidth: 120 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Default Queue</label>
              <select value={defaultQueueId} onChange={(e) => setDefaultQueueId(e.target.value)} style={{ ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' }}>
                <option value="">-- None --</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Default Category</label>
              <select value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)} style={{ ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' }}>
                <option value="">-- None --</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => void handleSave()} disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update EmailSettingsPage to use provider selection and OAuth flow**

In the main `EmailSettingsPage` component, add state for the provider selector and OAuth:

```typescript
const [showProviderSelect, setShowProviderSelect] = useState(false);
const [postConnectAccount, setPostConnectAccount] = useState<{ id: string; name: string; email: string } | null>(null);
```

Add the OAuth popup handler function:

```typescript
const handleOAuthConnect = async (provider: 'GOOGLE' | 'MICROSOFT') => {
  setShowProviderSelect(false);
  try {
    const res = await fetch(`/api/v1/email-accounts/oauth/authorize?provider=${provider.toLowerCase()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to get authorization URL');
    const { url } = (await res.json()) as { url: string };

    const popup = window.open(url, 'oauth-popup', 'width=600,height=700,scrollbars=yes');
    if (!popup) {
      alert('Please allow popups for this site to connect your email account.');
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const appUrl = window.location.origin;
      if (event.origin !== appUrl) return;
      const data = event.data as { type?: string; account?: { id: string; name: string; email: string }; error?: string };
      if (data.type === 'oauth-success' && data.account) {
        setPostConnectAccount(data.account);
        void qc.invalidateQueries({ queryKey: ['settings-email'] });
      } else if (data.type === 'oauth-error') {
        alert(`OAuth connection failed: ${data.error ?? 'Unknown error'}`);
      }
      window.removeEventListener('message', handleMessage);
    };

    window.addEventListener('message', handleMessage);
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to start OAuth flow');
  }
};

const handleProviderSelect = (provider: 'MANUAL' | 'GOOGLE' | 'MICROSOFT') => {
  if (provider === 'MANUAL') {
    setShowProviderSelect(false);
    setEditAccount(null);
    setShowModal(true);
  } else {
    void handleOAuthConnect(provider);
  }
};
```

Update the "Add Account" button's `onClick` to open provider select instead of the modal directly:

```typescript
onClick={() => setShowProviderSelect(true)}
```

Add the new modals at the bottom of the return, alongside the existing modals:

```tsx
{showProviderSelect && (
  <ProviderSelectModal
    onSelect={handleProviderSelect}
    onClose={() => setShowProviderSelect(false)}
  />
)}

{postConnectAccount && (
  <PostConnectModal
    account={postConnectAccount}
    queues={queues}
    categories={categories}
    onClose={() => setPostConnectAccount(null)}
    onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-email'] })}
  />
)}
```

- [ ] **Step 5: Update account list to show provider icons and connection status**

Replace the SMTP/IMAP checkmark columns in the table with provider icon + connection status. In the table header, replace:

```tsx
<th>SMTP</th>
<th>IMAP</th>
```

With:

```tsx
<th>Connection</th>
```

In the table body row, replace the SMTP/IMAP cells with:

```tsx
<td style={{ padding: '10px 14px', textAlign: 'center' }}>
  <span style={{
    padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500,
    backgroundColor: acc.oauthConnectionStatus === 'REFRESH_FAILED' ? '#fef2f2'
      : (acc.smtpHost || acc.authProvider !== 'MANUAL') ? '#d1fae5' : '#f3f4f6',
    color: acc.oauthConnectionStatus === 'REFRESH_FAILED' ? '#991b1b'
      : (acc.smtpHost || acc.authProvider !== 'MANUAL') ? '#065f46' : '#6b7280',
  }}>
    {acc.oauthConnectionStatus === 'REFRESH_FAILED' ? 'Disconnected' : 'Connected'}
  </span>
</td>
```

Update the account name cell to show a provider icon:

```tsx
<td style={{ padding: '10px 14px', fontWeight: 500 }}>
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    {acc.authProvider === 'GOOGLE' && <GoogleIcon size={14} />}
    {acc.authProvider === 'MICROSOFT' && <MicrosoftIcon size={14} />}
    {acc.authProvider === 'MANUAL' && <Icon path={mdiEmail} size={0.6} color="#6b7280" />}
    {acc.name}
  </span>
</td>
```

Add small SVG icon components at the top of the file:

```typescript
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function MicrosoftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M1 13h10v10H1z"/>
      <path fill="#7fba00" d="M13 1h10v10H13z"/><path fill="#ffb900" d="M13 13h10v10H13z"/>
    </svg>
  );
}
```

- [ ] **Step 6: Update colSpan references**

Update any `colSpan={8}` references in the table (e.g., the "No email accounts configured" row) to `colSpan={7}` since we removed one column.

- [ ] **Step 7: Build and restart web**

```bash
pnpm --filter web build
pm2 restart web
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/settings/email/page.tsx
git commit -m "feat(web): add provider selection modal, OAuth popup flow, and updated account list"
```

---

## Task 6: Environment Setup and Integration Test

- [ ] **Step 1: Add placeholder env vars**

Add to `apps/api/.env` and `apps/worker/.env`:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
APP_URL=https://meridian.cybordyne.net
```

Add to root `.env`:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
APP_URL=https://meridian.cybordyne.net
```

- [ ] **Step 2: Build all and restart**

```bash
pnpm --filter web build
pnpm --filter worker build
pm2 restart all
```

- [ ] **Step 3: Manual integration test checklist**

1. Navigate to Settings → Email → Add Account
2. Verify 3 provider cards appear (Google, Microsoft, Manual)
3. Click Manual — verify existing SMTP/IMAP form opens
4. Click Google (without credentials configured) — verify error message about missing GOOGLE_CLIENT_ID
5. Verify existing manual email accounts still work (send test, poll)
6. Verify account list shows provider icons and Connection status column

- [ ] **Step 4: Commit env changes**

```bash
git add apps/api/.env.example apps/worker/.env.example .env.example
git commit -m "feat: add OAuth2 environment variable placeholders"
```
