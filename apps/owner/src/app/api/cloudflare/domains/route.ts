// GET  /api/cloudflare/domains — list all configured apex domains
// POST /api/cloudflare/domains — add a new apex (requires a known CloudflareConfig)

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { authenticateRequest } from '../../../../lib/owner-auth';

const APEX_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

interface DomainRow {
  id: string;
  apex: string;
  zoneId: string;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToDomain(row: {
  id: string;
  apex: string;
  zoneId: string;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DomainRow {
  return {
    id: row.id,
    apex: row.apex,
    zoneId: row.zoneId,
    isDefault: row.isDefault,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.cloudflareDomain.findMany({
    where: { isEnabled: true },
    orderBy: [{ isDefault: 'desc' }, { apex: 'asc' }],
  });
  return NextResponse.json({ domains: rows.map(rowToDomain) });
}

export async function POST(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    apex?: string;
    zoneId?: string;
    isDefault?: boolean;
  };

  const apex = body.apex?.trim().toLowerCase();
  const zoneId = body.zoneId?.trim();
  if (!apex || !APEX_REGEX.test(apex)) {
    return NextResponse.json({ error: 'apex must be a valid domain (e.g. meridianitsm.com)' }, { status: 400 });
  }
  if (!zoneId) {
    return NextResponse.json({ error: 'zoneId is required (use POST /api/cloudflare/zones to detect)' }, { status: 400 });
  }

  const config = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  if (!config) {
    return NextResponse.json({ error: 'Save Cloudflare credentials first' }, { status: 400 });
  }

  const wantDefault = !!body.isDefault;
  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (wantDefault) {
        await tx.cloudflareDomain.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      const otherDefaults = await tx.cloudflareDomain.count({
        where: { isDefault: true, NOT: { apex } },
      });
      const becomeDefault = wantDefault || otherDefaults === 0;
      return tx.cloudflareDomain.upsert({
        where: { apex },
        create: {
          configId: config.id,
          apex,
          zoneId,
          isDefault: becomeDefault,
          isEnabled: true,
        },
        update: {
          configId: config.id,
          zoneId,
          ...(wantDefault ? { isDefault: true } : {}),
          isEnabled: true,
        },
      });
    });
    return NextResponse.json({ domain: rowToDomain(saved) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
