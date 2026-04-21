import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import type { OwnerJwtPayload } from '@meridian/types';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { jsonResponse } from '../../../lib/serialize';
import { uploadFile } from '../../../lib/storage';

const MAX_PACKAGE_SIZE = 200 * 1024 * 1024;
const VALID_PLATFORMS = ['WINDOWS', 'LINUX', 'MACOS'] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

async function requireOwner(request: Request): Promise<OwnerJwtPayload | Response> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
    return payload;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}

export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if (auth instanceof Response) return auth;

  const updates = await prisma.agentUpdate.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return jsonResponse({ updates });
}

export async function POST(request: Request) {
  const auth = await requireOwner(request);
  if (auth instanceof Response) return auth;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Failed to parse multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const version = String(formData.get('version') ?? '').trim();
  const platformRaw = String(formData.get('platform') ?? '').trim().toUpperCase();
  const releaseNotes = String(formData.get('releaseNotes') ?? '').trim() || null;

  if (!version || !platformRaw) {
    return NextResponse.json({ error: 'version and platform are required' }, { status: 400 });
  }
  if (!(VALID_PLATFORMS as readonly string[]).includes(platformRaw)) {
    return NextResponse.json(
      { error: `Invalid platform. Expected one of: ${VALID_PLATFORMS.join(', ')}` },
      { status: 400 },
    );
  }
  const platform = platformRaw as Platform;

  if (file.size > MAX_PACKAGE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_PACKAGE_SIZE / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const checksum = createHash('sha256').update(buffer).digest('hex');

  const originalFilename = file.name || `agent-${platform.toLowerCase()}-${version}`;
  const ext = originalFilename.includes('.') ? originalFilename.split('.').pop() : 'bin';
  const contentType = file.type || 'application/octet-stream';
  const storageKey = `agent-updates/${platform.toLowerCase()}/${version}/agent-${platform.toLowerCase()}-${version}.${ext}`;

  await uploadFile(buffer, storageKey, contentType);

  const record = await prisma.agentUpdate.upsert({
    where: { version_platform: { version, platform } },
    create: {
      version,
      platform,
      downloadUrl: storageKey,
      checksum,
      fileSize: buffer.length,
      releaseNotes,
      storageKey,
      uploadedBy: auth.ownerUserId,
    },
    update: {
      checksum,
      fileSize: buffer.length,
      releaseNotes,
      storageKey,
      downloadUrl: storageKey,
      uploadedBy: auth.ownerUserId,
    },
  });

  return jsonResponse({
    id: record.id,
    version: record.version,
    platform: record.platform,
    checksum: record.checksum,
    fileSize: record.fileSize,
    releaseNotes: record.releaseNotes,
    createdAt: record.createdAt,
  });
}
