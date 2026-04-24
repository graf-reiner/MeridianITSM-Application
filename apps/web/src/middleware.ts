import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// ─── JWT Token Payload ────────────────────────────────────────────────────────

interface JwtPayload {
  roles?: string[];
  role?: string;
  sub?: string;
  tenantId?: string;
  mfaVerified?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH_COOKIE_NAME = 'meridian_session';
const REFRESH_COOKIE_NAME = 'meridian_refresh';
const JWT_SECRET = process.env.JWT_SECRET || 'meridian-dev-jwt-secret-change-in-production';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const APP_DOMAIN = process.env.APP_DOMAIN || process.env.NEXT_PUBLIC_APP_DOMAIN || '';

// ─── Silent Token Refresh ─────────────────────────────────────────────────────

/**
 * Exchange an expired access token for a fresh pair using the refresh cookie.
 * Returns new tokens on success, null if refresh token is missing or invalid.
 * Resetting the refresh cookie maxAge each call implements the sliding 60-min window.
 */
async function tryRefresh(
  request: NextRequest,
): Promise<{ accessToken: string; refreshToken: string; payload: JwtPayload } | null> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;

    const data = await res.json() as { accessToken: string; refreshToken: string };
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(data.accessToken, secret);
    return { accessToken: data.accessToken, refreshToken: data.refreshToken, payload: payload as JwtPayload };
  } catch {
    return null;
  }
}

// ─── Subdomain Extraction ───────────────────────────────────────────────────

// Infrastructure subdomains that are NOT tenant vanity domains
const RESERVED_SUBDOMAINS = new Set(['app-dev', 'app', 'www', 'api', 'admin', 'owner', 'staging']);

/**
 * Extract tenant subdomain from the Host header.
 * e.g., "default.meridianitsm.com" with APP_DOMAIN="meridianitsm.com" → "default"
 * Returns null for the base domain, reserved subdomains, or multi-level subdomains.
 */
function extractSubdomain(host: string): string | null {
  if (!APP_DOMAIN) return null;
  const hostWithoutPort = host.split(':')[0];
  const domainWithoutPort = APP_DOMAIN.split(':')[0];
  if (hostWithoutPort === domainWithoutPort) return null;
  if (!hostWithoutPort.endsWith(`.${domainWithoutPort}`)) return null;
  const subdomain = hostWithoutPort.slice(0, -(domainWithoutPort.length + 1));
  if (!subdomain || subdomain.includes('.')) return null;
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null;
  return subdomain;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract and verify JWT from cookie or Authorization header.
 * Returns the decoded payload or null if missing/invalid.
 */
async function getTokenPayload(request: NextRequest): Promise<JwtPayload | null> {
  let token: string | undefined;

  // Try cookie first (primary auth path)
  const cookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (cookie?.value) {
    token = cookie.value;
  }

  // Fall back to Authorization: Bearer header
  if (!token) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload as JwtPayload;
  } catch {
    // Token invalid or expired
    return null;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Extract subdomain for tenant context ──────────────────────────────────
  const host = request.headers.get('host') ?? '';
  const subdomain = extractSubdomain(host);

  // ── Resolve auth — try existing token, then silent refresh ────────────────
  let payload = await getTokenPayload(request);
  let refreshed: { accessToken: string; refreshToken: string } | null = null;

  if (!payload) {
    const result = await tryRefresh(request);
    if (result) {
      payload = result.payload;
      refreshed = { accessToken: result.accessToken, refreshToken: result.refreshToken };
    }
  }

  // ── Redirect unauthenticated users to /login ──────────────────────────────
  if (!payload) {
    // If we have a subdomain, resolve it to the actual tenant slug
    let resolvedSlug: string | null = null;
    if (subdomain) {
      try {
        const apiBase = process.env.API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiBase}/api/v1/public/resolve-subdomain/${encodeURIComponent(subdomain)}`);
        if (res.ok) {
          const data = await res.json() as { slug?: string };
          resolvedSlug = data.slug ?? null;
        }
      } catch {
        // Resolution failed — fall through to normal login
      }

      // If this is a portal form URL, check if the form allows anonymous access
      if (resolvedSlug) {
        const formMatch = pathname.match(/^\/portal\/forms\/([^/]+)$/);
        if (formMatch) {
          try {
            const apiBase = process.env.API_URL || 'http://localhost:4000';
            const formRes = await fetch(
              `${apiBase}/api/v1/public/forms/by-slug/${encodeURIComponent(resolvedSlug)}/${encodeURIComponent(formMatch[1])}`,
            );
            if (formRes.ok) {
              const formData = await formRes.json() as { id?: string; requireAuth?: boolean };
              if (formData.id && formData.requireAuth === false) {
                // Form is public — redirect to the slug-based anonymous form renderer
                return NextResponse.redirect(new URL(`/public/forms/${resolvedSlug}/${formMatch[1]}`, request.url));
              }
            }
          } catch {
            // Form check failed — fall through to login
          }
        }
      }
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    if (resolvedSlug) {
      // Pass the resolved slug and flag so login page hides the tenant field
      loginUrl.searchParams.set('tenant', resolvedSlug);
      loginUrl.searchParams.set('fromSubdomain', '1');
    }
    return NextResponse.redirect(loginUrl);
  }

  // ── Set subdomain cookie for tenant-aware pages ───────────────────────────
  const response = NextResponse.next();
  if (subdomain) {
    response.cookies.set('meridian_subdomain', subdomain, { path: '/', httpOnly: false });
  }

  // ── Write refreshed tokens (sliding 60-min inactivity window) ────────────
  if (refreshed) {
    response.cookies.set('meridian_session', refreshed.accessToken, {
      path: '/', maxAge: 15 * 60, sameSite: 'lax', httpOnly: false,
    });
    response.cookies.set('meridian_refresh', refreshed.refreshToken, {
      path: '/', maxAge: 60 * 60, sameSite: 'lax', httpOnly: true,
    });
  }

  // Support both `roles` (array from API JWT) and `role` (legacy single string)
  const roles = payload.roles ?? (payload.role ? [payload.role] : []);

  // ── MFA enforcement ────────────────────────────────────────────────────────
  // If the JWT has mfaVerified explicitly set to false, redirect to MFA challenge.
  // Carry any just-refreshed tokens so the MFA page can authenticate properly.
  if (payload.mfaVerified === false && !pathname.startsWith('/mfa')) {
    const mfaRedirect = NextResponse.redirect(new URL('/mfa/challenge', request.url));
    if (refreshed) {
      mfaRedirect.cookies.set('meridian_session', refreshed.accessToken, {
        path: '/', maxAge: 15 * 60, sameSite: 'lax', httpOnly: false,
      });
      mfaRedirect.cookies.set('meridian_refresh', refreshed.refreshToken, {
        path: '/', maxAge: 60 * 60, sameSite: 'lax', httpOnly: true,
      });
    }
    return mfaRedirect;
  }

  // ── end_user accessing /dashboard → redirect to /portal ──────────────────
  if (roles.includes('end_user') && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/portal', request.url));
  }

  // ── All other roles can access /portal (staff can view portal too) ─────────
  // No restriction needed — allow staff to view the portal if desired.

  return response;
}

// ─── Matcher ─────────────────────────────────────────────────────────────────

/**
 * CRITICAL: Must exclude /api routes to prevent redirect loops on
 * TanStack Query fetches and Next.js internal paths.
 */
export const config = {
  matcher: ['/((?!api|auth-action|_next/static|_next/image|images|favicon.ico|login|signup|mfa|public|suspended|billing).*)'],
};
