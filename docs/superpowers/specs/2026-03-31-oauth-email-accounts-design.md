# OAuth2 Email Account Integration — Design Spec

**Date:** 2026-03-31
**Status:** Reviewed
**Scope:** Google Workspace/Gmail + Microsoft 365/Outlook OAuth2 email accounts

## Problem

Google Workspace deprecated "less secure app access" (app passwords) in March 2025. Username/password SMTP/IMAP authentication fails with `535-5.7.8 Username and Password not accepted`. Microsoft 365 has similar OAuth2 requirements. MeridianITSM needs OAuth2 email account support to work with modern business email providers.

## Solution

Add Google and Microsoft as first-class email account providers alongside existing manual SMTP/IMAP. Uses OAuth2 for authentication with platform-level credentials (single Google Cloud project + Microsoft Entra app registration). Tenants click "Connect with Google/Microsoft" and authorize via popup — no credentials to enter.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Providers | Google + Microsoft | Covers ~90% of business email |
| OAuth credentials | Platform-level | Simplest for tenants; per-tenant override can be added later |
| Authorization flow | Popup window | User stays on settings page; smoother UX |
| Post-connect config | Show config form | Lets user set queue/category routing immediately |
| Send + Receive | Always both | Single consent; existing flags control behavior |
| Token failure handling | Silent refresh + in-app alert + "Disconnected" badge | Covers 99% of cases; visible status for admins |
| Account list display | Provider icon + single Connection column | Cleaner table; replaces separate SMTP/IMAP columns |

## Database Changes

### EmailAccount Model Extensions

```prisma
model EmailAccount {
  // ... existing fields ...

  // OAuth2 fields
  authProvider          String    @default("MANUAL")  // MANUAL, GOOGLE, MICROSOFT
  oauthAccessTokenEnc   String?   // AES-256-GCM encrypted
  oauthRefreshTokenEnc  String?   // AES-256-GCM encrypted
  oauthTokenExpiresAt   DateTime?
  oauthScope            String?
  oauthConnectionStatus String?   // CONNECTED, DISCONNECTED, REFRESH_FAILED
}
```

For OAuth accounts, existing SMTP/IMAP fields are auto-populated with provider defaults:

| Provider | SMTP Host | SMTP Port | IMAP Host | IMAP Port | Secure |
|----------|-----------|-----------|-----------|-----------|--------|
| Google | smtp.gmail.com | 587 | imap.gmail.com | 993 | true |
| Microsoft | smtp.office365.com | 587 | outlook.office365.com | 993 | true |

Password fields (`smtpPasswordEnc`, `imapPasswordEnc`) remain null — auth uses `xoauth2` mechanism.

## Environment Variables

```env
# Google OAuth2 (Google Cloud Console → APIs & Services → Credentials)
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Microsoft OAuth2 (Entra ID → App Registrations)
MICROSOFT_CLIENT_ID=<your-application-id>
MICROSOFT_CLIENT_SECRET=<your-client-secret>
```

These are platform-level — all tenants share the same OAuth app.

## OAuth2 Scopes

### Google
```
https://mail.google.com/
openid
email
profile
```
The `https://mail.google.com/` scope grants full IMAP and SMTP access via XOAUTH2.

### Microsoft
```
https://outlook.office365.com/IMAP.AccessAsUser.All
https://outlook.office365.com/SMTP.Send
offline_access
openid
email
profile
```
`offline_access` is required to get a refresh token.

## API Changes

### New Endpoints

#### `GET /api/v1/email-accounts/oauth/authorize`

Returns the OAuth authorization URL for the given provider.

**Query params:** `provider` (required): `google` or `microsoft`

