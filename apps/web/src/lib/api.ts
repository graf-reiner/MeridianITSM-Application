/**
 * Authenticated fetch wrapper.
 * Reads the meridian_session cookie and sends it as a Bearer token
 * to the API server (proxied via Next.js rewrites).
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getSessionToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');

  return fetch(path, {
    ...options,
    headers,
  });
}

function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)meridian_session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
