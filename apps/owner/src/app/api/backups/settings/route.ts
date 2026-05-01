// ─── Owner Admin: Backup Settings API ─────────────────────────────────────────
// GET   /api/backups/settings  — return current BackupConfig from OwnerSetting rows merged onto defaults
// PATCH /api/backups/settings  — upsert OwnerSetting rows for the provided keys; return updated config

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@meridian/db';
import { DEFAULT_BACKUP_CONFIG, type BackupConfig } from '@meridian/backup';
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

// ─── Valid setting keys ────────────────────────────────────────────────────────
const KEYS = [
  'scheduledEnabled',
  'scheduledCron',
  'retentionScheduledDays',
  'retentionManualDays',
  'bucketName',
] as const;
type SettingKey = typeof KEYS[number];

// ─── Load config from OwnerSetting rows ───────────────────────────────────────
async function loadConfig(): Promise<BackupConfig> {
  const rows = await prisma.ownerSetting.findMany({ where: { key: { startsWith: 'backup.' } } });
  const cfg: BackupConfig = { ...DEFAULT_BACKUP_CONFIG };
  for (const r of rows) {
    const k = r.key.replace(/^backup\./, '') as SettingKey;
    if (!KEYS.includes(k)) continue;
    let v: unknown;
    try { v = JSON.parse(r.value); } catch { continue; }
    if      (k === 'scheduledEnabled'       && typeof v === 'boolean') cfg.scheduledEnabled = v;
    else if (k === 'scheduledCron'          && typeof v === 'string')  cfg.scheduledCron = v;
    else if (k === 'retentionScheduledDays' && typeof v === 'number')  cfg.retentionScheduledDays = v;
    else if (k === 'retentionManualDays'    && typeof v === 'number')  cfg.retentionManualDays = v;
    else if (k === 'bucketName'             && typeof v === 'string')  cfg.bucketName = v;
  }
  return cfg;
}

// ─── GET /api/backups/settings ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return jsonResponse(await loadConfig());
}

// ─── PATCH /api/backups/settings ─────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as Partial<BackupConfig>;
  const updatedById = session.ownerUserId;

  const updates: Promise<unknown>[] = [];
  for (const k of KEYS) {
    if (body[k] === undefined) continue;
    // Type-validate each field; silently skip values with wrong shape.
    if (k === 'scheduledEnabled'       && typeof body[k] !== 'boolean') continue;
    if (k === 'scheduledCron'          && typeof body[k] !== 'string')  continue;
    if (k === 'retentionScheduledDays' && typeof body[k] !== 'number')  continue;
    if (k === 'retentionManualDays'    && typeof body[k] !== 'number')  continue;
    if (k === 'bucketName'             && typeof body[k] !== 'string')  continue;

    updates.push(prisma.ownerSetting.upsert({
      where:  { key: `backup.${k}` },
      update: { value: JSON.stringify(body[k]), updatedById },
      create: { key: `backup.${k}`, value: JSON.stringify(body[k]), updatedById },
    }));
  }
  await Promise.all(updates);
  // Return the full updated config so the UI can re-render without a second GET.
  return jsonResponse(await loadConfig());
}
