// ─── Owner Admin: Backup Get & Delete API ─────────────────────────────────────
// GET    /api/backups/[id]   — fetch a single BackupRun + presigned download URL
// DELETE /api/backups/[id]   — delete object from S3 then remove the DB row

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { presignedDownloadUrl, deleteObject } from '@meridian/backup';
import { verifyOwnerToken } from '../../../../lib/owner-auth';
import { jsonResponse } from '../../../../lib/serialize';

// ─── Auth helper ──────────────────────────────────────────────────────────────
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

// ─── Bucket helper ────────────────────────────────────────────────────────────
async function resolveBucket(): Promise<string> {
  const cfgRow = await prisma.ownerSetting.findUnique({ where: { key: 'backup.bucketName' } });
  if (cfgRow) {
    try {
      const v = JSON.parse(cfgRow.value);
      if (typeof v === 'string' && v.length > 0) return v;
    } catch { /* fall through to default */ }
  }
  return 'meridian-backups';
}

// ─── GET /api/backups/[id] ────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params; // Next.js 16 — params is a Promise

  const row = await prisma.backupRun.findUnique({
    where: { id },
    include: {
      triggeredBy: { select: { id: true, email: true } }, // no displayName — field does not exist on OwnerUser
    },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let downloadUrl: string | null = null;
  if (row.status === 'COMPLETE' && row.objectKey) {
    const bucket = await resolveBucket();
    downloadUrl = await presignedDownloadUrl(bucket, row.objectKey, 900);
  }

  // jsonResponse handles BigInt serialisation (sizeBytes) via its replacer.
  return jsonResponse({ row, downloadUrl });
}

// ─── DELETE /api/backups/[id] ─────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params; // Next.js 16 — params is a Promise

  const row = await prisma.backupRun.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (row.objectKey) {
    const bucket = await resolveBucket();
    try {
      await deleteObject(bucket, row.objectKey);
    } catch (err) {
      // Log and continue — the operator may have already removed the object
      // via mc/console. We still want to clean up the DB row.
      console.error('[backups] S3 delete object failed (continuing to DB delete):', err);
    }
  }

  await prisma.backupRun.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
