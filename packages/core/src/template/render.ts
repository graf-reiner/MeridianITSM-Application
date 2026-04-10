import type { RenderTemplateOptions } from './types.js';

/**
 * The one template renderer used everywhere in MeridianITSM.
 *
 * - Matches `{{path.to.value}}` tokens and replaces them with values
 *   walked from the given context object by dotted path.
 * - Missing / null / undefined values fall back to `options.fallback`
 *   (default `""`).
 * - With `options.escapeHtml`, resolved values are HTML-escaped so the
 *   output is safe to drop into an HTML email body.
 * - Unknown tokens (paths that resolve to `undefined`) fall back silently —
 *   we do NOT leave `{{missing}}` in the output because that would leak
 *   to end users.
 * - Malformed tokens (e.g. `{{foo` without a closing `}}`) are left
 *   untouched so users can see exactly what they typed.
 *
 * Pure function, zero dependencies, deterministic — safe to call from
 * both client-side preview UIs and server-side render paths.
 */
export function renderTemplate(
  template: string | null | undefined,
  context: Record<string, unknown>,
  options: RenderTemplateOptions = {},
): string {
  if (!template) return '';

  const fallback = options.fallback ?? '';
  const escape = options.escapeHtml === true;

  return template.replace(/\{\{([\w.]+)\}\}/g, (_match, path: string) => {
    const value = getByPath(context, path);
    if (value === undefined || value === null) return fallback;
    const stringValue = stringify(value);
    return escape ? escapeHtml(stringValue) : stringValue;
  });
}

/**
 * Walks a dotted path like `"ticket.requester.firstName"` against a
 * plain object. Returns `undefined` if any segment is missing.
 * Does not cross through arrays — `items.0.name` style paths are not
 * supported on purpose (keeping the syntax simple for users).
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Coerce a value to a string for template insertion.
 * - Dates render as ISO strings.
 * - Arrays render as comma-separated values.
 * - Objects render as JSON (last-resort fallback; usually a context bug).
 */
function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stringify).join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * HTML-escape a string so it's safe to drop inside an HTML email body.
 * Covers the standard OWASP set: `& < > " '`.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extracts every `{{path}}` token from a template string, without
 * deduplication, in left-to-right order. Used by the UI to validate a
 * template against a context (e.g. highlight unknown variables).
 */
export function extractTokens(template: string | null | undefined): string[] {
  if (!template) return [];
  const matches = template.matchAll(/\{\{([\w.]+)\}\}/g);
  return Array.from(matches, (m) => m[1]);
}
