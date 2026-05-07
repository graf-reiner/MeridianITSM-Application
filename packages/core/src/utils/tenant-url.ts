/**
 * Resolve a tenant's canonical user-facing base URL for use in email links,
 * notifications, and any external surfaces that need a clickable URL back
 * into the app.
 *
 * Resolution priority (first match wins):
 *   1. tenant.customDomain — vanity FQDN ("support.acme.com")
 *   2. tenant.subdomain + tenant.cloudflareDomain.apex — per-tenant apex
 *      bound at provision time ("acme.meridianitsm.com")
 *   3. tenant.subdomain + MERIDIAN_ROOT_DOMAIN env — legacy fallback for
 *      tenants provisioned before the Cloudflare integration shipped
 *   4. APP_URL env — platform-wide fallback ("https://app-dev.meridianitsm.com")
 *   5. http://localhost:3000 — last-resort dev default
 *
 * Always returns a URL with no trailing slash, suitable for concatenation
 * (e.g. `${baseUrl}/dashboard/tickets/${id}`).
 */

export interface TenantBaseUrlInput {
  customDomain?: string | null;
  subdomain?: string | null;
  cloudflareDomain?: { apex: string } | null;
}

export function resolveTenantBaseUrl(
  tenant: TenantBaseUrlInput,
  env: { MERIDIAN_ROOT_DOMAIN?: string; APP_URL?: string } = process.env as Record<string, string | undefined>,
): string {
  const fromCustom = normalizeUrl(tenant.customDomain);
  if (fromCustom) return fromCustom;

  if (tenant.subdomain && tenant.cloudflareDomain?.apex) {
    const apex = tenant.cloudflareDomain.apex.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (apex) return `https://${tenant.subdomain}.${apex}`;
  }

  const root = env.MERIDIAN_ROOT_DOMAIN?.trim();
  if (tenant.subdomain && root) {
    const cleanRoot = root.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${tenant.subdomain}.${cleanRoot}`;
  }

  const fromAppUrl = normalizeUrl(env.APP_URL);
  if (fromAppUrl) return fromAppUrl;

  return 'http://localhost:3000';
}

/**
 * Build the per-section URL prefixes a webhook/email/notification template
 * commonly wants. Both end WITHOUT a trailing slash so a caller composing
 * `${dashboardTicketsUrl}/${id}` produces the right result.
 */
export interface TenantUrls {
  base: string;
  dashboardTickets: string;
  portalTickets: string;
}

export function buildTenantUrls(tenant: TenantBaseUrlInput, env?: { MERIDIAN_ROOT_DOMAIN?: string; APP_URL?: string }): TenantUrls {
  const base = resolveTenantBaseUrl(tenant, env);
  return {
    base,
    dashboardTickets: `${base}/dashboard/tickets`,
    portalTickets: `${base}/portal/tickets`,
  };
}

function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // If the input already has a scheme, keep it verbatim. Otherwise add https.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}
