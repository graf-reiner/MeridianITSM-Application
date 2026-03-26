import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet, SignJWT } from 'jose';
import { ssoPrisma as prisma } from '@/lib/sso/db';
import { decrypt } from '@/lib/sso/encryption';
import { sanitizeDisplayName } from '@/lib/sso/sanitize';

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'meridian-dev-jwt-secret-change-in-production';

interface SsoStateData {
  connectionId: string;
  callbackUrl: string;
  nonce: string;
  tenantId: string;
}

/**
 * GET /api/auth/sso/oidc/callback
 *
 * Handles the OIDC IdP callback after the user authenticates.
 * Exchanges the authorization code for tokens, validates the ID token,
 * performs JIT user provisioning, creates a federated identity link,
 * and sets the session cookie in the same format as the existing auth system.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const error = request.nextUrl.searchParams.get('error');
  const errorDescription = request.nextUrl.searchParams.get('error_description');

  // Handle IdP-reported errors
  if (error) {
    const msg = errorDescription ?? error;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/login?error=Missing+authorization+code', request.url),
    );
  }

  // ── Validate state cookie ───────────────────────────────────────────────────
  const storedState = request.cookies.get('sso_state')?.value;
  const ssoDataB64 = request.cookies.get('sso_data')?.value;

  if (!storedState || storedState !== state || !ssoDataB64) {
    return NextResponse.redirect(
      new URL('/login?error=Invalid+state', request.url),
    );
  }

  let ssoData: SsoStateData;
  try {
    ssoData = JSON.parse(Buffer.from(ssoDataB64, 'base64').toString());
  } catch {
    return NextResponse.redirect(
      new URL('/login?error=Invalid+state+data', request.url),
    );
  }

  try {
    // ── Load SSO connection ─────────────────────────────────────────────────
    const connection = await prisma.ssoConnection.findFirst({
      where: {
        id: ssoData.connectionId,
        status: 'active',
        protocol: 'oidc',
      },
    });

    if (
      !connection ||
      !connection.oidcClientId ||
      !connection.oidcClientSecret ||
      !connection.oidcIssuerUrl
    ) {
      return NextResponse.redirect(
        new URL('/login?error=SSO+connection+not+found', request.url),
      );
    }

    // Decrypt the client secret (encrypted at rest with AES-256-GCM)
    const clientSecret = decrypt(connection.oidcClientSecret);

    // ── OIDC Discovery ──────────────────────────────────────────────────────
    const discoveryUrl =
      connection.oidcDiscoveryUrl ??
      `${connection.oidcIssuerUrl}/.well-known/openid-configuration`;
    const discovery = await (await fetch(discoveryUrl)).json();

    // ── Exchange authorization code for tokens ──────────────────────────────
    const origin = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${origin}/api/auth/sso/oidc/callback`,
        client_id: connection.oidcClientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('OIDC token exchange failed:', err);
      return NextResponse.redirect(
        new URL('/login?error=Token+exchange+failed', request.url),
      );
    }

    const tokens = await tokenRes.json();
    const idToken = tokens.id_token;

    if (!idToken) {
      return NextResponse.redirect(
        new URL('/login?error=No+ID+token', request.url),
      );
    }

    // ── Verify ID token with IdP's JWKS ─────────────────────────────────────
    const JWKS = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const { payload: claims } = await jwtVerify(idToken, JWKS, {
      issuer: connection.oidcIssuerUrl,
      audience: connection.oidcClientId,
    });

    const email = claims.email as string | undefined;
    const name = sanitizeDisplayName(
      (claims.name as string) ??
      (claims.preferred_username as string) ??
      email,
    ) || 'SSO User';

    if (!email) {
      return NextResponse.redirect(
        new URL('/login?error=No+email+in+SSO+response', request.url),
      );
    }

    // ── JIT User Provisioning ───────────────────────────────────────────────
    let user = await prisma.user.findFirst({
      where: { email, tenantId: connection.tenantId },
    });

    if (!user && connection.autoProvision) {
      // Create a local user for this SSO identity
      const nameParts = name.split(' ');
      user = await prisma.user.create({
        data: {
          tenantId: connection.tenantId,
          email,
          firstName: nameParts[0] ?? email,
          lastName: nameParts.slice(1).join(' ') || 'SSO User',
          passwordHash: '', // No password for SSO-only users
          status: 'ACTIVE',
        },
      });

      // Assign the default role configured on the SSO connection
      const defaultRole = await prisma.role.findFirst({
        where: {
          tenantId: connection.tenantId,
          slug: connection.defaultRole,
        },
      });
      if (defaultRole) {
        await prisma.userRole.create({
          data: {
            tenantId: connection.tenantId,
            userId: user.id,
            roleId: defaultRole.id,
          },
        });
      }
    }

    if (!user) {
      return NextResponse.redirect(
        new URL(
          '/login?error=User+not+found+and+auto-provisioning+disabled',
          request.url,
        ),
      );
    }

    // ── Upsert Federated Identity ───────────────────────────────────────────
    await prisma.federatedIdentity.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'oidc',
          providerAccountId: claims.sub as string,
        },
      },
      update: {
        lastLoginAt: new Date(),
        rawClaims: JSON.parse(JSON.stringify(claims)),
        displayName: name,
        email,
      },
      create: {
        userId: user.id,
        provider: 'oidc',
        providerAccountId: claims.sub as string,
        email,
        displayName: name,
        lastLoginAt: new Date(),
        rawClaims: JSON.parse(JSON.stringify(claims)),
      },
    });

    // ── Load user roles ─────────────────────────────────────────────────────
    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id, tenantId: connection.tenantId },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.slug);

    // ── Generate JWT (same format as existing auth system) ──────────────────
    // The middleware at apps/web/src/middleware.ts validates this JWT,
    // expecting: roles[], sub, tenantId.
    const secret = new TextEncoder().encode(JWT_SECRET);
    const accessToken = await new SignJWT({
      userId: user.id,
      tenantId: connection.tenantId,
      email: user.email,
      roles,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);

    // ── Set session cookie and redirect ─────────────────────────────────────
    const response = NextResponse.redirect(
      new URL(ssoData.callbackUrl || '/dashboard/tickets', request.url),
    );

    response.cookies.set('meridian_session', accessToken, {
      path: '/',
      maxAge: 15 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });

    // Clean up SSO state cookies
    response.cookies.delete('sso_state');
    response.cookies.delete('sso_data');

    return response;
  } catch (error) {
    console.error('SSO callback error:', error);
    return NextResponse.redirect(
      new URL('/login?error=SSO+authentication+failed', request.url),
    );
  }
}
