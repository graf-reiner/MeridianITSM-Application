import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/api/auth', '/_next', '/favicon.ico'];

/**
 * Parse an IPv4 address string into a 32-bit integer for CIDR comparison.
 * Returns null if the string is not a valid IPv4 address.
 */
function parseIpv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0; // unsigned 32-bit
}

/**
 * Check if an IP address is within a CIDR range or matches exactly.
 * Supports exact IP and /8, /16, /24, /32 CIDR notation.
 * Runs in Edge runtime (no Node.js net module available).
 */
function isIpAllowed(clientIp: string, allowlist: string[]): boolean {
  const clientInt = parseIpv4(clientIp);
  if (clientInt === null) return false;

  for (const entry of allowlist) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (trimmed.includes('/')) {
      // CIDR notation
      const [networkStr, prefixStr] = trimmed.split('/');
      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) continue;

      const networkInt = parseIpv4(networkStr);
      if (networkInt === null) continue;

      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      if ((clientInt & mask) >>> 0 === (networkInt & mask) >>> 0) {
        return true;
      }
    } else {
      // Exact IP match
      if (clientIp === trimmed) return true;
    }
  }

  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  // IP allowlist check — runs BEFORE JWT verification to fail fast
  const ipAllowlistEnv = process.env.OWNER_ADMIN_IP_ALLOWLIST;
  if (ipAllowlistEnv && ipAllowlistEnv.trim().length > 0) {
    const allowlist = ipAllowlistEnv.split(',').map(ip => ip.trim()).filter(Boolean);

    if (allowlist.length > 0) {
      // Get client IP from standard headers (Cloudflare, proxies, or direct)
      const clientIp =
        request.headers.get('cf-connecting-ip') ??
        request.headers.get('x-real-ip') ??
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        '127.0.0.1';

      if (!isIpAllowed(clientIp, allowlist)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }
  // If OWNER_ADMIN_IP_ALLOWLIST is not set or empty, skip IP check (development mode)

  // All other /api/* routes require owner auth
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const secret = new TextEncoder().encode(process.env.OWNER_JWT_SECRET);
      await jwtVerify(authHeader.slice(7), secret);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
