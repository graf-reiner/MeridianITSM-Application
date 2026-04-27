// ─── OAuth credential resolution ─────────────────────────────────────────────
// Returns the OAuth client_id / client_secret for a given email-account
// provider. Lookup precedence:
//
//   1. owner_oauth_integrations row (set via the Owner Admin Integrations
//      wizard, encrypted at rest)
//   2. Environment variable fallback (MICROSOFT_CLIENT_ID / GOOGLE_CLIENT_ID
//      etc.) — preserved so existing env-only deployments keep working with
//      no behavior change.
//
// Both the api OAuth route and the worker token-refresh path call this so
// they always agree on which credentials to use.
//
// The `prismaClient` argument is the caller's prisma instance — both
// `@meridian/db` consumers (api and worker) pass their own. We don't import
// prisma inside core to keep this package free of DB framework deps.

import { decrypt } from './encryption.js';

export type EmailOAuthProvider = 'microsoft' | 'google';

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  source: 'db' | 'env';
}

interface OAuthIntegrationRow {
  clientId: string;
  clientSecretEnc: string;
  isEnabled: boolean;
}

interface MinimalPrismaClient {
  ownerOAuthIntegration: {
    findUnique(args: { where: { provider: 'MICROSOFT' | 'GOOGLE' } }): Promise<OAuthIntegrationRow | null>;
  };
}

export async function getOAuthCredentials(
  prismaClient: MinimalPrismaClient,
  provider: EmailOAuthProvider,
): Promise<OAuthCredentials | null> {
  // 1) DB lookup
  try {
    const row = await prismaClient.ownerOAuthIntegration.findUnique({
      where: { provider: provider === 'microsoft' ? 'MICROSOFT' : 'GOOGLE' },
    });
    if (row && row.isEnabled && row.clientId && row.clientSecretEnc) {
      return {
        clientId: row.clientId,
        clientSecret: decrypt(row.clientSecretEnc),
        source: 'db',
      };
    }
  } catch (err) {
    // DB not reachable / table not migrated yet — silently fall through to env.
    console.error(`[oauth-credentials] DB lookup failed for ${provider}, falling back to env:`, err);
  }

  // 2) Env fallback
  const envClientId = provider === 'microsoft' ? process.env.MICROSOFT_CLIENT_ID : process.env.GOOGLE_CLIENT_ID;
  const envClientSecret = provider === 'microsoft' ? process.env.MICROSOFT_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret, source: 'env' };
  }

  return null;
}
