'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function loginAction(
  email: string,
  password: string,
  tenantSlug: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Forward the trusted device cookie so the backend can skip MFA if valid
    const cookieStore = await cookies();
    const trustCookie = cookieStore.get('meridian_mfa_trust');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (trustCookie?.value) {
      headers['Cookie'] = `meridian_mfa_trust=${trustCookie.value}`;
    }

    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, tenantSlug }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error ?? `Login failed (${res.status})` };
    }

    const data = await res.json();

    if (!data.accessToken) {
      return { success: false, error: 'Server did not return an access token' };
    }

    // Set cookie server-side — this is reliable regardless of browser/network quirks
    cookieStore.set('meridian_session', data.accessToken, {
      path: '/',
      maxAge: 15 * 60,
      sameSite: 'lax',
      httpOnly: false, // needs to be readable by client-side code
    });

    return { success: true };
  } catch {
    return { success: false, error: 'Unable to connect to server' };
  }
}
