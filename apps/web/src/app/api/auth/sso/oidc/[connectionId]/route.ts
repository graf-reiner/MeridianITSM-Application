import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ssoPrisma as prisma } from '@/lib/sso/db';

/**
 * GET /api/auth/sso/oidc/[connectionId]
 *
 * Initiates the OIDC SSO flow by redirecting the user to the IdP's
 * authorization endpoint. This is a public endpoint (pre-auth).
 *
 * Query params:
 *   callbackUrl — where to redirect after successful authentication
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  const callbackUrl =
    request.nextUrl.searchParams.get('callbackUrl') ?? '/dashboard/tickets';

  try {
    // Load the SSO connection directly from the database.
    // This is a pre-auth endpoint so we cannot use the authenticated API.
    const connection = await prisma.ssoConnection.findFirst({
      where: { id: connectionId, status: 'active', protocol: 'oidc' },
    });

    if (!connection || !connection.oidcClientId || !connection.oidcIssuerUrl) {
      return NextResponse.redirect(
        new URL('/login?error=Invalid+SSO+connection', request.url),
      );
    }

    // Discover OIDC endpoints from the IdP
    const discoveryUrl =
      connection.oidcDiscoveryUrl ??
      `${connection.oidcIssuerUrl}/.well-known/openid-configuration`;

    const discoveryRes = await fetch(discoveryUrl);
    if (!discoveryRes.ok) {
      console.error(
        'OIDC discovery failed:',
        discoveryRes.status,
        await discoveryRes.text(),
      );
      return NextResponse.redirect(
        new URL('/login?error=SSO+configuration+error', request.url),
      );
    }

    const discovery = await discoveryRes.json();
    const authorizationEndpoint = discovery.authorization_endpoint;

    if (!authorizationEndpoint) {
      return NextResponse.redirect(
        new URL('/login?error=SSO+provider+error', request.url),
      );
    }

    // Generate state and nonce for CSRF protection and replay prevention
    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');

    // Data we need to recover in the callback
    const stateData = JSON.stringify({
      connectionId,
      callbackUrl,
      nonce,
      tenantId: connection.tenantId,
    });

    // Build the IdP authorization URL
    const origin = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set('client_id', connection.oidcClientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set(
      'redirect_uri',
      `${origin}/api/auth/sso/oidc/callback`,
    );
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    // Redirect to IdP, storing state in httpOnly cookies
    const response = NextResponse.redirect(authUrl.toString());

    response.cookies.set('sso_state', state, {
      path: '/',
      maxAge: 10 * 60, // 10 minutes
      sameSite: 'lax',
      httpOnly: true,
    });

    response.cookies.set(
      'sso_data',
      Buffer.from(stateData).toString('base64'),
      {
        path: '/',
        maxAge: 10 * 60,
        sameSite: 'lax',
        httpOnly: true,
      },
    );

    return response;
  } catch (error) {
    console.error('SSO initiation error:', error);
    return NextResponse.redirect(
      new URL('/login?error=SSO+error', request.url),
    );
  }
}
