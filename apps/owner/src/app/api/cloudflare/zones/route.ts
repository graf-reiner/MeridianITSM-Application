// GET  /api/cloudflare/zones — list every zone the saved token can see (live)
// POST /api/cloudflare/zones — { apex } → resolve a single zone by name
//
// The GET feed populates the Domain dropdown on the Provision form so the
// operator doesn't have to pre-curate apexes in Settings. Uses the saved
// CloudflareConfig credentials.

import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { CloudflareApiError, CloudflareClient, decrypt } from '@meridian/core';
import { authenticateRequest } from '../../../../lib/owner-auth';

const APEX_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

async function buildClient() {
  const saved = await prisma.cloudflareConfig.findUnique({ where: { singleton: true } });
  if (!saved) return { error: 'Save Cloudflare credentials first', status: 400 as const };
  let token: string;
  try {
    token = decrypt(saved.apiTokenEnc);
  } catch {
    return { error: 'Saved API token could not be decrypted', status: 500 as const };
  }
  return { client: new CloudflareClient({ apiToken: token, accountId: saved.accountId }) };
}

export async function GET(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const built = await buildClient();
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: built.status });

  try {
    const zones = await built.client.listZones();
    return NextResponse.json({
      zones: zones.map((z) => ({ id: z.id, name: z.name })),
    });
  } catch (err) {
    if (err instanceof CloudflareApiError) {
      return NextResponse.json(
        { error: err.message, codes: err.errors.map((e) => e.code) },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : 'Zone listing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await authenticateRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { apex?: string };
  const apex = body.apex?.trim().toLowerCase();
  if (!apex || !APEX_REGEX.test(apex)) {
    return NextResponse.json({ error: 'apex must be a valid domain (e.g. meridianitsm.com)' }, { status: 400 });
  }

  const built = await buildClient();
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: built.status });

  try {
    const zone = await built.client.findZoneByName(apex);
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
