# Owner-Admin Database Backup — Design Spec

**Status:** Approved 2026-04-30
**Author:** Brainstorming session, this date
**Implements:** Phase 1 (whole-database backup). Phase 2 (per-tenant) deferred to a separate spec.

## Goal

Add a backup feature to the owner-admin portal at `apps/owner` that captures the full Meridian database + uploaded attachments into a single restorable archive, stores it in MinIO/S3, and gives the owner-admin a UI to trigger backups on demand, see scheduled runs, download archives, and view restore instructions.

## Non-Goals (this phase)

- **Per-tenant backup or export** — section 4 of this doc describes how this MVP evolves to support it; not built now.
- **One-click restore from the UI** — restoring is a deliberate, terminal-driven action. The UI shows the exact commands but doesn't run them.
- **Cross-environment restore** (e.g., restore a prod backup into dev) — handled by manual `pg_restore` against a different host, not a built-in feature.
- **Point-in-time recovery / WAL archiving** — out of scope. We ship snapshot backups only.

## Trust Model & Encryption

The MeridianITSM database has columns encrypted at rest with a symmetric `ENCRYPTION_KEY` stored in `.env` (OAuth tokens, SMTP/IMAP passwords). A `pg_dump` contains ciphertext only — restoring without the matching key leaves those columns unreadable.

**Decision:** the backup tarball includes the encryption key in plaintext as a `KEY.txt` file. The MinIO bucket holding backups uses server-side encryption (SSE) and is access-restricted to the owner-admin app + sysadmin team. This matches how AWS RDS and most automated-backup systems work — the trust boundary is bucket access, not the file contents.

The owner-admin Backups page displays a one-line warning: *"Backups contain your encryption key. Anyone who can read the backup bucket can decrypt all stored OAuth tokens and SMTP passwords. The bucket is restricted to the owner-admin app and sysadmins."*

Public-key envelope encryption (each backup encrypted with a per-environment recovery keypair) is captured in the future-work section as the next-tier security upgrade if/when we need to ship backups outside the trust boundary.

## Architecture

### One trigger, one job, one engine

Whether the scheduler fires the backup or the owner-admin clicks "Backup now," both paths enqueue the same `backup-create` BullMQ job. The job runs in `apps/worker` (where heavy I/O belongs).

### `backup-create` job — five steps

1. **Open audit row.** Insert `BackupRun` with `status=RUNNING`, captures `trigger`, `triggeredById`, `startedAt`, `keyFingerprint` (SHA-256 first 16 hex chars of the current `ENCRYPTION_KEY`).
2. **Database dump.** `pg_dump -Fc meridian` → temp file. Custom format, parallel-restore-friendly.
3. **Attachment copy.** Enumerate `TicketAttachment` rows for ALL tenants. For each row, `getObject` from MinIO and write into `<tempdir>/attachments/<tenantId>/<storagePath>`. Build `attachments-manifest.json` (`{ originalStoragePath, archivePath, sizeBytes }` records).
4. **Package + upload.** Tar+gzip the temp directory into `meridian-backup-<runId>.tar.gz`, stream to MinIO under `backups/scheduled/<timestamp>_<runId>.tar.gz` or `backups/manual/<timestamp>_<ownerUserId>_<runId>.tar.gz` depending on trigger.
5. **Close audit row.** Update `BackupRun` with `status=COMPLETE`, `objectKey`, `sizeBytes`, `attachmentCount`, `dbRowCounts JSON` (sanity audit blob — counts of tickets/users/tenants/comments). On failure: `status=FAILED`, `errorMessage`. Always sets `finishedAt`.

### `backup-prune` job — runs daily on its own schedule

- Walks each MinIO prefix (`scheduled/`, `manual/`).
- Deletes any `BackupRun` row + corresponding MinIO object older than the retention window for that kind (separate windows for auto vs manual).
- Audit-logged: each pruned backup writes a row to the existing audit log (or a `BackupPruneRun` if more detail is wanted; default to the existing audit log).

### Tarball internal layout

```
meridian-backup-<runId>/
  MANIFEST.json            ← runId, timestamp, key fingerprint, schema version, env name, dbRowCounts
  KEY.txt                  ← current ENCRYPTION_KEY (plaintext)
  database.dump            ← pg_dump -Fc output
  attachments/
    <tenantId>/
      <mirrored storagePath>/file.ext
      ...
  attachments-manifest.json
  RESTORE.md               ← one-page restore instructions, env-specific commands pre-filled
```

`MANIFEST.json` is the source of truth for restore tooling. `attachments-manifest.json` is separate so MANIFEST stays small even when there are tens of thousands of attachments.

## Schema

### New Prisma model: `BackupRun`

In `packages/db/prisma/schema.prisma`:

