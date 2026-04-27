// DELETE /api/integrations/:provider — clear credentials for a provider.
// If env vars exist, the OAuth route will fall back to those; otherwise the
// provider becomes unconfigured.

import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';

type Provider = 'MICROSOFT' | 'GOOGLE';
const PROVIDERS: Provider[] = ['MICROSOFT', 'GOOGLE'];

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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { provider: rawProvider } = await params;
  const provider = rawProvider.toUpperCase() as Provider;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }

  await prisma.ownerOAuthIntegration.deleteMany({ where: { provider } });
  return NextResponse.json({ ok: true });
}
