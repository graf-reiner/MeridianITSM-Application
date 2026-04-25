import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * POST /api/v1/auth/logout
 * Forwards to the Fastify API and clears both session cookies.
 * This Next.js route takes precedence over the /api/* proxy rewrite so we
 * can guarantee both meridian_session and meridian_refresh are cleared.
 */
export async function POST(request: NextRequest) {
  try {
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    });
  } catch {
    // Best-effort — always clear cookies even if the API is unreachable
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('meridian_session', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  response.cookies.set('meridian_refresh', '', { path: '/', maxAge: 0, sameSite: 'lax', httpOnly: true });
  return response;
}
