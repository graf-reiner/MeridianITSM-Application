import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { create as tarCreate } from 'tar';
import { prisma } from '@meridian/db';

import { putObject, getObjectStream, ensureBucket } from './minio.js';
import { keyFingerprint } from './fingerprint.js';
import { buildManifest, type RestoreMdInput } from './manifest.js';
import type { BackupTrigger } from './types.js';

export interface CreateBackupInput {
  trigger:        BackupTrigger;
  triggeredById?: string | null;
  bucketName:     string;
  envName:        string;
  databaseUrl:    string;
  encryptionKey:  string;
  attachmentBucket: string;
  restoreCtx:     Pick<RestoreMdInput, 'dbHost' | 'dbName' | 'dbRole' | 'pmHosts'>;
}

export interface CreateBackupResult {
  runId:           string;
  objectKey:       string;
  sizeBytes:       number;
  attachmentCount: number;
  archiveSha256:   string;
}

/**
 * The 5-step backup-create job.
 * NEVER throws after the BackupRun row is inserted — failures are recorded in the row.
 */
export async function createBackup(input: CreateBackupInput): Promise<CreateBackupResult> {
  await ensureBucket(input.bucketName);

  const fingerprint = keyFingerprint(input.encryptionKey);

  // Step 1 — open audit row
  const run = await prisma.backupRun.create({
    data: {
      trigger:        input.trigger,
      status:         'RUNNING',
      triggeredById:  input.triggeredById ?? null,
      keyFingerprint: fingerprint,
    },
    select: { id: true, startedAt: true },
  });

  const tempRoot = await mkdtemp(path.join(tmpdir(), `meridian-backup-${run.id}-`));
  let objectKey: string | null = null;
  let sizeBytes = 0;
  let attachmentCount = 0;
  let archiveSha256 = '';
  let archivePath: string | null = null;

  try {
    // Step 2 — pg_dump
    const dumpPath = path.join(tempRoot, 'database.dump');
    await runPgDump(input.databaseUrl, dumpPath);

    // Step 3 — copy attachments
    const attDir = path.join(tempRoot, 'attachments');
    await mkdir(attDir, { recursive: true });
    const attManifest = await copyAttachments(input.attachmentBucket, attDir);
    attachmentCount = attManifest.length;
    await writeFile(
      path.join(tempRoot, 'attachments-manifest.json'),
      JSON.stringify(attManifest, null, 2),
    );

    // KEY.txt — capture the encryption key so the restore operator can verify key compatibility
    await writeFile(path.join(tempRoot, 'KEY.txt'), input.encryptionKey + '\n');

    // dbRowCounts
    const dbRowCounts = await collectRowCounts();

    // schemaVersion — latest applied Prisma migration name
    const latestMigration = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1
    `;
    const schemaVersion = latestMigration[0]?.migration_name ?? '(unknown)';

    // MANIFEST.json
    const manifestStr = buildManifest({
      runId:           run.id,
      trigger:         input.trigger,
      startedAt:       run.startedAt,
      envName:         input.envName,
      schemaVersion,
      keyFingerprint:  fingerprint,
      dbRowCounts,
      attachmentCount,
    });
    await writeFile(path.join(tempRoot, 'MANIFEST.json'), manifestStr);

    // Step 4 — tar+gzip into a temp archive on disk, then compute sha256+size before upload
    // Note: RESTORE.md is intentionally NOT included here. The owner-admin UI renders
    // an env-specific RESTORE.md on demand from BackupRun + MANIFEST data.
    archivePath = path.join(tmpdir(), `meridian-backup-${run.id}.tar.gz`);
    await tarCreate(
      { gzip: true, file: archivePath, cwd: tempRoot },
      ['database.dump', 'attachments', 'attachments-manifest.json', 'KEY.txt', 'MANIFEST.json'],
    );

    // Compute sha256 + size of the completed archive
    const hash = createHash('sha256');
    const archiveStream = createReadStream(archivePath);
    for await (const chunk of archiveStream) hash.update(chunk);
    archiveSha256 = hash.digest('hex');
    sizeBytes = (await stat(archivePath)).size;

    // Step 5 — upload archive to MinIO
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const triggeredSuffix =
      input.trigger === 'MANUAL' && input.triggeredById ? `_${input.triggeredById}` : '';
    objectKey = `backups/${input.trigger.toLowerCase()}/${ts}${triggeredSuffix}_${run.id}.tar.gz`;

    const uploadStream = createReadStream(archivePath);
    await putObject(input.bucketName, objectKey, uploadStream, 'application/gzip');

    // Close audit row — success
    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status:          'COMPLETE',
        finishedAt:      new Date(),
        objectKey,
        sizeBytes:       BigInt(sizeBytes),
        attachmentCount,
        dbRowCounts:     dbRowCounts as never,
      },
    });

    return { runId: run.id, objectKey, sizeBytes, attachmentCount, archiveSha256 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.backupRun
      .update({
        where: { id: run.id },
        data: {
          status:         'FAILED',
          finishedAt:     new Date(),
          errorMessage:   msg,
          objectKey,
          sizeBytes:      sizeBytes ? BigInt(sizeBytes) : null,
          attachmentCount,
        },
      })
      .catch(() => {
        /* swallow audit-write error so the original error propagates */
      });
    throw err;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    if (archivePath) await rm(archivePath, { force: true });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runPgDump(databaseUrl: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(databaseUrl); }
    catch (err) {
      reject(new Error(`Invalid databaseUrl: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    const args = [
      '--format=c',
      '--file', outPath,
      '--host', parsed.hostname,
      '--port', parsed.port || '5432',
      '--username', decodeURIComponent(parsed.username),
      parsed.pathname.replace(/^\//, ''),  // database name
    ];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };

    const child = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exit ${code}: ${stderr.slice(0, 2_000)}`));
    });
  });
}

interface AttachmentManifestEntry {
  tenantId:    string;
  storagePath: string;
  archivePath: string;
  sizeBytes:   number;
}

/**
 * Copy all TicketAttachment files from MinIO into outDir, returning a manifest.
 *
 * Discovery 2 result: `storagePath` in the database already includes the tenantId
 * prefix. It is written as `${tenantId}/tickets/${ticketId}/${timestamp}-${filename}`
 * (apps/api/src/routes/v1/tickets/index.ts:407). Therefore:
 *   - S3 key  = r.storagePath  (no further prepending needed)
 *   - archive path = r.storagePath  (preserves the tenant/ticket hierarchy inside the tarball)
 * Using path.join(tenantId, storagePath) would double-prefix the tenantId and break the key.
 */
async function copyAttachments(
  bucket: string,
  outDir: string,
): Promise<AttachmentManifestEntry[]> {
  const rows = await prisma.ticketAttachment.findMany({
    select: { tenantId: true, storagePath: true, fileSize: true },
  });

  const entries: AttachmentManifestEntry[] = [];

  for (const r of rows) {
    // storagePath already IS the full S3 key (includes tenantId prefix)
    const s3Key      = r.storagePath;
    const archiveRel = r.storagePath;  // keep the same hierarchy in the archive
    const archiveAbs = path.join(outDir, archiveRel);

    await mkdir(path.dirname(archiveAbs), { recursive: true });

    try {
      const objectStream = await getObjectStream(bucket, s3Key);
      const writeStream  = createWriteStream(archiveAbs);
      await pipeline(objectStream as Readable, writeStream);
      entries.push({
        tenantId:    r.tenantId,
        storagePath: r.storagePath,
        archivePath: archiveRel,
        sizeBytes:   r.fileSize ?? 0,
      });
    } catch (err) {
      // Non-fatal: log and skip missing/inaccessible objects so one bad attachment
      // does not abort the entire backup.
      console.error(
        `[backup] skipped attachment ${s3Key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return entries;
}

async function collectRowCounts(): Promise<Record<string, number>> {
  const tables = [
    'tickets',
    'ticket_comments',
    'users',
    'tenants',
    'email_activity_logs',
    'notification_rules',
    'workflows',
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) FROM "${t}"`,
    );
    out[t] = Number(rows[0]?.count ?? 0);
  }
  return out;
}
