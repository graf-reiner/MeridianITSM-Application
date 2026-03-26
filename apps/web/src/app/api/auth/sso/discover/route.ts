import { NextRequest, NextResponse } from 'next/server';
import { ssoPrisma as prisma } from '@/lib/sso/db';

/**
 * GET /api/auth/sso/discover?tenantSlug=<slug>
 *
 * Public endpoint (pre-auth) that returns active SSO connections
 * and auth policy for a given tenant. Used by the login page to
 * render SSO sign-in buttons.
 */
export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenantSlug');

  if (!tenantSlug) {
    return NextResponse.json({ connections: [], allowLocalAuth: true });
  }

  try {
    // Resolve tenant by slug
    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: 'ACTIVE' },
    });

    if (!tenant) {
      return NextResponse.json({ connections: [], allowLocalAuth: true });
    }

    // Get active SSO connections (only return public-safe fields)
    const connections = await prisma.ssoConnection.findMany({
      where: { tenantId: tenant.id, status: 'active' },
      select: { id: true, name: true, protocol: true },
    });

    // Get tenant auth settings
    const authSettings = await prisma.tenantAuthSettings.findUnique({
      where: { tenantId: tenant.id },
    });

    return NextResponse.json({
      connections,
      tenantId: tenant.id,
      allowLocalAuth: authSettings?.allowLocalAuth ?? true,
      enforceSso: authSettings?.enforceSso ?? false,
    });
  } catch (error) {
    console.error('SSO discovery error:', error);
    return NextResponse.json({ connections: [], allowLocalAuth: true });
  }
}
