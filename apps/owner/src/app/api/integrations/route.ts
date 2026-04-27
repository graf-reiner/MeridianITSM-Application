// ─── Owner Admin: OAuth Integrations API ──────────────────────────────────────
// GET  /api/integrations        — list status of all known providers
// POST /api/integrations        — upsert credentials for a provider
//
// Stores credentials in `owner_oauth_integrations` (one row per provider).
// Client secret is encrypted at rest with @meridian/core encrypt(). On read,
// the secret is masked as '********' before responding so it never leaves
// the server in plaintext.
//
// The API's OAuth route reads DB first then env, so saving here takes effect
// on the next customer request — no PM2 restart needed.

import { prisma } from '@meridian/db';
import { encrypt } from '@meridian/core';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';

type Provider = 'MICROSOFT' | 'GOOGLE';
const PROVIDERS: Provider[] = ['MICROSOFT', 'GOOGLE'];
const SECRET_MASK = '********';

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

interface IntegrationStatus {
  provider: Provider;
  source: 'db' | 'env' | null;
  configured: boolean;
  clientIdMasked: string | null;
  secretExpiresAt: string | null;
  notes: string | null;
  updatedAt: string | null;
}

function maskClientId(clientId: string): string {
  if (clientId.length <= 8) return '••••' + clientId.slice(-4);
  return clientId.slice(0, 4) + '…' + clientId.slice(-4);
}

function envConfigured(provider: Provider): boolean {
  if (provider === 'MICROSOFT') {
    return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function envClientId(provider: Provider): string | null {
  return provider === 'MICROSOFT' ? (process.env.MICROSOFT_CLIENT_ID ?? null) : (process.env.GOOGLE_CLIENT_ID ?? null);
}

export async function GET(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await prisma.ownerOAuthIntegration.findMany();
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const statuses: IntegrationStatus[] = PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (row && row.isEnabled) {
      return {
        provider,
        source: 'db' as const,
        configured: true,
        clientIdMasked: maskClientId(row.clientId),
        secretExpiresAt: row.secretExpiresAt?.toISOString() ?? null,
        notes: row.notes,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    if (envConfigured(provider)) {
      return {
        provider,
        source: 'env' as const,
        configured: true,
        clientIdMasked: maskClientId(envClientId(provider) ?? ''),
        secretExpiresAt: null,
        notes: null,
        updatedAt: null,
      };
    }
    return {
      provider,
      source: null,
      configured: false,
      clientIdMasked: null,
      secretExpiresAt: null,
      notes: null,
      updatedAt: null,
    };
  });

  // Surface the API's redirect URI so the wizard can show a copy-pasteable value.
  // We use process.env.APP_URL on the owner-admin host as the source of truth — in
  // a typical deployment owner and api share the same APP_URL.
  const redirectUri = `${process.env.APP_URL ?? ''}/api/v1/email-accounts/oauth/callback`;

  return NextResponse.json({ integrations: statuses, redirectUri });
}

export async function POST(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as {
    provider?: string;
    clientId?: string;
    clientSecret?: string;
    secretExpiresAt?: string | null;
    notes?: string | null;
  };

  const provider = body.provider?.toUpperCase() as Provider | undefined;
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'provider must be "MICROSOFT" or "GOOGLE"' }, { status: 400 });
  }

  const clientId = body.clientId?.trim();
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const existing = await prisma.ownerOAuthIntegration.findUnique({ where: { provider } });

  // Mask sentinel — caller didn't change the secret. Allowed only when a row already exists.
  const incomingSecret = body.clientSecret?.trim();
  const updateSecret = incomingSecret && incomingSecret !== SECRET_MASK;

  if (!existing && !updateSecret) {
    return NextResponse.json({ error: 'clientSecret is required for new integrations' }, { status: 400 });
  }

  const secretExpiresAt = body.secretExpiresAt ? new Date(body.secretExpiresAt) : null;
  if (secretExpiresAt && Number.isNaN(secretExpiresAt.getTime())) {
    return NextResponse.json({ error: 'secretExpiresAt must be a valid date' }, { status: 400 });
  }

  const saved = await prisma.ownerOAuthIntegration.upsert({
    where: { provider },
    create: {
      provider,
      clientId,
      clientSecretEnc: encrypt(incomingSecret!),
      secretExpiresAt,
      notes: body.notes ?? null,
      isEnabled: true,
    },
    update: {
      clientId,
      ...(updateSecret ? { clientSecretEnc: encrypt(incomingSecret!) } : {}),
      secretExpiresAt,
      notes: body.notes ?? null,
      isEnabled: true,
    },
  });

  return NextResponse.json({
    integration: {
      provider: saved.provider,
      source: 'db' as const,
      configured: true,
      clientIdMasked: maskClientId(saved.clientId),
      secretExpiresAt: saved.secretExpiresAt?.toISOString() ?? null,
      notes: saved.notes,
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
}
