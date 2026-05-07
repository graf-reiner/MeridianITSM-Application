// GET /api/cloudflare/tunnel/info — fetch tunnel name + connection state

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { CloudflareApiError, CloudflareClient, decrypt } from '@meridian/core';
import { authenticateRequest } from '../../../../../lib/owner-auth';

export async function GET(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const saved = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  if (!saved) {
    return NextResponse.json({ error: 'Save Cloudflare credentials first' }, { status: 400 });
  }

  let token: string;
  try {
    token = decrypt(saved.apiTokenEnc);
  } catch {
    return NextResponse.json({ error: 'Saved API token could not be decrypted' }, { status: 500 });
  }

  const client = new CloudflareClient({ apiToken: token, accountId: saved.accountId });
  try {
    const tunnel = await client.getTunnel(saved.tunnelId);
    return NextResponse.json({ tunnel });
  } catch (err) {
    if (err instanceof CloudflareApiError) {
      return NextResponse.json(
        { error: err.message, codes: err.errors.map((e) => e.code) },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch tunnel info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
