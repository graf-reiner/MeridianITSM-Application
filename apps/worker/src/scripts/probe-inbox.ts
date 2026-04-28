/**
 * One-shot IMAP diagnostic. Lists INBOX + Junk + key folders for a given
 * email account, showing subject, From, flags, UID, and arrival date.
 *
 * Usage:
 *   tsx src/scripts/probe-inbox.ts <emailAccountId>
 */
import { ImapFlow } from 'imapflow';
import { prisma } from '@meridian/db';
import { decrypt, getFreshAccessToken, getOAuthCredentials } from '@meridian/core';

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: tsx src/scripts/probe-inbox.ts <emailAccountId>');
  process.exit(1);
}

async function main(): Promise<void> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    console.error(`No EmailAccount with id ${accountId}`);
    process.exit(1);
  }
  console.log(`\n=== ${account.emailAddress} (${account.id}) ===`);
  console.log(`imapHost: ${account.imapHost}, port: ${account.imapPort}, secure: ${account.imapSecure}`);
  console.log(`authProvider: ${account.authProvider}, lastPolledAt: ${account.lastPolledAt?.toISOString() ?? 'NULL'}`);

  const provider = (account.authProvider ?? 'MANUAL').toLowerCase();
  let imapAuth: { user: string; pass?: string; accessToken?: string };

  if (provider === 'google' || provider === 'microsoft') {
    const creds = await getOAuthCredentials(prisma, provider as 'google' | 'microsoft');
    if (!creds) throw new Error('OAuth credentials not configured');
    if (!account.oauthRefreshTokenEnc) throw new Error('No refresh token');
    const tok = await getFreshAccessToken(
      provider as 'google' | 'microsoft',
      account.oauthAccessTokenEnc ?? '',
      account.oauthRefreshTokenEnc,
      account.oauthTokenExpiresAt ?? new Date(0),
      creds.clientId,
      creds.clientSecret,
    );
    console.log(`token refreshed: ${tok.refreshed}, expires: ${tok.newExpiresAt?.toISOString() ?? '(unchanged)'}`);
    imapAuth = { user: account.imapUser ?? account.emailAddress, accessToken: tok.accessToken };
  } else {
    if (!account.imapPasswordEnc || !account.imapUser) throw new Error('No password/user');
    imapAuth = { user: account.imapUser, pass: decrypt(account.imapPasswordEnc) };
  }

  const client = new ImapFlow({
    host: account.imapHost!,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: imapAuth,
    logger: false,
  });

  await client.connect();
  console.log('connected.');

  // List all top-level mailboxes
  const tree = await client.list();
  console.log(`\n--- mailbox tree (${tree.length} folders) ---`);
  for (const m of tree) {
    console.log(`  ${m.path}${m.specialUse ? ` [${m.specialUse}]` : ''}`);
  }

  for (const folder of ['INBOX', 'Junk Email', 'Sent Items']) {
    if (!tree.find(m => m.path === folder)) continue;
    console.log(`\n--- ${folder} ---`);
    const lock = await client.getMailboxLock(folder);
    try {
      const status = await client.status(folder, { messages: true, unseen: true });
      console.log(`status: ${status.messages} total, ${status.unseen} unseen`);

      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const searchResult = await client.search({ since }, { uid: true });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      console.log(`messages in last 24h: ${uids.length}`);
      if (uids.length === 0) continue;

      const fetchUids = uids.slice(-20); // last 20
      for await (const msg of client.fetch(fetchUids, { envelope: true, flags: true, internalDate: true }, { uid: true })) {
        const subject = msg.envelope?.subject ?? '(no subject)';
        const from = msg.envelope?.from?.[0]?.address ?? '?';
        const to = msg.envelope?.to?.map(t => t.address).join(', ') ?? '?';
        const flags = [...(msg.flags ?? [])].join(',');
        const date = msg.internalDate ? new Date(msg.internalDate).toISOString() : '?';
        console.log(`  uid=${msg.uid} date=${date} flags=[${flags}] from=${from} to=${to}`);
        console.log(`    subject: ${subject.slice(0, 100)}`);
      }
    } finally {
      lock.release();
    }
  }

  await client.logout();
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('FATAL:', err);
  console.error(err instanceof Error ? err.stack : '');
  process.exit(1);
});
