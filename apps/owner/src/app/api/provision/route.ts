import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { provisionTenant } from '../../../lib/provisioning';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, slug, subdomain, adminEmail, adminPassword, planTier } = body as {
    name?: string;
    slug?: string;
    subdomain?: string;
    adminEmail?: string;
    adminPassword?: string;
    planTier?: string;
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

  try {
    const result = await provisionTenant({
      name,
      slug,
      subdomain: subdomain || undefined,
      adminEmail,
      adminPassword,
      planTier: resolvedPlanTier,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provisioning failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
