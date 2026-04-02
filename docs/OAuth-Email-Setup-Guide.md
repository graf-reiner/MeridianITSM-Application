# OAuth Email Setup Guide — MeridianITSM

This guide walks through setting up Google (Gmail/Workspace) and Microsoft (Outlook/365) OAuth email accounts in MeridianITSM.

---

## Prerequisites

- MeridianITSM running with the API accessible at a public URL (e.g., `https://meridian.cybordyne.net`)
- Admin access to Google Cloud Console and/or Microsoft Entra ID (Azure AD)
- Admin role in MeridianITSM

---

## Part 1: Google (Gmail & Google Workspace)

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top-left) → **New Project**
3. Name it (e.g., `MeridianITSM-Email`) → **Create**
4. Select the new project from the dropdown

### Step 2: Enable the Gmail API

1. Go to **APIs & Services** → **Library**
2. Search for **Gmail API**
3. Click **Gmail API** → **Enable**

### Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose user type:
   - **Internal** — if all email accounts are within your Google Workspace org (no Google review needed)
   - **External** — if you need to connect personal Gmail accounts (requires Google review for production)
3. Click **Create**
4. Fill in:
   - **App name**: `MeridianITSM`
   - **User support email**: your admin email
   - **Developer contact email**: your admin email
5. Click **Save and Continue**
6. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `https://mail.google.com/` (full Gmail access for IMAP/SMTP)
   - `openid`
   - `email`
   - `profile`
7. Click **Update** → **Save and Continue**
8. On **Test users** (External only): add the Gmail accounts you'll connect during testing
9. Click **Save and Continue** → **Back to Dashboard**

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. **Application type**: Web application
4. **Name**: `MeridianITSM Email`
5. Under **Authorized redirect URIs**, click **+ Add URI** and enter:
   ```
   https://meridian.cybordyne.net/api/v1/email-accounts/oauth/callback
   ```
   > Replace with your actual domain. This must match your `APP_URL` env var exactly.
6. Click **Create**
7. **Copy the Client ID and Client Secret** — you'll need these in the next section

### Step 5: Add Credentials to MeridianITSM

SSH into your server and edit the API environment file:

```bash
ssh meridian-dev
nano /opt/meridian/apps/api/.env
```

Add these lines:

```env
GOOGLE_CLIENT_ID=123456789-xxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
APP_URL=https://meridian.cybordyne.net
```

Save and restart the API:

```bash
cd /opt/meridian && pm2 restart api
```

### Step 6: Connect a Google Email Account in MeridianITSM

1. Log in to MeridianITSM as an admin
2. Go to **Settings** → **Email Accounts**
3. Click **Add Account**
4. Select **Google** (Workspace & Gmail)
5. A popup window opens with Google's sign-in page
6. Sign in with the Google account you want to use for email
7. Grant the requested permissions (Gmail access)
8. The popup closes automatically and returns you to MeridianITSM
9. Configure the account:
   - **Display Name** — e.g., "Support Inbox"
   - **Poll Interval** — how often to check for new emails (default: 5 minutes)
   - **Default Queue** — which ticket queue new emails go to
   - **Default Category** — optional category for new tickets
10. Click **Save**

The account is now active and polling for emails.

---

## Part 2: Microsoft (Outlook & Microsoft 365)

### Step 1: Register an Application in Microsoft Entra ID

