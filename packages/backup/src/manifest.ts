import type { BackupTrigger } from './types.js';

export interface ManifestInput {
  runId:           string;
  trigger:         BackupTrigger;
  startedAt:       Date;
  envName:         string;        // 'dev' | 'uat' | 'prod' or whatever NODE_ENV-ish hint
  schemaVersion:   string;        // _prisma_migrations.migration_name of the latest applied
  keyFingerprint:  string;
  dbRowCounts:     Record<string, number>;
  attachmentCount: number;
}

export function buildManifest(input: ManifestInput): string {
  return JSON.stringify({
    runId:           input.runId,
    trigger:         input.trigger,
    startedAt:       input.startedAt.toISOString(),
    envName:         input.envName,
    schemaVersion:   input.schemaVersion,
    keyFingerprint:  input.keyFingerprint,
    dbRowCounts:     input.dbRowCounts,
    attachmentCount: input.attachmentCount,
    formatVersion:   1,
  }, null, 2);
}

export interface RestoreMdInput {
  runId:        string;
  startedAt:    Date;
  envName:      string;
  dbHost:       string;       // e.g., '10.1.200.78'
  dbName:       string;       // e.g., 'meridian'
  dbRole:       string;       // e.g., 'meridian_dev'
  pmHosts:      string[];     // e.g., ['meridian-dev']
  archiveSha256: string;
}

export function buildRestoreMd(input: RestoreMdInput): string {
  const sshHosts = input.pmHosts.map(h => `ssh ${h}`).join(' && ');
  return `# Restore instructions — backup ${input.runId}

This backup was created from the **${input.envName}** environment on ${input.startedAt.toISOString()}.
Archive SHA-256: \`${input.archiveSha256}\`

## Step 1 — Stop services

\`\`\`bash
${sshHosts} "pm2 stop api worker web owner"
\`\`\`

## Step 2 — Extract and inspect

\`\`\`bash
tar tzf meridian-backup-${input.runId}.tar.gz | head
\`\`\`

## Step 3 — Confirm KEY.txt matches

\`\`\`bash
diff <(grep ENCRYPTION_KEY /opt/meridian/apps/api/.env | cut -d= -f2) <(cat KEY.txt)
\`\`\`

No output means the keys match — safe to restore. If they differ:

- **Option A**: replace your \`.env\` ENCRYPTION_KEY with the value in \`KEY.txt\` (BOTH api and worker .env files). Restart before continuing.
- **Option B**: accept that encrypted columns (OAuth tokens, SMTP/IMAP passwords) will be unreadable after restore. The app will still run; users with OAuth-connected mailboxes will have to re-authenticate.

## Step 4 — Restore the database

\`\`\`bash
pg_restore -h ${input.dbHost} -U ${input.dbRole} -d ${input.dbName} -j 4 --clean --if-exists database.dump
\`\`\`

## Step 5 — Restore attachments

\`\`\`bash
node restore-attachments.js  # ships with this archive; reads attachments-manifest.json
\`\`\`

## Step 6 — Restart services

\`\`\`bash
${sshHosts} "pm2 restart api worker web owner --update-env"
\`\`\`

## Step 7 — Verify

- Log into the web UI; users + tickets should be present.
- Send a test email to the monitored mailbox; verify a ticket is created and the seed-rule reply lands.
- Check \`email_activity_logs\` for fresh OUTBOUND rows.
`;
}
