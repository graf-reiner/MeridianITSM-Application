// ─── Owner Admin: Backup Restore Instructions API ─────────────────────────────
// GET /api/backups/[id]/restore-instructions
//   Returns a markdown restore guide for a COMPLETE BackupRun.
//   404 if the run does not exist or is not yet COMPLETE.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { buildRestoreMd } from '@meridian/backup';
import { verifyOwnerToken } from '../../../../../lib/owner-auth';
import { jsonResponse } from '../../../../../lib/serialize';

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

// ─── GET /api/backups/[id]/restore-instructions ───────────────────────────────
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params; // Next.js 16 — params is a Promise

  const row = await prisma.backupRun.findUnique({ where: { id } });
  if (!row || row.status !== 'COMPLETE') {
    return jsonResponse({ error: 'Backup not complete' }, 404);
  }

  const md = buildRestoreMd({
    runId:         row.id,
    startedAt:     row.startedAt,
    envName:       process.env['ENV_NAME']          ?? 'dev',
    dbHost:        process.env['DB_HOST_DISPLAY']   ?? '10.1.200.78',
    dbName:        process.env['DB_NAME_DISPLAY']   ?? 'meridian',
    dbRole:        process.env['DB_ROLE_DISPLAY']   ?? 'meridian_dev',
    pmHosts:       (process.env['PM_HOSTS_DISPLAY'] ?? 'meridian-dev')
                     .split(',')
                     .map(s => s.trim())
                     .filter(Boolean),
    // SHA-256 lives inside MANIFEST.json in the tarball, not persisted on the DB row.
    archiveSha256: '(see archive)',
  });

  return jsonResponse({ markdown: md });
}
