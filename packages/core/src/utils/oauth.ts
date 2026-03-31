import crypto from 'node:crypto';
import { encrypt, decrypt } from './encryption.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
}

export interface OAuthUserInfo {
  email: string;
  name: string;
}

interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  provider: string;
  nonce: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Provider configurations
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS: Record<'google' | 'microsoft', OAuthProviderConfig> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['https://mail.google.com/', 'openid', 'email', 'profile'],
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: [
      'https://outlook.office365.com/IMAP.AccessAsUser.All',
      'https://outlook.office365.com/SMTP.Send',
      'offline_access',
      'openid',
      'email',
      'profile',
    ],
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
  },
};

// ---------------------------------------------------------------------------
// State token (CSRF protection)
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createOAuthState(
  tenantId: string,
  userId: string,
  provider: string,
): string {
  const payload: OAuthStatePayload = {
    tenantId,
    userId,
    provider,
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  return encrypt(JSON.stringify(payload));
}

export function validateOAuthState(state: string): OAuthStatePayload {
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(decrypt(state)) as OAuthStatePayload;
  } catch {
    throw new Error('Invalid OAuth state token');
  }

  if (!payload.tenantId || !payload.userId || !payload.provider || !payload.nonce || !payload.timestamp) {
    throw new Error('Malformed OAuth state payload');
  }

  const age = Date.now() - payload.timestamp;
  if (age > STATE_TTL_MS) {
    throw new Error('OAuth state token has expired');
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Authorization URL builder
// ---------------------------------------------------------------------------

export function buildAuthorizationUrl(
  provider: 'google' | 'microsoft',
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const config = OAUTH_PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${config.authUrl}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export async function exchangeCodeForTokens(
  provider: 'google' | 'microsoft',
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const config = OAUTH_PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as OAuthTokens;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  provider: 'google' | 'microsoft',
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<OAuthTokens> {
  const config = OAUTH_PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as OAuthTokens;
}

// ---------------------------------------------------------------------------
// User info fetch
// ---------------------------------------------------------------------------

export async function fetchUserInfo(
  provider: 'google' | 'microsoft',
  accessToken: string,
): Promise<OAuthUserInfo> {
  const config = OAUTH_PROVIDERS[provider];

  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`User info fetch failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (provider === 'microsoft') {
    return {
      email: (data.mail as string) || (data.userPrincipalName as string) || '',
      name: (data.displayName as string) || '',
    };
  }

  // Google
  return {
    email: (data.email as string) || '',
    name: (data.name as string) || '',
  };
}

// ---------------------------------------------------------------------------
// getFreshAccessToken — auto-refresh if near expiry
// ---------------------------------------------------------------------------

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export async function getFreshAccessToken(
  provider: 'google' | 'microsoft',
  encryptedAccessToken: string,
  encryptedRefreshToken: string,
  expiresAt: Date,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string;
  refreshed: boolean;
  newExpiresAt?: Date;
}> {
  const now = new Date();

  // If the token is still valid (with buffer), decrypt and return it
  if (expiresAt.getTime() - now.getTime() > EXPIRY_BUFFER_MS) {
    return {
      accessToken: decrypt(encryptedAccessToken),
      refreshed: false,
    };
  }

  // Token is expired or near expiry — refresh it
  const refreshToken = decrypt(encryptedRefreshToken);
  const tokens = await refreshAccessToken(provider, refreshToken, clientId, clientSecret);

  const newExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

  return {
    accessToken: tokens.access_token,
    refreshed: true,
    newExpiresAt,
  };
}
