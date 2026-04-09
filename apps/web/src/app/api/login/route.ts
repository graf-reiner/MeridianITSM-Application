import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let email: string, password: string, tenantSlug: string, callbackUrl: string;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // HTML form submission
      const formData = await request.formData();
      email = formData.get('email') as string;
      password = formData.get('password') as string;
      tenantSlug = (formData.get('tenantSlug') as string) || 'msp-default';
      callbackUrl = (formData.get('callbackUrl') as string) || '/dashboard/tickets';
    } else {
      // JSON fetch
      const body = await request.json();
      email = body.email;
      password = body.password;
      tenantSlug = body.tenantSlug || 'msp-default';
      callbackUrl = body.callbackUrl || '/dashboard/tickets';
    }

    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantSlug }),
    });

    const data = await res.json();

    if (!res.ok || !data.accessToken) {
      // Redirect back to login with error
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('error', data.error ?? 'Login failed');
      return NextResponse.redirect(loginUrl);
    }

    // Redirect to dashboard with cookie set
    const redirectUrl = new URL(callbackUrl, request.url);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set('meridian_session', data.accessToken, {
      path: '/',
      maxAge: 15 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });

    return response;
  } catch {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'Unable to connect to server');
    return NextResponse.redirect(loginUrl);
  }
}
