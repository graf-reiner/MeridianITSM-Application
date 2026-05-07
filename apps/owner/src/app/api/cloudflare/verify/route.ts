// POST /api/cloudflare/verify
// Body: { apiToken?: string, accountId?: string }
// Token defaults to the saved encrypted token; accountId defaults to saved.
// Calls Cloudflare's /user/tokens/verify and updates lastVerifiedAt on success.

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { CloudflareApiError, CloudflareClient, decrypt, encrypt } from '@meridian/core';
import { authenticateRequest } from '../../../../lib/owner-auth';

const SECRET_MASK = '********';

export async function POST(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    apiToken?: string;
    accountId?: string;
    persist?: boolean; // when true and apiToken is provided, save the new credentials
  };

  const saved = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  const accountId = (body.accountId?.trim() || saved?.accountId || '').trim();
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required (none saved yet)' }, { status: 400 });
  }

  const incoming = body.apiToken?.trim();
  let token: string;
  if (incoming && incoming !== SECRET_MASK) {
    token = incoming;
  } else if (saved) {
    try {
      token = decrypt(saved.apiTokenEnc);
    } catch {
      return NextResponse.json({ error: 'Saved API token could not be decrypted' }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'apiToken is required (none saved yet)' }, { status: 400 });
  }

  const client = new CloudflareClient({ apiToken: token, accountId });

  try {
    const result = await client.verifyToken();
    if (saved) {
      await prisma.cloudflareConfig.update({
        where: { singleton: true },
        data: {
          lastVerifiedAt: new Date(),
          ...(body.persist && incoming && incoming !== SECRET_MASK
            ? { apiTokenEnc: encrypt(incoming) }
            : {}),
          ...(body.accountId?.trim() && body.accountId.trim() !== saved.accountId
            ? { accountId: body.accountId.trim() }
            : {}),
        },
      });
    }
    return NextResponse.json({ ok: true, tokenId: result.id, status: result.status });
  } catch (err) {
    if (err instanceof CloudflareApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, codes: err.errors.map((e) => e.code) },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : 'Verification failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