**Response:**
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=...&state=...&access_type=offline&prompt=consent",
  "state": "<encrypted-state-token>"
}
```

**State parameter** contains encrypted JSON: `{ tenantId, userId, nonce, timestamp }`. Verified on callback to prevent CSRF.

#### `GET /api/v1/email-accounts/oauth/callback`

Handles the OAuth redirect from Google/Microsoft. This endpoint returns HTML (not JSON) with `Content-Type: text/html` — it runs in the Fastify API app but serves a self-closing popup page.

**Query params:** `code` (authorization code), `state` (from authorize step)

**Flow:**
1. Decrypt and validate state (check nonce, timestamp < 10 min, tenantId exists)
2. Exchange authorization code for access token + refresh token via provider's token endpoint
3. Fetch user profile (email address, display name) from provider's userinfo endpoint
4. Encrypt tokens with AES-256-GCM
5. Create EmailAccount record with auto-populated SMTP/IMAP defaults, including `smtpUser = emailAddress` and `imapUser = emailAddress`
6. Return HTML page that posts `{ type: 'oauth-success', account: { id, name, email } }` to `window.opener` via `postMessage` with explicit `targetOrigin` (the configured app URL, not `*`), then closes itself

**Error handling:** If any step fails, return HTML that posts `{ type: 'oauth-error', error: 'message' }` to `window.opener` with explicit `targetOrigin`.

**Security:** The frontend `message` event listener must validate `event.origin` against the expected app URL before processing the message.

### Modified Endpoints

#### `GET /api/v1/email-accounts`

Add to response: `authProvider`, `oauthConnectionStatus`. Continue masking tokens.

#### `PATCH /api/v1/email-accounts/:id`

For OAuth accounts: allow updating `name`, `pollInterval`, `defaultQueueId`, `defaultCategoryId`, `isActive`. Do NOT allow changing `emailAddress`, `authProvider`, or OAuth tokens directly.

#### `POST /api/v1/email-accounts/test-smtp` and `test-imap`

For OAuth accounts (detected via `accountId` lookup):
- Check token expiry; refresh if needed
- Use `xoauth2` auth instead of username/password
- nodemailer: `auth: { type: 'OAuth2', user: email, accessToken: token }`
- imapflow: `auth: { user: email, accessToken: token }`

### Token Refresh Endpoint (Internal)

Not an HTTP endpoint — a shared utility function used by the worker and test endpoints:

```typescript
async function refreshOAuthToken(account: EmailAccount): Promise<string> {
  // Returns fresh access token, updates DB if refreshed
  // Throws if refresh token is revoked
}
```

**Google token endpoint:** `https://oauth2.googleapis.com/token`
**Microsoft token endpoint:** `https://login.microsoftonline.com/common/oauth2/v2.0/token`

## Worker Changes

### Guard Clause Updates

Existing guard clauses in the worker check for password-based credentials and skip accounts without them. These must be updated to branch on `authProvider`:

- `email-inbound.service.ts` `pollMailbox()`: Currently skips if `!account.imapUser || !account.imapPasswordEnc`. Must change to: skip if `authProvider === 'MANUAL' && (!account.imapUser || !account.imapPasswordEnc)`. For OAuth accounts, skip if `!account.oauthRefreshTokenEnc`.
- `email-notification.ts`: Currently checks `hasAuth` based on `smtpUser`/`smtpPasswordEnc`. Must branch: for OAuth accounts, use `xoauth2` auth; for manual accounts, use existing password-based auth or unauthenticated relay.

### Token Refresh Before Connection

Before each SMTP send or IMAP poll for an OAuth account:

1. Check `oauthTokenExpiresAt` — if more than 5 minutes remaining, use cached token
2. If expired or within 5-minute buffer:
   a. Call provider's token endpoint with refresh token
   b. Encrypt new access token
   c. Update `oauthAccessTokenEnc`, `oauthTokenExpiresAt` in DB
   d. Set `oauthConnectionStatus = 'CONNECTED'`
3. If refresh fails (401/invalid_grant = revoked):
   a. Set `oauthConnectionStatus = 'REFRESH_FAILED'`
   b. Set `isActive = false`
   c. Create in-app notification for tenant admins: "Email account {name} has been disconnected. Please reconnect via Settings → Email."
   d. Log to email activity as `PERMANENT_FAILURE`

### SMTP Transport (email-notification worker)

```typescript
// For OAuth accounts
const transport = nodemailer.createTransport({
  host: account.smtpHost,    // smtp.gmail.com or smtp.office365.com
  port: account.smtpPort,    // 587
  secure: false,             // STARTTLS
  auth: {
    type: 'OAuth2',
    user: account.emailAddress,
    accessToken: freshAccessToken,
  },
});
```

### IMAP Connection (email-polling worker)

```typescript
// For OAuth accounts
const client = new ImapFlow({
  host: account.imapHost,    // imap.gmail.com or outlook.office365.com
  port: account.imapPort,    // 993
  secure: true,
  auth: {
    user: account.emailAddress,
    accessToken: freshAccessToken,
  },
});
```