```prisma
model BackupRun {
  id              String       @id @default(uuid()) @db.Uuid
  trigger         String       // 'SCHEDULED' | 'MANUAL'
  status          String       // 'RUNNING' | 'COMPLETE' | 'FAILED'
  triggeredById   String?      @db.Uuid    // OwnerUser.id, null for scheduled
  startedAt       DateTime     @default(now())
  finishedAt      DateTime?
  objectKey       String?
  sizeBytes       BigInt?
  attachmentCount Int?
  dbRowCounts     Json?
  keyFingerprint  String?
  errorMessage    String?
  createdAt       DateTime     @default(now())

  triggeredBy     OwnerUser?   @relation(fields: [triggeredById], references: [id], onDelete: SetNull)

  @@index([status, startedAt])
  @@index([trigger, startedAt])
  @@map("backup_runs")
}
```

Owner-admin scope only (no `tenantId`). Phase 2 adds a separate `TenantBackupRun` model.

### Settings — extend the existing owner settings table

Add rows (or columns, depending on existing shape — discover during implementation):

| Key | Type | Default |
|---|---|---|
| `backup.scheduledEnabled` | bool | `true` |
| `backup.scheduledCron` | string | `0 2 * * *` (daily 02:00 UTC) |
| `backup.retentionScheduledDays` | int | `14` |
| `backup.retentionManualDays` | int | `30` |
| `backup.bucketName` | string | `meridian-backups` |

If the codebase has no `OwnerSetting`-style key/value table yet, add a small one:

```prisma
model OwnerSetting {
  key       String   @id
  value     String   // JSON-serialized — number/string/bool
  updatedAt DateTime @updatedAt
  updatedById String? @db.Uuid
  updatedBy   OwnerUser? @relation(fields: [updatedById], references: [id], onDelete: SetNull)
}
```

### MinIO storage

Single bucket (default name `meridian-backups`, configurable). SSE enabled at bucket creation time. Two prefixes:

```
backups/scheduled/<ISO8601>_<runId>.tar.gz
backups/manual/<ISO8601>_<ownerUserId>_<runId>.tar.gz
```

Two prefixes so retention can differ per kind without per-row logic.

## UI

### New top-level page: `/backups`

Sidebar position: between System and Settings.

#### Top of page

Single-line banner with the trust-model warning text from the Trust Model section above.

#### Card A — Status & Schedule

- **Schedule:** `Daily at 02:00 UTC` (toggle + edit-cron link to `/settings#backups`).
- **Last successful:** `2 hours ago · 87 MB · 6 tenants · 24,772 activity rows`.
- **Last failed:** `none in 30 days` (or surfaces the latest error).
- **Retention:** `Auto: 14 days · Manual: 30 days` (edit link).
- **Primary button:** **▶ Backup now**. Becomes "Cancel" while a job is running. Polls completion via 2-second interval (or SSE if the existing infra supports it).

#### Card B — Recent backups list

Table sorted newest-first, paginated 25/page. Columns:

| Started | Trigger | Status | Size | Tenants | Attachments | Key fingerprint | Actions |

- **Download:** issues a presigned MinIO URL (15-min TTL), triggers browser download. No bytes through the api server.
- **Restore instructions:** opens modal with `RESTORE.md` content rendered, copy-to-clipboard per code block.
- **Delete:** confirmation modal → removes row + MinIO object. Audit-logged.
- **View error:** dialog with the full `errorMessage` for FAILED rows.

### Restore-instructions modal contents

Renders the same `RESTORE.md` content the tarball ships, with environment-specific values pre-substituted:

```
1. Download this backup. Verify SHA-256: <sha>
2. Stop services:
   ssh <env-host> "pm2 stop api worker web owner"
3. Extract and inspect:
   tar tzf meridian-backup-<runId>.tar.gz | head
4. Confirm KEY.txt matches your environment:
   diff <(grep ENCRYPTION_KEY /opt/meridian/apps/api/.env | cut -d= -f2) <(cat KEY.txt)
   (no output = match. If they differ — STOP and read troubleshooting below.)
5. Restore database:
   pg_restore -h <db-host> -U <db-role> -d <db-name> -j 4 --clean --if-exists database.dump
6. Restore attachments:
   <node-script ships with the tarball; reads attachments-manifest.json and pushes
   each file back into MinIO via the configured S3 client>
7. Restart:
   ssh <env-host> "pm2 restart api worker web owner --update-env"
```

Plus a "Troubleshooting: my key fingerprint doesn't match" section in `RESTORE.md` explaining that the matching key is in `KEY.txt` and either has to replace `.env`'s key OR the backup must be restored to a fresh environment that adopts the embedded key.

### Settings additions: `/settings#backups`

In the existing `/settings` page:

- Scheduled backups on/off toggle.
- Cron expression input with helper picker ("Daily at 2am UTC", "Every 6 hours", "Weekly Sunday 02:00 UTC").
- Retention day inputs: separate sliders 1-90 for scheduled vs manual.
- Bucket name (admin-editable; defaulted on first save).

## API Surface

