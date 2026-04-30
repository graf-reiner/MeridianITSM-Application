// ─── Owner Admin: Backup List & Create API ────────────────────────────────────
// GET  /api/backups          — paginated list of BackupRun rows
// POST /api/backups          — enqueue a manual BACKUP_CREATE job

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { Queue } from 'bullmq';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { jsonResponse } from '../../../lib/serialize';

// ─── Redis connection ──────────────────────────────────────────────────────────
// Follows the project-wide REDIS_HOST / REDIS_PORT / REDIS_PASSWORD env pattern
// (same as system/route.ts — do NOT parse a REDIS_URL here).
function getBullmqConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  };
}

// HMR connection leak prevention: Next.js dev re-executes this module on every
// hot reload, which would open a new Redis connection each time. Caching the
// Queue instance on globalThis keeps exactly one connection alive across reloads.
declare global {
  // eslint-disable-next-line no-var
  var _backupsQueue: Queue | undefined;
}

// Singleton Queue producer — only enqueues jobs, never processes them.
// The worker (apps/worker) is the sole consumer of this queue.
const backupsQueue: Queue = globalThis._backupsQueue ?? new Queue('backups', { connection: getBullmqConnection() });
if (!globalThis._backupsQueue) globalThis._backupsQueue = backupsQueue;

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

// ─── GET /api/backups ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit  = parseInt(searchParams.get('limit')  ?? '25', 10);
  const rawOffset = parseInt(searchParams.get('offset') ?? '0',  10);
  const limit  = Math.min(Number.isFinite(rawLimit)  && rawLimit  > 0 ? rawLimit  : 25, 100);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const [rows, total] = await Promise.all([
    prisma.backupRun.findMany({
      orderBy: { startedAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        triggeredBy: { select: { id: true, email: true } }, // no displayName — field does not exist on OwnerUser
      },
    }),
    prisma.backupRun.count(),
  ]);

  // jsonResponse handles BigInt serialisation (sizeBytes) via its replacer.
  return jsonResponse({ rows, total, limit, offset });
}

// ─── POST /api/backups ────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await backupsQueue.add('backup-create', {
    trigger: 'MANUAL',
    triggeredById: session.ownerUserId,
  });

  return NextResponse.json({ enqueued: true });
}