## Frontend Changes

### Provider Selection Modal

When user clicks "Add Account", show a modal with 3 cards:

1. **Google** (Google icon) — "Workspace & Gmail"
2. **Microsoft 365** (Microsoft icon) — "Outlook & Exchange"
3. **Manual** (envelope icon) — "SMTP / IMAP"

Clicking Google or Microsoft opens the OAuth popup. Clicking Manual opens the existing SMTP/IMAP form.

### OAuth Popup Flow

1. Frontend calls `GET /api/v1/email-accounts/oauth/authorize?provider=google`
2. Opens returned URL in a popup window (600x700)
3. Listens for `postMessage` from the popup
4. On `oauth-success`: close popup, show post-connect config form
5. On `oauth-error`: close popup, show error message

### Post-Connect Config Form

After OAuth succeeds, show a simplified modal:
- **Display Name** — pre-filled from OAuth profile, editable
- **Email Address** — pre-filled from OAuth, read-only
- **Poll Interval** — default 5 min
- **Default Queue** — dropdown
- **Default Category** — dropdown
- **Active** — toggle, default on
- **Save** button

### Account List

Replace SMTP/IMAP checkmark columns with:
- Provider icon (Google/Microsoft/envelope) next to account name
- Single "Connection" column: `Connected` (green) / `Disconnected` (red)

For OAuth accounts with `REFRESH_FAILED` status, show "Disconnected" badge and a "Reconnect" button in the actions column.

### Edit Modal for OAuth Accounts

- Hide SMTP/IMAP configuration sections
- Show read-only connection info: "Connected as bt_support@cybordyne.com via Google"
- Show "Reconnect" button (triggers new OAuth flow, updates tokens)
- Editable: Display Name, Poll Interval, Default Queue, Default Category, Active toggle

## Error Handling

| Scenario | Behavior |
|----------|----------|
| OAuth popup blocked | Show message: "Please allow popups for this site" |
| User denies consent | Popup posts error, frontend shows "Authorization denied" |
| Token refresh fails (revoked) | Mark REFRESH_FAILED, deactivate account, notify admins |
| Token refresh network error | Retry 3x with exponential backoff, then mark failed |
| Google/Microsoft API down | Log error, skip this poll cycle, retry next cycle |
| Callback state invalid | Return error HTML, don't create account |
| Callback state expired (>10 min) | Return error HTML: "Authorization expired, please try again" |

## External Setup Required

### Google Cloud Console
1. Create project (or use existing)
2. Enable Gmail API
3. Configure OAuth consent screen (External or Internal for Workspace)
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized redirect URI: `https://meridian.cybordyne.net/api/v1/email-accounts/oauth/callback`

### Microsoft Entra ID (Azure AD)
1. Register application
2. Add API permissions: `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid`, `email`, `profile`
3. Create client secret
4. Add redirect URI: `https://meridian.cybordyne.net/api/v1/email-accounts/oauth/callback`

## Implementation Notes

### Concurrent Token Refresh

If multiple workers try to refresh the same account's token simultaneously (e.g., SMTP send + IMAP poll at the same moment), they could race. Use a brief Redis lock keyed on `oauth-refresh:{accountId}` with a 30-second TTL to serialize refresh attempts.

### Microsoft Tenant Configuration

The Microsoft token endpoint uses `https://login.microsoftonline.com/organizations/oauth2/v2.0/token` (not `/common/`) to restrict to organizational accounts only. Personal Microsoft accounts cannot use IMAP/SMTP. The Entra app registration must be configured as "Accounts in any organizational directory" (multi-tenant).

### Token Revocation on Delete

When an OAuth email account is deleted, token revocation with Google/Microsoft is deferred — tokens expire naturally (1 hour for access tokens). Explicit revocation can be added in a future iteration.

### Dependency Placement

`google-auth-library` is needed in both `apps/api` (callback token exchange) and `apps/worker` (token refresh). Install in `packages/core` to share across both apps.

## Dependencies

New npm packages:
- `google-auth-library` — Google OAuth2 token exchange and refresh (installed in `packages/core`)
- No additional package needed for Microsoft — standard HTTP calls to Entra token endpoints

## Migration Path

- Existing manual SMTP/IMAP accounts are unaffected (`authProvider` defaults to `MANUAL`)
- No breaking changes to existing API responses (new fields are additive)
- Frontend gracefully handles both account types
