import { ImapFlow } from 'imapflow';
import { decrypt } from '@meridian/core';
import { prisma } from '@meridian/db';

async function main() {
  const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
  if (!account || !account.imapHost) { console.log('No IMAP account'); return; }

  let pass = '';
  if (account.imapPasswordEnc) {
    try { pass = decrypt(account.imapPasswordEnc); } catch { pass = ''; }
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: { user: account.imapUser!, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  const status = await client.status('INBOX', { messages: true, unseen: true });
  console.log('INBOX — total:', status.messages, 'unseen:', status.unseen);

  // Fetch last 10 messages with flags
  if (status.messages && status.messages > 0) {
    const start = Math.max(1, status.messages - 9);
    for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true })) {
      const seen = msg.flags.has('\\Seen');
      console.log(`  uid:${msg.uid} seen:${seen} date:${msg.envelope.date?.toISOString()?.substring(0,16)} subj: ${msg.envelope.subject?.substring(0, 60)}`);
    }
  }

  lock.release();
  await client.logout();
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
