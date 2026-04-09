// ─── Plan Gate Error Types ───────────────────────────────────────────────────

export interface PlanGateError {
  error: 'PLAN_LIMIT_EXCEEDED' | 'SUBSCRIPTION_INACTIVE' | 'NO_SUBSCRIPTION';
  feature?: string;
  limit?: number;
  current?: number;
  status?: string;
  upgradeTier?: string;
}

/**
 * Custom event dispatched when a 402 response is received from the API.
 * Listen for this in layout components to show upgrade prompts.
 */
export const PLAN_GATE_EVENT = 'meridian:plan-gate-error';

/**
 * Authenticated fetch wrapper.
 * Reads the meridian_session cookie and sends it as a Bearer token
 * to the API server (proxied via Next.js rewrites).
 *
 * Intercepts 402 responses from planGate and dispatches a custom event
 * so the UI can show an upgrade modal.
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

  const response = await fetch(path, {
    ...options,
    headers,
  });

  // Intercept 402 Payment Required from planGate
  if (response.status === 402 && typeof window !== 'undefined') {
    try {
      const cloned = response.clone();
      const body = await cloned.json() as PlanGateError;
      window.dispatchEvent(
        new CustomEvent(PLAN_GATE_EVENT, { detail: body }),
      );
    } catch {
      // Non-JSON 402 — still dispatch with generic error
      window.dispatchEvent(
        new CustomEvent(PLAN_GATE_EVENT, {
          detail: { error: 'SUBSCRIPTION_INACTIVE' } as PlanGateError,
        }),
      );
    }
  }

  return response;
}

function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)meridian_session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
