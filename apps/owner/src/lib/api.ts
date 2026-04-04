/**
 * Authenticated fetch wrapper for Owner Admin.
 * Automatically refreshes expired access tokens using the stored refresh token.
 * Redirects to login if both tokens are invalid.
 */

function redirectToLogin(): never {
  localStorage.removeItem('owner_token');
  localStorage.removeItem('owner_refresh_token');
  window.location.href = '/';
  // Throw to stop any calling code from processing a stale response
  throw new Error('Session expired — redirecting to login');
}

export async function ownerFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('owner_token');
  if (!token) redirectToLogin();

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(url, { ...init, headers });

  // If 401, try refreshing the token
  if (res.status === 401) {
    const refreshToken = localStorage.getItem('owner_refresh_token');
    if (!refreshToken) redirectToLogin();

    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshRes.ok) redirectToLogin();

    const data = await refreshRes.json();
    localStorage.setItem('owner_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('owner_refresh_token', data.refreshToken);

    // Retry the original request with the new token
    headers.set('Authorization', `Bearer ${data.accessToken}`);
    res = await fetch(url, { ...init, headers });

    // If still 401 after refresh, give up
    if (res.status === 401) redirectToLogin();
  }

  return res;
}
