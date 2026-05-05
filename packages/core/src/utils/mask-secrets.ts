// ─── Secret masking helpers ──────────────────────────────────────────────────
// Use at the log boundary, not at the call site. Pass headers/payload through
// these helpers before structured logs, audit trails, or error reports.
//
// Names matched here are case-insensitive substrings — anything containing
// "secret", "token", "password", or matching the standard auth headers is
// flattened to the literal "****" so the actual value never reaches stdout
// or a database column.

export const MASKED = '****' as const;

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-meridian-signature',
]);

const SENSITIVE_KEY_PATTERN = /(secret|token|password|apikey|api[_-]?key|signature|bearer|credentials?)/i;

/**
 * True when a single field/header name should have its value masked.
 */
export function isSensitiveKey(name: string): boolean {
  if (!name) return false;
  if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) return true;
  return SENSITIVE_KEY_PATTERN.test(name);
}

/**
 * Returns a shallow copy of headers with sensitive values replaced by "****".
 * Header name comparison is case-insensitive; original keys are preserved.
 */
export function maskHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k] = isSensitiveKey(k) ? MASKED : v;
  }
  return out;
}

/**
 * Returns a shallow copy of an object with sensitive values masked. Does not
 * recurse — pass nested objects through this function explicitly when the
 * shape is known.
 */
export function maskObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSensitiveKey(k) ? MASKED : v;
  }
  return out as T;
}
