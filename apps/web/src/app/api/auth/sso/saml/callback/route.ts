import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { getJacksonInstance } from '@/lib/sso/saml-jackson';
import { ssoPrisma as prisma } from '@/lib/sso/db';

const JWT_SECRET =
  process.env.JWT_SECRET ?? 'meridian-dev-jwt-secret-change-in-production';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=Missing+authorization+code', request.url),
    );
  }

  try {
    const { oauthController } = await getJacksonInstance();

    // Exchange code for user profile
    const tokenRes = await oauthController.token({
      code,
      grant_type: 'authorization_code',
      client_id: 'dummy',
      client_secret: 'dummy',
      redirect_uri: `${process.env.NEXTAUTH_URL ?? request.nextUrl.origin}/api/auth/sso/saml/callback`,
    } as any);

    const profileRaw = await oauthController.userInfo(tokenRes.access_token);
    const profile = profileRaw as any; // Use any to avoid strict typing issues with Jackson Profile

    const email = profile.email as string;
    if (!email) {
      return NextResponse.redirect(
        new URL('/login?error=No+email+in+SAML+response', request.url),
      );
    }

    // Parse state to get tenant info
    let callbackUrl = '/dashboard/tickets';
    let tenantId = '';

    if (state) {
      try {
        const stateData = JSON.parse(
          Buffer.from(state, 'base64').toString(),
        );
        callbackUrl = stateData.callbackUrl ?? callbackUrl;
        tenantId = stateData.tenantId ?? '';
      } catch {
        // State might be plain text — ignore parse errors
      }
    }

    // If no tenantId from state, look up from the SAML connection
    if (!tenantId) {
      const profileAny = profile as any;
      const tenant = profileAny?.requested?.tenant as string | undefined;
      if (tenant) {
        const tenantRecord = await prisma.tenant.findFirst({
          where: { id: tenant },
        });
        if (tenantRecord) tenantId = tenantRecord.id;
      }
    }

    // If still no tenantId, try to find user by email
    if (!tenantId) {
      const existingUser = await prisma.user.findFirst({
        where: { email },
      });
      if (existingUser) tenantId = existingUser.tenantId;
    }

    if (!tenantId) {
      return NextResponse.redirect(
        new URL('/login?error=Could+not+determine+tenant', request.url),
      );
    }

    // Find SSO connection for this tenant
    const connection = await prisma.ssoConnection.findFirst({
      where: { tenantId, protocol: 'saml', status: 'active' },
    });

    // ── JIT User Provisioning ───────────────────────────────────────────────
    let user = await prisma.user.findFirst({
      where: { email, tenantId },
    });

    if (!user && connection?.autoProvision) {
      const name = profile.firstName
        ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
        : email;
      const nameParts = name.split(' ');

      user = await prisma.user.create({
        data: {
          tenantId,
          email,
          firstName: nameParts[0] ?? email,
          lastName: nameParts.slice(1).join(' ') || 'SSO User',
          passwordHash: '',
          status: 'ACTIVE',
        },
      });

      // Assign default role
      const defaultRole = await prisma.role.findFirst({
        where: { tenantId, slug: connection.defaultRole ?? 'agent' },
      });
      if (defaultRole) {
        await prisma.userRole.create({
          data: { tenantId, userId: user.id, roleId: defaultRole.id },
        });
      }
    }

    if (!user) {
      return NextResponse.redirect(
        new URL('/login?error=User+not+found', request.url),
      );
    }

    // ── Upsert Federated Identity ─────────────────────────────────────────
    const providerId =
      (profile as Record<string, unknown>).id as string ??
      (profile as Record<string, unknown>).sub as string ??
      email;

    await prisma.federatedIdentity.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'saml',
          providerAccountId: providerId,
        },
      },
      update: {
        lastLoginAt: new Date(),
        rawClaims: JSON.parse(JSON.stringify(profile)),
        displayName: profile.firstName
          ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
          : email,
        email,
      },
      create: {
        userId: user.id,
        provider: 'saml',
        providerAccountId: providerId,
        email,
        displayName: profile.firstName
          ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
          : email,
        lastLoginAt: new Date(),
        rawClaims: JSON.parse(JSON.stringify(profile)),
      },
    });

    // ── Load user roles ───────────────────────────────────────────────────
    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id, tenantId },
      include: { role: true },
    });
    const roles = userRoles.map((ur) => ur.role.slug);

    // ── Generate JWT (same format as existing auth system) ────────────────
    const secret = new TextEncoder().encode(JWT_SECRET);
    const accessToken = await new SignJWT({
      userId: user.id,
      tenantId,
      email: user.email,
      roles,
      type: 'access',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);

    // ── Set session cookie and redirect ───────────────────────────────────
    const response = NextResponse.redirect(
      new URL(callbackUrl, request.url),
    );

    response.cookies.set('meridian_session', accessToken, {
      path: '/',
      maxAge: 15 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch (error) {
    console.error('SAML callback error:', error);
    return NextResponse.redirect(
      new URL('/login?error=SAML+authentication+failed', request.url),
    );
  }
}
