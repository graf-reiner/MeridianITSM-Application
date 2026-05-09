// GET  /api/platform-settings — returns all known platform settings (with env fallback)
// POST /api/platform-settings — { appUrl } upsert

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { authenticateRequest } from '../../../lib/owner-auth';
import { SETTING_KEYS, getPlatformAppUrl } from '../../../lib/platform-settings';

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUrl = await getPlatformAppUrl();
  const row = await prisma.ownerSetting.findUnique({ where: { key: SETTING_KEYS.APP_URL } });

  return NextResponse.json({
    appUrl,
    appUrlSource: row?.value ? 'db' : process.env.APP_URL ? 'env' : 'unset',
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { appUrl?: string };
  const raw = body.appUrl?.trim() ?? '';
  if (!raw) {
    return NextResponse.json({ error: 'appUrl is required' }, { status: 400 });
  }

  const normalized = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(normalized);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return NextResponse.json({ error: 'appUrl must use http:// or https://' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: `appUrl "${raw}" is not a valid URL` }, { status: 400 });
  }
  const trimmed = normalized.replace(/\/+$/, '');

  const saved = await prisma.ownerSetting.upsert({
    where: { key: SETTING_KEYS.APP_URL },
    create: {
      key: SETTING_KEYS.APP_URL,
      value: trimmed,
      updatedById: auth.ownerUserId,
    },
    update: {
      value: trimmed,
      updatedById: auth.ownerUserId,
    },
  });

  return NextResponse.json({
    appUrl: saved.value,
    appUrlSource: 'db',
    updatedAt: saved.updatedAt.toISOString(),
  });
}
