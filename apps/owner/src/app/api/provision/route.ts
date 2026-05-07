import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { provisionTenant } from '../../../lib/provisioning';
import { enqueueTenantCfProvision } from '../../../lib/cloudflare-queue';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    name,
    slug,
    subdomain,
    adminEmail,
    adminPassword,
    planTier,
    cloudflareDomainApex,
    cloudflareDomainZoneId,
    cfOriginOverride,
  } = body as {
    name?: string;
    slug?: string;
    subdomain?: string;
    adminEmail?: string;
    adminPassword?: string;
    planTier?: string;
    cloudflareDomainApex?: string;
    cloudflareDomainZoneId?: string;
    cfOriginOverride?: string;
  };

  // Validation
  if (!name || !slug || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: 'Missing required fields: name, slug, adminEmail, adminPassword' },
      { status: 400 },
    );
  }

  // Slug format validation
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
      { status: 400 },
    );
  }

  // Check slug uniqueness
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: `Slug '${slug}' is already taken` }, { status: 409 });
  }

  const validTiers = ['STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'];
  const resolvedPlanTier = (planTier && validTiers.includes(planTier) ? planTier : 'STARTER') as
    | 'STARTER'
    | 'PROFESSIONAL'
    | 'BUSINESS'
    | 'ENTERPRISE';

  // Validate subdomain format if provided
  if (subdomain) {
    if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain)) {
      return NextResponse.json(
        { error: 'Subdomain must be 3-63 lowercase letters, numbers, and hyphens (no leading/trailing hyphens)' },
        { status: 400 },
      );
    }
    const existingSubdomain = await prisma.tenant.findFirst({ where: { subdomain } });
    if (existingSubdomain) {
      return NextResponse.json({ error: `Subdomain '${subdomain}' is already taken` }, { status: 409 });
    }
  }

  // Validate the Cloudflare binding shape. The dropdown is sourced live from
  // Cloudflare's /zones API — both apex and zoneId are needed for the upsert.
  const apex = cloudflareDomainApex?.trim().toLowerCase();
  const zoneId = cloudflareDomainZoneId?.trim();
  if ((apex && !zoneId) || (!apex && zoneId)) {
    return NextResponse.json(
      { error: 'cloudflareDomainApex and cloudflareDomainZoneId must be supplied together' },
      { status: 400 },
    );
  }
  if (apex && !subdomain) {
    return NextResponse.json(
      { error: 'A subdomain is required when binding a tenant to a Cloudflare domain' },
      { status: 400 },
    );
  }

  // Optional per-tenant origin override — must be a parseable http/https URL.
  const trimmedOverride = cfOriginOverride?.trim();
  if (trimmedOverride) {
    try {
      const u = new URL(trimmedOverride);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return NextResponse.json(
          { error: 'cfOriginOverride must use http:// or https://' },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ error: 'cfOriginOverride must be a valid URL' }, { status: 400 });
    }
  }

  try {
    const result = await provisionTenant({
      name,
      slug,
      subdomain: subdomain || undefined,
      adminEmail,
      adminPassword,
      planTier: resolvedPlanTier,
      cloudflareDomainApex: apex,
      cloudflareDomainZoneId: zoneId,
      cfOriginOverride: trimmedOverride || undefined,
    });

    // Enqueue Cloudflare provisioning AFTER the DB transaction has committed.
    // Failure here does NOT roll back the tenant — the operator can retry from
    // the tenant detail page.
    if (result.cloudflareJob) {
      try {
        await enqueueTenantCfProvision({
          tenantId: result.tenant.id,
          hostname: result.cloudflareJob.hostname,
          cloudflareDomainId: result.cloudflareJob.cloudflareDomainId,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to enqueue Cloudflare provisioning';
        console.error('[provision] Failed to enqueue Cloudflare provisioning job:', err);
        await prisma.tenant.update({
          where: { id: result.tenant.id },
          data: { cfRouteStatus: 'FAILED', cfRouteError: errorMessage },
        });
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provisioning failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
