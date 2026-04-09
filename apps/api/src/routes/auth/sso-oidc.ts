import type { FastifyInstance } from 'fastify';
import * as client from 'openid-client';
import { prisma } from '@meridian/db';
import { decrypt } from '../../lib/encryption.js';
import { getUserRoles, generateTokens } from '../../services/auth.service.js';
import { hashSync } from '@node-rs/bcrypt';
import crypto from 'crypto';

/**
 * SSO OIDC Authentication Routes (unauthenticated — public)
 *
 * GET /api/auth/sso/oidc/:connectionId/authorize — Redirect to IdP
 * GET /api/auth/sso/oidc/callback                — Handle IdP callback
 * GET /api/auth/sso/connections/:tenantSlug       — List available SSO connections for a tenant
 */
export async function ssoOidcRoutes(app: FastifyInstance): Promise<void> {
  // ─── List SSO connections for tenant (public, used by login page) ──────────

  app.get('/api/auth/sso/connections/:tenantSlug', async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!tenant) {
      return reply.status(200).send([]);
    }

    const connections = await prisma.ssoConnection.findMany({
      where: { tenantId: tenant.id, status: 'active', protocol: 'oidc' },
      select: { id: true, name: true, protocol: true },
    });

    return reply.status(200).send(connections);
  });

  // ─── Authorize: redirect user to IdP ───────────────────────────────────────

  app.get('/api/auth/sso/oidc/:connectionId/authorize', async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const query = request.query as { callbackUrl?: string };

    const connection = await prisma.ssoConnection.findFirst({
      where: { id: connectionId, status: 'active', protocol: 'oidc' },
      include: { tenant: { select: { id: true, slug: true } } },
    });

    if (!connection) {
      return reply.status(404).send({ error: 'SSO connection not found' });
    }

    if (!connection.oidcIssuerUrl || !connection.oidcClientId || !connection.oidcClientSecret) {
      return reply.status(400).send({ error: 'OIDC connection is not fully configured' });
    }

    // Discover OIDC configuration
    const issuerUrl = new URL(connection.oidcIssuerUrl);
    const config = await client.discovery(issuerUrl, connection.oidcClientId, decrypt(connection.oidcClientSecret));

    // Generate state with connection context
    const state = Buffer.from(JSON.stringify({
      connectionId: connection.id,
      tenantId: connection.tenantId,
      tenantSlug: connection.tenant.slug,
      callbackUrl: query.callbackUrl || '/dashboard',
    })).toString('base64url');

    const nonce = crypto.randomBytes(16).toString('hex');
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    // Store PKCE verifier + nonce in a short-lived record
    // Use a simple Redis key or fallback to a cookie
    const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/auth/sso/oidc/callback`;

    // Store verifier in encrypted cookie
    reply.setCookie('sso_pkce', JSON.stringify({ codeVerifier, nonce, connectionId: connection.id }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/api/auth/sso/oidc/callback',
    });

    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return reply.redirect(authUrl.href);
  });

  // ─── Callback: exchange code for tokens, create/find user ──────────────────

  app.get('/api/auth/sso/oidc/callback', async (request, reply) => {
    const query = request.query as Record<string, string>;

    // Parse state
    let stateData: { connectionId: string; tenantId: string; tenantSlug: string; callbackUrl: string };
    try {
      stateData = JSON.parse(Buffer.from(query.state ?? '', 'base64url').toString());
    } catch {
      return reply.status(400).send({ error: 'Invalid state parameter' });
    }

    // Get PKCE data from cookie
    const pkceCookie = request.cookies?.sso_pkce;
    if (!pkceCookie) {
      return reply.status(400).send({ error: 'Missing PKCE cookie — session expired' });
    }

    let pkceData: { codeVerifier: string; nonce: string; connectionId: string };
    try {
      pkceData = JSON.parse(pkceCookie);
    } catch {
      return reply.status(400).send({ error: 'Invalid PKCE cookie' });
    }

    if (pkceData.connectionId !== stateData.connectionId) {
      return reply.status(400).send({ error: 'Connection mismatch' });
    }

    // Load SSO connection
    const connection = await prisma.ssoConnection.findFirst({
      where: { id: stateData.connectionId, status: 'active', protocol: 'oidc' },
    });

    if (!connection || !connection.oidcIssuerUrl || !connection.oidcClientId || !connection.oidcClientSecret) {
      return reply.status(400).send({ error: 'SSO connection not found or incomplete' });
    }

    try {
      // Discover and exchange code
      const issuerUrl = new URL(connection.oidcIssuerUrl);
      const config = await client.discovery(issuerUrl, connection.oidcClientId, decrypt(connection.oidcClientSecret));

      const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/auth/sso/oidc/callback`;
      const currentUrl = new URL(`${redirectUri}?${new URLSearchParams(query)}`);

      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: pkceData.codeVerifier,
        expectedNonce: pkceData.nonce,
        expectedState: query.state,
      });

      const claims = tokens.claims();
      if (!claims) {
        return reply.status(400).send({ error: 'No claims in token response' });
      }

      const email = (claims.email as string)?.toLowerCase();
      const sub = claims.sub as string;
      const displayName = (claims.name as string) ?? (claims.preferred_username as string) ?? email;

      if (!email) {
        return reply.status(400).send({ error: 'IdP did not return an email claim' });
      }

      // Find or create user via JIT provisioning
      const tenantId = stateData.tenantId;
      let user = await prisma.user.findFirst({
        where: { tenantId, email },
      });

      if (!user && connection.autoProvision) {
        // JIT provision: create user with default role
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] ?? email.split('@')[0];
        const lastName = nameParts.slice(1).join(' ') || '';

        user = await prisma.user.create({
          data: {
            tenantId,
            email,
            firstName,
            lastName,
            displayName,
            passwordHash: hashSync(crypto.randomBytes(32).toString('hex'), 12), // Random password (SSO-only)
            status: 'ACTIVE',
          },
        });

        // Assign default role
        const defaultRole = await prisma.role.findFirst({
          where: { tenantId, slug: connection.defaultRole },
        });
        if (defaultRole) {
          await prisma.userRole.create({
            data: { userId: user.id, tenantId, roleId: defaultRole.id },
          });
        }
      }

      if (!user) {
        return reply.status(403).send({
          error: 'No account found and auto-provisioning is disabled for this SSO connection',
        });
      }

      if (user.status !== 'ACTIVE') {
        return reply.status(403).send({ error: 'Account is disabled' });
      }

      // Upsert federated identity
      await prisma.federatedIdentity.upsert({
        where: {
          provider_providerAccountId: {
            provider: `oidc:${connection.id}`,
            providerAccountId: sub,
          },
        },
        create: {
          userId: user.id,
          provider: `oidc:${connection.id}`,
          providerAccountId: sub,
          email,
          displayName,
          rawClaims: claims as Record<string, unknown>,
          lastLoginAt: new Date(),
        },
        update: {
          email,
          displayName,
          rawClaims: claims as Record<string, unknown>,
          lastLoginAt: new Date(),
        },
      });

      // Generate session tokens
      const roles = await getUserRoles(user.id, tenantId);
      const sessionTokens = generateTokens(
        { userId: user.id, tenantId, email: user.email, roles },
        app,
        { mfaVerified: !connection.forceMfa },
      );

      // Clear PKCE cookie
      reply.clearCookie('sso_pkce', { path: '/api/auth/sso/oidc/callback' });

      // Redirect to web app with token
      const webOrigin = process.env.WEB_URL || 'http://localhost:3000';
      const callbackUrl = stateData.callbackUrl || '/dashboard';
      const redirectUrl = `${webOrigin}/login/callback?token=${encodeURIComponent(sessionTokens.accessToken)}&next=${encodeURIComponent(callbackUrl)}`;

      return reply.redirect(redirectUrl);
    } catch (err) {
      console.error('[SSO OIDC] Callback error:', err instanceof Error ? err.message : err);
      const webOrigin = process.env.WEB_URL || 'http://localhost:3000';
      return reply.redirect(`${webOrigin}/login?error=${encodeURIComponent('SSO authentication failed')}`);
    }
  });
}
