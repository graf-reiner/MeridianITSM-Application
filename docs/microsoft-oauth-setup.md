# Microsoft 365 (and Google) Email Connector — End-to-End Setup

**Audience:** SaaS platform operators (you) and customer admins.
**Last updated:** 2026-04-27
**Related code:**
- OAuth route: `apps/api/src/routes/v1/email-accounts/oauth.ts`
- Provider config + URL builder + token refresh: `packages/core/src/utils/oauth.ts`
- Outbound mail (uses refreshed tokens): `apps/worker/src/workers/email-notification.ts`
- Inbound poll (uses refreshed tokens): `apps/worker/src/services/email-inbound.service.ts`

## TL;DR

Microsoft (and Google) email connectivity is a **one-time platform setup** done by you, the SaaS owner. After that, **every customer just clicks a button** in Settings → Email Accounts and OAuths their own M365/Gmail mailbox. No per-customer Azure work.

## The two "tenants" (the source of confusion)

| Term | What it means here |
|---|---|
| **Azure AD tenant** | A Microsoft directory (e.g. `cybordyne.onmicrosoft.com`, `customer-x.onmicrosoft.com`). Microsoft's concept. |
| **MeridianITSM tenant** | A row in your `Tenant` Postgres table — the SaaS customer. |

A *multi-tenant* Azure app registration is one that lives in **your** Azure AD tenant but accepts sign-ins from **any other** Azure AD tenant in the world (with that org's admin consent). That's the whole reason Microsoft built this — for SaaS apps exactly like MeridianITSM.

## One-time platform setup (you do this once per environment)

You'll do this twice: once for dev, once for production. Same app registration can serve both if you add multiple redirect URIs.

### 1. Register the app in Azure

- Go to **portal.azure.com → Microsoft Entra ID → App registrations → + New registration**.
- **Name:** `MeridianITSM Email Connector` (whatever you like).
- **Supported account types:** *Accounts in any organizational directory* (multi-tenant). This is the load-bearing checkbox.
- **Redirect URI:** type *Web*. URL:
  - Dev: `https://app-dev.meridianitsm.com/api/v1/email-accounts/oauth/callback`
  - Prod: `https://app.meridianitsm.com/api/v1/email-accounts/oauth/callback` (add as a second redirect URI on the same app registration after creation)
- Click **Register**.

### 2. Add API permissions

From the new app's blade → **API permissions → + Add a permission → APIs my organization uses → "Office 365 Exchange Online"** → **Delegated permissions**:

- `IMAP.AccessAsUser.All`
- `SMTP.Send`

Then **+ Add a permission → Microsoft Graph → Delegated permissions**, add:

- `User.Read` (usually already granted by default)
- `offline_access` (so refresh tokens are returned)

Click **Grant admin consent for `<your tenant>`** at the top.

The app code in `packages/core/src/utils/oauth.ts:60-67` requests these scopes verbatim — they must match.

### 3. Create a client secret

- **Certificates & secrets → + New client secret**.
- Description: e.g. `dev-2026`. Expires: 12 or 24 months (Microsoft's max is 24).
- **Copy the *Value* immediately.** Microsoft only shows it once. The Secret ID is irrelevant.

### 4. Stash the credentials in env

On every server (dev: `10.1.200.218`, prod: `10.1.200.220`), edit `/opt/meridian/apps/api/.env`:

```
MICROSOFT_CLIENT_ID=<Application (client) ID from the Overview blade>
MICROSOFT_CLIENT_SECRET=<the Value from step 3>
APP_URL=https://app-dev.meridianitsm.com    # adjust per environment
```

If you also want Google Workspace OAuth, add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from a Google Cloud Console OAuth client. Same shape, different provider.

### 5. Restart the API and worker

```
pm2 restart api worker --update-env
```

The `--update-env` flag forces PM2 to re-read the environment. Without it, the old env stays cached.

### 6. Verify

In a tenant account (e.g. via signup or impersonate), go to **Settings → Email Accounts → + Add Account → Microsoft 365**. The Microsoft sign-in window should open. If you see "Failed to get authorization URL" again, env vars still aren't reaching the api process — re-check the file path and the restart.

## Per-tenant flow (every customer does this themselves)

1. Customer admin opens **Settings → Email Accounts → + Add Account → Microsoft 365**.
2. Web app calls `GET /api/v1/email-accounts/oauth/authorize?provider=microsoft`.
3. API resolves your platform `MICROSOFT_CLIENT_ID` from env, signs a `state` token containing the customer's MeridianITSM `tenantId` + `userId` (`packages/core/src/utils/oauth.ts:81-94`), and returns the Microsoft sign-in URL.
4. A popup shows the Microsoft sign-in screen.
5. Customer signs in with their M365 admin account → Microsoft displays a consent page listing the IMAP/SMTP scopes → they click Accept.
6. Microsoft redirects the popup to `https://app-dev.meridianitsm.com/api/v1/email-accounts/oauth/callback?code=...&state=...`.
7. The callback route (`apps/api/src/routes/v1/email-accounts/oauth.ts:59-173`) validates the state, exchanges the code for access + refresh tokens, calls Microsoft Graph `/me` to get the user's email and name, and **creates an `EmailAccount` row scoped to the original MeridianITSM tenant** (`tenantId` from the state token). Tokens are encrypted with `encrypt()` from `@meridian/core` before storing.
8. From then on, the inbound email poller and outbound email worker call `getFreshAccessToken` to silently refresh access tokens against Microsoft's token endpoint when they expire (`packages/core/src/utils/oauth.ts`, used at `apps/worker/src/workers/email-notification.ts:148`).

No passwords stored anywhere. No per-tenant Azure registrations. Tokens refresh automatically.

## What customers see if their org has strict app policies

Some Azure AD admins block users from consenting to third-party apps. In that case the user sees a "Need admin approval" screen instead of consent. Their admin can either:

- One-time grant: visit `https://login.microsoftonline.com/{their-tenant}/adminconsent?client_id=<MeridianITSM Application ID>&redirect_uri=...` to consent on behalf of the org.
- Or grant admin consent through Entra ID → Enterprise applications.

After admin consent, any user in the org can connect their mailbox without further prompts.

## Token expiry & rotation

| Thing | TTL | Refreshed by |
|---|---|---|
| User access token | ~1 hour | `getFreshAccessToken` on every IMAP/SMTP use |
| User refresh token | 90 days of inactivity, otherwise long-lived | Microsoft (only on use) |
| Your client secret | 12 or 24 months | **You manually**, in Azure |

**Set a calendar reminder for client secret expiry.** When it expires, every customer's connection breaks at the same moment — refresh fails, no warning. Best practice: rotate ~1 month before expiry, deploy the new secret, then delete the old one in Azure.

## Per-tenant app registrations (out of scope, here for completeness)

Some enterprise customers refuse to consent to third-party Azure apps. They'd want to register the app in their own Azure tenant and give MeridianITSM their own client_id/secret. That's a separate feature — schema changes (`EmailAccount` would need its own credentials, or a per-tenant `Integration` table), settings UI, and significant testing. Don't build it until a customer asks.

## Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| "Failed to get authorization URL" alert | `MICROSOFT_CLIENT_ID`/`SECRET` not set, or `APP_URL` missing | Step 4–5 above |
| Microsoft "AADSTS70011: invalid scope" | Scopes in `OAUTH_PROVIDERS.microsoft.scopes` don't match what's granted in Azure | Add missing API permissions in Azure |
| Microsoft "AADSTS50011: redirect URI mismatch" | Redirect URI in code doesn't match what's registered | Add the URL in Azure → Authentication → Web → Redirect URIs |
| "OAuth state token has expired" | User took >10 min between popup open and callback | Try again. TTL is at `packages/core/src/utils/oauth.ts:79` |
| "Need admin approval" screen for the customer | Customer's tenant blocks user consent | Their admin uses the admin-consent URL above |
| Connection works initially, breaks after weeks | Client secret expired | Rotate in Azure, redeploy env |

## Owner-admin wizard

A first-class wizard for this lives in the Owner Admin app under **Settings → Integrations** (Microsoft 365 / Google). It checks live env status, walks you through the Azure registration with copy-pasteable values, accepts the credentials and persists them, then runs a self-test. See `apps/owner/src/app/(admin)/integrations/`.
