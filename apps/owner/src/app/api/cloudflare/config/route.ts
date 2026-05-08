// ─── Owner Admin: Cloudflare Config API ───────────────────────────────────────
// GET  /api/cloudflare/config — read singleton config (token masked)
// POST /api/cloudflare/config — upsert. Send '********' as apiToken to keep
//                                the existing token unchanged.
//
// One row only. Stored in `cloudflare_config` keyed by the unique sentinel
// `singleton = true`. The API token is encrypted at rest via @meridian/core.

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { encrypt } from '@meridian/core';
import { authenticateRequest } from '../../../../lib/owner-auth';

const SECRET_MASK = '********';

interface CloudflareConfigStatus {
  configured: boolean;
  accountId: string | null;
  tunnelId: string | null;
  tunnelCname: string | null;
  defaultOrigin: string;
  isEnabled: boolean;
  lastVerifiedAt: string | null;
  apiTokenMasked: string | null; // always '********' when configured, null otherwise
  updatedAt: string | null;
}

function statusFromRow(row: Awaited<ReturnType<typeof prisma.cloudflareConfig.findUnique>> | null): CloudflareConfigStatus {
  if (!row) {
    return {
      configured: false,
      accountId: null,
      tunnelId: null,
      tunnelCname: null,
      defaultOrigin: 'http://localhost:3000',
      isEnabled: false,
      lastVerifiedAt: null,
      apiTokenMasked: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    accountId: row.accountId,
    tunnelId: row.tunnelId,
    tunnelCname: row.tunnelCname,
    defaultOrigin: row.defaultOrigin,
    isEnabled: row.isEnabled,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    apiTokenMasked: SECRET_MASK,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const row = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  return NextResponse.json({ config: statusFromRow(row) });
}

export async function POST(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    accountId?: string;
    tunnelId?: string;
    tunnelCname?: string;
    defaultOrigin?: string;
    apiToken?: string;
    isEnabled?: boolean;
  };

  const accountId = body.accountId?.trim();
  const tunnelId = body.tunnelId?.trim();
  if (!accountId || !tunnelId) {
    return NextResponse.json({ error: 'accountId and tunnelId are required' }, { status: 400 });
  }

  const tunnelCname = body.tunnelCname?.trim() || `${tunnelId}.cfargotunnel.com`;

  // Cloudflare's tunnel ingress requires the `service` to be a valid URL with
  // a scheme — bare "host:port" is rejected with code 1056. Auto-prefix http://
  // when the operator forgets, then validate the result is a real URL.
  const rawOrigin = body.defaultOrigin?.trim() || 'http://localhost:3000';
  const defaultOrigin = /^https?:\/\//.test(rawOrigin) ? rawOrigin : `http://${rawOrigin}`;
  try {
    const u = new URL(defaultOrigin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return NextResponse.json(
        { error: 'defaultOrigin must use http:// or https://' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: `defaultOrigin "${rawOrigin}" is not a valid URL (e.g. http://10.1.200.220:3000)` },
      { status: 400 },
    );
  }

  const existing = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  const incomingToken = body.apiToken?.trim();
  const updateToken = incomingToken && incomingToken !== SECRET_MASK;

  if (!existing && !updateToken) {
    return NextResponse.json({ error: 'apiToken is required when creating the configuration' }, { status: 400 });
  }

  const saved = await prisma.cloudflareConfig.upsert({
    where: { singleton: true },
    create: {
      singleton: true,
      accountId,
      tunnelId,
      tunnelCname,
      defaultOrigin,
      apiTokenEnc: encrypt(incomingToken!),
      isEnabled: body.isEnabled ?? true,
    },
    update: {
      accountId,
      tunnelId,
      tunnelCname,
      defaultOrigin,
      ...(updateToken ? { apiTokenEnc: encrypt(incomingToken!) } : {}),
      isEnabled: body.isEnabled ?? true,
    },
  });

  return NextResponse.json({ config: statusFromRow(saved) });
}