1. Go to [Microsoft Entra Admin Center](https://entra.microsoft.com/)
2. Navigate to **Identity** → **Applications** → **App registrations**
3. Click **+ New registration**
4. Fill in:
   - **Name**: `MeridianITSM Email`
   - **Supported account types**: Select **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**
     > Choose "Single tenant" if all mailboxes are in your one org
   - **Redirect URI**:
     - Platform: **Web**
     - URI: `https://meridian.cybordyne.net/api/v1/email-accounts/oauth/callback`
5. Click **Register**
6. **Copy the Application (client) ID** from the Overview page

### Step 2: Create a Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **+ New client secret**
3. **Description**: `MeridianITSM`
4. **Expires**: Choose an expiration (recommended: 24 months)
5. Click **Add**
6. **Copy the secret Value immediately** — it won't be shown again

### Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **+ Add a permission**
3. Select **APIs my organization uses** tab, search for **Office 365 Exchange Online** (or find it under Microsoft APIs)
4. Choose **Delegated permissions**
5. Add these permissions:
   - `IMAP.AccessAsUser.All` — for reading emails via IMAP
   - `SMTP.Send` — for sending emails via SMTP
6. Click **Add permissions**
7. Also ensure these Microsoft Graph permissions are present (usually added by default):
   - `openid`
   - `email`
   - `profile`
   - `offline_access` (for refresh tokens)
8. If you're a tenant admin, click **Grant admin consent for [your org]**
   > If you can't grant admin consent, each user will be prompted to consent during the OAuth flow

### Step 4: Add Credentials to MeridianITSM

SSH into your server and edit the API environment file:

```bash
ssh meridian-dev
nano /opt/meridian/apps/api/.env
```

Add these lines:

```env
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
APP_URL=https://meridian.cybordyne.net
```

> If you already set `APP_URL` for Google, don't add it twice.

Save and restart the API:

```bash
cd /opt/meridian && pm2 restart api
```

### Step 5: Connect a Microsoft Email Account in MeridianITSM

1. Log in to MeridianITSM as an admin
2. Go to **Settings** → **Email Accounts**
3. Click **Add Account**
4. Select **Microsoft 365** (Outlook & Exchange)
5. A popup window opens with Microsoft's sign-in page
6. Sign in with the Microsoft account/mailbox you want to use
7. Grant the requested permissions (Mail access)
8. The popup closes automatically and returns you to MeridianITSM
9. Configure the account:
   - **Display Name** — e.g., "Helpdesk Inbox"
   - **Poll Interval** — how often to check for new emails (default: 5 minutes)
   - **Default Queue** — which ticket queue new emails go to
   - **Default Category** — optional category for new tickets
10. Click **Save**

The account is now active and polling for emails.

---

## Troubleshooting

### OAuth popup doesn't open or gets blocked
- Ensure your browser allows popups from your MeridianITSM domain
- Check that `APP_URL` in `.env` matches the exact domain you're accessing (including `https://`)

### "redirect_uri_mismatch" error (Google)
- The redirect URI in Google Cloud Console must exactly match:
  `https://your-domain.com/api/v1/email-accounts/oauth/callback`
- No trailing slash, must use `https://`

### "AADSTS50011: The redirect URI does not match" (Microsoft)
- Same as above — the redirect URI in Entra ID must exactly match the callback URL
- Ensure the platform is set to **Web** (not SPA)

### Account shows "Disconnected" after working
- The refresh token was revoked (user changed password, admin revoked access, or token expired)
- Click **Reconnect** on the email account to re-authorize
- MeridianITSM automatically deactivates accounts when refresh fails and notifies the admin

### Google says "This app isn't verified"
- Expected during development with **External** user type
- Click **Advanced** → **Go to MeridianITSM (unsafe)** to proceed
- For production: submit your app for Google verification via the consent screen page

### Microsoft says "Need admin approval"
- Your Entra ID tenant requires admin consent for the requested permissions
- A tenant admin must click **Grant admin consent** in the app's API permissions page
- Or ask the admin to consent via: `https://login.microsoftonline.com/common/adminconsent?client_id=YOUR_CLIENT_ID`

### Emails not being received
- Check the account is **Active** in Settings → Email Accounts
- Check worker logs: `ssh meridian-dev "pm2 logs worker --lines 50"`
- Look for `[email-inbound]` log entries showing poll results
- Verify the mailbox actually has unread emails in the inbox

### Emails not being sent
- Check API logs: `ssh meridian-dev "pm2 logs api --lines 50"`
- For Google: ensure the Gmail API is enabled in Cloud Console
- For Microsoft: ensure `SMTP.Send` permission was granted with admin consent

---

## Environment Variable Summary

Add all of these to `/opt/meridian/apps/api/.env`:

```env
# Required for OAuth to work
APP_URL=https://meridian.cybordyne.net

# Google OAuth (optional — only if using Google email)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Microsoft OAuth (optional — only if using Microsoft email)
MICROSOFT_CLIENT_ID=your-application-id
MICROSOFT_CLIENT_SECRET=your-client-secret

# Already present — used for encrypting OAuth tokens
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

After adding/changing any values:

```bash
ssh meridian-dev "cd /opt/meridian && pm2 restart api worker"
```
