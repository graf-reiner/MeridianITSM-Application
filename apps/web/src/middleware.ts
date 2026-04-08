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
const JWT_SECRET = process.env.JWT_SECRET || 'meridian-dev-jwt-secret-change-in-production';
const APP_DOMAIN = process.env.APP_DOMAIN || process.env.NEXT_PUBLIC_APP_DOMAIN || '';

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

  const payload = await getTokenPayload(request);

  // ── Extract subdomain for tenant context ──────────────────────────────────
  const host = request.headers.get('host') ?? '';
  const subdomain = extractSubdomain(host);

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
                // Form is public — redirect to the anonymous form renderer
                return NextResponse.redirect(new URL(`/public/forms/${formData.id}`, request.url));
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

  // Support both `roles` (array from API JWT) and `role` (legacy single string)
  const roles = payload.roles ?? (payload.role ? [payload.role] : []);

  // ── MFA enforcement ────────────────────────────────────────────────────────
  // If the JWT has mfaVerified explicitly set to false, redirect to MFA challenge
  if (payload.mfaVerified === false && !pathname.startsWith('/mfa')) {
    return NextResponse.redirect(new URL('/mfa/challenge', request.url));
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
  matcher: ['/((?!api|auth-action|_next/static|_next/image|images|favicon.ico|login|signup|mfa|public).*)'],
};
