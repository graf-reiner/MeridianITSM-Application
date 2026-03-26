/**
 * Sanitization helpers for data sourced from external Identity Providers.
 *
 * IdP-controlled attributes (display names, email, claim values) must be
 * sanitised before persistence to prevent stored XSS — even though React
 * auto-escapes rendered text, other consumers (emails, exports, API JSON)
 * may not.
 */

/**
 * Strip HTML tags from a string to prevent XSS from IdP-sourced data.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Sanitize a display name from an IdP.
 * Strips HTML tags and truncates to 255 characters.
 */
export function sanitizeDisplayName(name: string | null | undefined): string {
  if (!name) return '';
  return stripHtml(name).slice(0, 255);
}
