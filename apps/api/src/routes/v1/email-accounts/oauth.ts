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

/**
 * OAuth routes for email account linking (Google / Microsoft)
 *
 * GET /api/v1/email-accounts/oauth/authorize  — Start OAuth flow (returns auth URL)
 * GET /api/v1/email-accounts/oauth/callback   — OAuth redirect target (returns HTML)
 */
export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /authorize ────────────────────────────────────────────────────────
  fastify.get(
    '/api/v1/email-accounts/oauth/authorize',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const { provider } = request.query as { provider?: string };

      if (!provider || !['google', 'microsoft'].includes(provider)) {
        return reply.status(400).send({ error: 'provider must be "google" or "microsoft"' });
      }

      const typedProvider = provider as 'google' | 'microsoft';

      // Resolve OAuth credentials from env
      const clientId =
        typedProvider === 'google'
          ? process.env.GOOGLE_CLIENT_ID
          : process.env.MICROSOFT_CLIENT_ID;
      const clientSecret =
        typedProvider === 'google'
          ? process.env.GOOGLE_CLIENT_SECRET
          : process.env.MICROSOFT_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return reply.status(500).send({ error: `OAuth credentials not configured for ${provider}` });
      }

      const user = request.user as { tenantId: string; userId: string };
      const redirectUri = `${process.env.APP_URL}/api/v1/email-accounts/oauth/callback`;
      const state = createOAuthState(user.tenantId, user.userId, typedProvider);
      const url = buildAuthorizationUrl(typedProvider, clientId, redirectUri, state);

      return reply.status(200).send({ url, state });
    },
  );

  // ─── GET /callback ─────────────────────────────────────────────────────────
  // No auth preHandler — this is the OAuth provider redirect target
  fastify.get(
    '/api/v1/email-accounts/oauth/callback',
    async (request, reply) => {
      const { code, state, error: oauthError } = request.query as {
        code?: string;
        state?: string;
        error?: string;
      };

      const targetOrigin = process.env.APP_URL || '*';

      // Helper to send HTML that posts a message to the opener window
      const sendHtml = (payload: Record<string, unknown>) => {
        const json = JSON.stringify(payload);
        const html = `<!DOCTYPE html>
<html><head><title>OAuth</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage(${json}, ${JSON.stringify(targetOrigin)});
  }
  window.close();
</script>
<p>You may close this window.</p>
</body></html>`;
        return reply.header('Content-Type', 'text/html').status(200).send(html);
      };

      // ── Error from provider ──
      if (oauthError) {
        return sendHtml({ type: 'oauth-error', error: oauthError });
      }

      if (!code || !state) {
        return sendHtml({ type: 'oauth-error', error: 'Missing code or state parameter' });
      }

      // ── Validate state ──
      let statePayload: ReturnType<typeof validateOAuthState>;
      try {
        statePayload = validateOAuthState(state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid state';
        return sendHtml({ type: 'oauth-error', error: msg });
      }

      const provider = statePayload.provider as 'google' | 'microsoft';
      const { tenantId, userId } = statePayload;

      // ── Resolve credentials ──
      const clientId =
        provider === 'google'
          ? process.env.GOOGLE_CLIENT_ID
          : process.env.MICROSOFT_CLIENT_ID;
      const clientSecret =
        provider === 'google'
          ? process.env.GOOGLE_CLIENT_SECRET
          : process.env.MICROSOFT_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return sendHtml({ type: 'oauth-error', error: `OAuth credentials not configured for ${provider}` });
      }

      const redirectUri = `${process.env.APP_URL}/api/v1/email-accounts/oauth/callback`;

      try {
        // ── Exchange code for tokens ──
        const tokens = await exchangeCodeForTokens(provider, code, clientId, clientSecret, redirectUri);

        // ── Fetch user info ──
        const userInfo = await fetchUserInfo(provider, tokens.access_token);

        if (!userInfo.email) {
          return sendHtml({ type: 'oauth-error', error: 'Could not retrieve email address from OAuth provider' });
        }

        // ── Build token expiry ──
        const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

        // ── Create EmailAccount ──
        const providerConfig = OAUTH_PROVIDERS[provider];
        const account = await prisma.emailAccount.create({
          data: {
            tenantId,
            name: userInfo.name || userInfo.email,
            emailAddress: userInfo.email,
            authProvider: provider === 'google' ? 'GOOGLE' : 'MICROSOFT',
            smtpHost: providerConfig.smtpHost,
            smtpPort: providerConfig.smtpPort,
            smtpUser: userInfo.email,
            smtpSecure: false, // STARTTLS
            imapHost: providerConfig.imapHost,
            imapPort: providerConfig.imapPort,
            imapUser: userInfo.email,
            imapSecure: true,
            oauthAccessTokenEnc: encrypt(tokens.access_token),
            oauthRefreshTokenEnc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
            oauthTokenExpiresAt: tokenExpiresAt,
            oauthConnectionStatus: 'CONNECTED',
            pollInterval: 5,
            isActive: true,
            emailToTicket: true,
          },
        });

        return sendHtml({
          type: 'oauth-success',
          account: { id: account.id, name: account.name, email: account.emailAddress },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OAuth flow failed';
        return sendHtml({ type: 'oauth-error', error: msg });
      }
    },
  );
}
