import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward the trusted device cookie so the backend can skip MFA if valid
    const trustCookie = request.cookies.get('meridian_mfa_trust');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (trustCookie?.value) {
      headers['Cookie'] = `meridian_mfa_trust=${trustCookie.value}`;
    }

    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || !data.accessToken) {
      return NextResponse.json(
        { error: data.error ?? 'Login failed' },
        { status: res.status },
      );
    }

    // Set the cookie via Set-Cookie header and return success
    const response = NextResponse.json({ success: true });
    response.cookies.set('meridian_session', data.accessToken, {
      path: '/',
      maxAge: 15 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Unable to connect to authentication server' },
      { status: 502 },
    );
  }
}