New routes under `apps/owner/src/app/api/backups/`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/backups` | list `BackupRun` rows, paginated |
| POST | `/api/backups` | enqueue manual `backup-create` job |
| GET | `/api/backups/:id` | single row + presigned MinIO download URL on demand |
| GET | `/api/backups/:id/restore-instructions` | rendered Markdown + structured commands for the modal |
| DELETE | `/api/backups/:id` | remove row + MinIO object |
| GET | `/api/backups/settings` | current backup settings |
| PATCH | `/api/backups/settings` | update settings (cron, retention, bucket) |

All routes require an authenticated `OwnerUser` session. Owner admin already enforces this via its existing auth middleware.

## Worker

New BullMQ jobs in `apps/worker`:

- `backup-create` (queue: `backups`) — the five-step flow above.
- `backup-prune` (queue: `backups`) — retention cleanup.

Worker registration: extend the existing worker boot file to consume the `backups` queue. Schedule the recurring cron job from the same place that registers existing scheduled workers (sla-monitor, email-polling, etc.) — pattern is already established.

The worker imports a new `@meridian/backup` package (or, if the existing `packages/core` has the right dependency footprint, lives there) containing:
- `createBackup(triggerCtx)` — the five-step orchestration.
- `pruneBackups(retentionConfig)` — prune logic.
- `loadKeyFingerprint(currentKey)` — SHA-256 first 16 chars.

The api side and the worker side both import from this shared package — keeps the api routes thin (just enqueue + read) and the worker side substantive.

## Failure & Retry

- `backup-create` retries 0 times by default. A failed backup row stays as `FAILED` for visibility; the next scheduled run starts fresh.
- The job has a 30-minute default timeout (configurable).  Most backups should finish in under a minute on dev (~22 MB DB compressed); a 30-minute ceiling is generous for future growth.
- A backup that errors mid-upload leaves an orphan partial MinIO object. `backup-prune` cleans those up by checking for `objectKey IS NOT NULL` rows in `FAILED` status and removing the object.

## Phase 2 — per-tenant (preview, not building)

Captured here for traceability; will get its own spec when scheduled.

1. **New model `TenantBackupRun`** with same shape + `tenantId` FK.
2. **New BullMQ job `tenant-backup-create`** reusing 90% of the same code; pg_dump is filtered to a per-tenant SQL stream that walks all tables with a `tenantId` column; attachment enumeration filters to that tenant.
3. **Cross-tenant references** are the hard part. Tickets reference per-tenant `Queue`, `Category`, `User` — fine. But also reference `SubscriptionPlan` (global, shared), the parent `Tenant` row itself, and seeded `NotificationRule` rows. Phase 2 needs a strategy for "skip-or-merge" on globals during restore.
4. **Use cases unblocked**:
   - GDPR data-portability requests.
   - Cloning a tenant from prod into dev for bug repro.
   - Tenant offboarding (hand-over + delete).
5. **Restore-into-different-tenant** (rewriting tenantId during restore) is Phase 3, separate.

## Implementation Notes / Hooks for the writing-plans skill

- The existing audit log mechanism (the `audit_logs` table) already tracks owner-admin actions; backup creation/deletion should write rows there too.
- `apps/worker` already has the BullMQ infrastructure plus scheduled-job registration patterns (`sla-monitor.worker.ts`, `email-polling.worker.ts`). The new `backups` queue follows the same pattern.
- MinIO/S3 access already lives in `@meridian/core` (`uploadFile`, `getFreshAccessToken` etc. in the same package). The backup package extends that surface with `streamToMinIO`, `getObject`, `headObject`, `listPrefix`, `deleteObject` — confirm during implementation whether all these exist; add what doesn't.
- The owner-admin app (`apps/owner`) already has session auth + the API-route pattern. New backup routes follow that pattern.
- Cron parsing: use the same library BullMQ uses internally (`cron-parser`) to validate user-entered cron expressions.

## Open questions surfaced as defaults — confirm during implementation

| Question | Default chosen | Where to revisit |
|---|---|---|
| Bucket name | `meridian-backups` | Settings page; per-environment via env var if multi-environment |
| Cron default | `0 2 * * *` (02:00 UTC daily) | Settings page |
| Retention auto / manual | 14 / 30 days | Settings page |
| Presigned URL TTL | 15 minutes | Hard-coded; reconsider if there are reports of expired downloads on slow links |
| Job timeout | 30 minutes | Hard-coded |
| Retry on failure | 0 retries | Hard-coded; failed runs remain visible for diagnosis |

## Self-review

- **Placeholders:** none. Every section has concrete details.
- **Internal consistency:** trust model explicitly says key is bundled; UI section reflects that; tarball layout includes `KEY.txt`.
- **Scope:** Phase 1 only; Phase 2 explicitly deferred. Suitable for one implementation plan.
- **Ambiguity:** the `OwnerSetting` table existence is the one unknown — spec calls out "discover during implementation."
