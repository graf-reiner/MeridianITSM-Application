// POST /api/cloudflare/zones
// Body: { apex: string }
// Looks up the Cloudflare zone matching the given apex domain so the operator
// doesn't have to copy/paste a zone ID out of the dashboard. Uses the saved
// CloudflareConfig credentials.

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { CloudflareApiError, CloudflareClient, decrypt } from '@meridian/core';
import { authenticateRequest } from '../../../../lib/owner-auth';

const APEX_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function POST(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { apex?: string };
  const apex = body.apex?.trim().toLowerCase();
  if (!apex || !APEX_REGEX.test(apex)) {
    return NextResponse.json({ error: 'apex must be a valid domain (e.g. meridianitsm.com)' }, { status: 400 });
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
    const zone = await client.findZoneByName(apex);
    if (!zone) {
      return NextResponse.json({ error: `No active Cloudflare zone found for '${apex}'` }, { status: 404 });
    }
    return NextResponse.json({ zoneId: zone.id, name: zone.name });
  } catch (err) {
    if (err instanceof CloudflareApiError) {
      return NextResponse.json(
        { error: err.message, codes: err.errors.map((e) => e.code) },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : 'Zone lookup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
