/**
 * Email Inbound Service (worker-side copy)
 *
 * Duplicated from apps/api/src/services/email-inbound.service.ts to avoid cross-app imports.
 * Provides: IMAP mailbox polling, reply threading, deduplication, ticket/comment creation.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'node:crypto';
import { prisma, PrismaClient } from '@meridian/db';
import { decrypt, encrypt, uploadFile, getFreshAccessToken, getOAuthCredentials } from '@meridian/core';
import { Redis } from 'ioredis';
import { logEmailActivity } from './email-activity.service.js';
import { markTestReceived, CONNECTOR_TEST_SUBJECT_REGEX } from './connector-test.service.js';

// Derive EmailAccount type from PrismaClient to avoid direct @prisma/client import
type EmailAccount = Awaited<ReturnType<PrismaClient['emailAccount']['findUniqueOrThrow']>>;

// ─── Redis for deduplication ──────────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err: Error) => console.error('[email-inbound] Redis error:', err));

// ─── Constants ────────────────────────────────────────────────────────────────

const DEDUP_TTL_SECONDS = 90 * 24 * 3600; // 90 days
const DEDUP_KEY_PREFIX = 'email:msgids:';
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── Deduplication ────────────────────────────────────────────────────────────

export async function isDuplicate(tenantId: string, messageId: string): Promise<boolean> {
  const key = `${DEDUP_KEY_PREFIX}${tenantId}`;
  const isMember = await redis.sismember(key, messageId);
  if (isMember === 1) return true;
  await redis.sadd(key, messageId);
  await redis.expire(key, DEDUP_TTL_SECONDS);
  return false;
}

// ─── Reply Threading ──────────────────────────────────────────────────────────

export async function findTicketByHeaders(
  tenantId: string,
  references?: string[],
  inReplyTo?: string,
): Promise<{ id: string; ticketNumber: number } | null> {
  const searchIds: string[] = [];
  if (inReplyTo) searchIds.push(inReplyTo);
  if (references) searchIds.push(...references);
  if (searchIds.length === 0) return null;

  for (const msgId of searchIds) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        tenantId,
        customFields: { path: ['outboundMessageIds'], array_contains: msgId },
      },
      select: { id: true, ticketNumber: true },
    });
    if (ticket) return ticket;
  }
  return null;
}

export async function findTicketBySubject(
  tenantId: string,
  subject: string,
): Promise<{ id: string; ticketNumber: number } | null> {
  const match = /TKT-(\d{5})/i.exec(subject);
  if (!match) return null;
  const ticketNumber = parseInt(match[1], 10);
  return prisma.ticket.findFirst({
    where: { tenantId, ticketNumber },
    select: { id: true, ticketNumber: true },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function lookupUserByEmail(tenantId: string, email?: string): Promise<string | null> {
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: { tenantId, email: email.toLowerCase() },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function createTicketFromEmail(
  tenantId: string,
  data: {
    title: string;
    description: string;
    queueId?: string;
    categoryId?: string;
    requestedById?: string;
  },
): Promise<{ id: string; assignedToId: string | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ticket_seq'))`;
    const result = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
      FROM tickets
      WHERE "tenantId" = ${tenantId}::uuid
    `;

    const ticketNumber = Number(result[0]!.next);

    let assignedToId: string | null = null;
    if (data.queueId) {
      const queue = await tx.queue.findFirst({
        where: { id: data.queueId, tenantId },
        select: { autoAssign: true, defaultAssigneeId: true },
      });
      if (queue?.autoAssign && queue.defaultAssigneeId) {
        assignedToId = queue.defaultAssigneeId;
      }
    }

    return tx.ticket.create({
      data: {
        tenantId,
        ticketNumber,
        title: data.title,
        description: data.description,
        type: 'INCIDENT',
        priority: 'MEDIUM',
        queueId: data.queueId,
        categoryId: data.categoryId,
        requestedById: data.requestedById,
        assignedToId,
        source: 'EMAIL',
      },
      select: { id: true, assignedToId: true },
    });
  });
}

async function addEmailComment(tenantId: string, ticketId: string, content: string): Promise<void> {
  await prisma.ticketComment.create({
    data: {
      tenantId,
      ticketId,
      authorId: null as unknown as string,
      content,
      visibility: 'PUBLIC',
    },
  });
}

// ─── Mailbox Polling ──────────────────────────────────────────────────────────

export async function pollMailbox(account: EmailAccount): Promise<{ newTickets: number; comments: number }> {
  if (!account.imapHost) {
    console.warn(`[email-inbound] Account ${account.id} missing IMAP host, skipping`);
    return { newTickets: 0, comments: 0 };
  }

  // Determine IMAP auth based on authProvider
  let imapAuth: { user: string; pass?: string; accessToken?: string };

  const authProvider = (account as any).authProvider as string | null;

  if (authProvider === 'GOOGLE' || authProvider === 'MICROSOFT') {
    // ── OAuth2 path ──
    const encRefresh = (account as any).oauthRefreshTokenEnc as string | null;
    if (!encRefresh) {
      console.warn(`[email-inbound] OAuth account ${account.id} missing refresh token, skipping`);
      return { newTickets: 0, comments: 0 };
    }

    const providerLower = authProvider.toLowerCase() as 'google' | 'microsoft';

    // Resolve OAuth credentials — DB first (Owner Admin Integrations wizard), env fallback
    const creds = await getOAuthCredentials(prisma, providerLower);
    if (!creds) {
      console.warn(`[email-inbound] Missing ${authProvider} OAuth client credentials (DB + env both empty), skipping account ${account.id}`);
      return { newTickets: 0, comments: 0 };
    }

    try {
      const encAccess = (account as any).oauthAccessTokenEnc as string | null;
      const expiresAt = (account as any).oauthTokenExpiresAt as Date | null;

      const result = await getFreshAccessToken(
        providerLower,
        encAccess ?? '',
        encRefresh,
        expiresAt ?? new Date(0),
        creds.clientId,
        creds.clientSecret,
      );

      if (result.refreshed) {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            oauthAccessTokenEnc: encrypt(result.accessToken),
            oauthTokenExpiresAt: result.newExpiresAt ?? null,
            oauthConnectionStatus: 'CONNECTED',
          } as any,
        });
      }

      imapAuth = {
        user: account.imapUser ?? account.emailAddress,
        accessToken: result.accessToken,
      };
    } catch (oauthErr) {
      console.error(
        `[email-inbound] OAuth token refresh failed for account ${account.id}: ${oauthErr instanceof Error ? oauthErr.message : String(oauthErr)}`,
      );

      // Mark account as disconnected
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          oauthConnectionStatus: 'REFRESH_FAILED',
          isActive: false,
        } as any,
      });

      // Notify tenant admin (non-critical)
      prisma.user.findFirst({
        where: {
          tenantId: account.tenantId,
          userRoles: { some: { role: { slug: 'admin', tenantId: account.tenantId } } },
        },
        select: { id: true },
      }).then((adminUser) => {
        if (adminUser) {
          return prisma.notification.create({
            data: {
              tenantId: account.tenantId,
              userId: adminUser.id,
              type: 'SYSTEM',
              title: `Email account "${(account as any).name ?? account.emailAddress}" disconnected`,
              body: 'The OAuth token could not be refreshed. Please reconnect the email account in Settings.',
            },
          });
        }
      }).catch(() => { /* notification is non-critical */ });

      return { newTickets: 0, comments: 0 };
    }
  } else {
    // ── Manual / password path ──
    if (!account.imapUser || !account.imapPasswordEnc) {
      console.warn(`[email-inbound] Account ${account.id} missing IMAP credentials, skipping`);
      return { newTickets: 0, comments: 0 };
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decrypt(account.imapPasswordEnc);
    } catch (decryptErr) {
      console.error(
        `[email-inbound] Failed to decrypt IMAP password for account ${account.id}: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`,
      );
      return { newTickets: 0, comments: 0 };
    }

    imapAuth = { user: account.imapUser, pass: decryptedPassword };
  }

  // IMAP on port 993 is implicit TLS (NOT STARTTLS like SMTP/587). Honor the
  // per-account imapSecure flag — both Google and Microsoft default it to true
  // when their OAuth accounts are created. Forcing secure:false here for OAuth
  // (the prior behavior) caused imapflow to send plain-text on a TLS port and
  // time out waiting for an unencrypted greeting.
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: imapAuth,
    logger: false,
  });

  let newTickets = 0;
  let comments = 0;
  let testsReceived = 0;

  // Activity-log the start of the cycle so the live tail surfaces the poll.
  await logEmailActivity({
    tenantId: account.tenantId,
    emailAccountId: account.id,
    direction: 'INBOUND',
    status: 'POLL_STARTED',
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Log mailbox status for diagnostics
      const status = await client.status('INBOX', { messages: true, unseen: true });
      console.log(`[email-inbound] Account ${account.id}: INBOX has ${status.messages} total, ${status.unseen} unseen`);

      // Bound the fetch by date AND by per-cycle count, then process newest-first.
      //
      // Reasoning:
      // - On a long-lived mailbox the unseen count can be 60k+. A single wide
      //   FETCH on that range makes M365 IMAP return "Command failed".
      // - First poll on a new account: treat "now" as the cutoff so we don't
      //   back-fill historical mail into tickets.
      // - Newest-first: ensures recent messages (tickets, replies, connector-test
      //   roundtrips) get processed even if there's an old backlog.
      // - Per-cycle cap: leftover backlog drains across subsequent polls.
      const MAX_MESSAGES_PER_CYCLE = 100;
      const sinceDate = account.lastPolledAt ?? new Date();
      const searchResult = await client.search({ seen: false, since: sinceDate }, { uid: true });
      // imapflow returns `number[]` on success or `false` on no-match / error.
      const matchingUids: number[] = Array.isArray(searchResult) ? searchResult : [];
      const uidsNewestFirst = matchingUids
        .sort((a, b) => b - a) // descending — IMAP UIDs are monotonically increasing per mailbox
        .slice(0, MAX_MESSAGES_PER_CYCLE);

      if (matchingUids.length > MAX_MESSAGES_PER_CYCLE) {
        console.log(`[email-inbound] Account ${account.id}: ${matchingUids.length} matching unseen messages, processing newest ${MAX_MESSAGES_PER_CYCLE} this cycle`);
      }

      const messages = uidsNewestFirst.length === 0
        ? (async function* (): AsyncGenerator<never, void, unknown> { /* empty */ })()
        : client.fetch(uidsNewestFirst, { envelope: true, source: true }, { uid: true });

      for await (const message of messages) {
        try {
          if (!message.source) {
            console.warn(`[email-inbound] No source in message for account ${account.id}, skipping`);
            continue;
          }

          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId;

          // Connector-test correlation hook — runs BEFORE dedup so a test
          // message never becomes a ticket. The api dropped this token in the
          // subject when starting the test; we flip the test's roundtrip phase
          // to OK and skip the rest of the per-message handling.
          const tokenMatch = parsed.subject?.match(CONNECTOR_TEST_SUBJECT_REGEX);
          if (tokenMatch && tokenMatch[1]) {
            const token = tokenMatch[1];
            await markTestReceived(account.tenantId, token, parsed);
            await logEmailActivity({
              tenantId: account.tenantId,
              emailAccountId: account.id,
              direction: 'INBOUND',
              status: 'RECEIVED',
              subject: parsed.subject ?? undefined,
              fromAddress: parsed.from?.value?.[0]?.address ?? undefined,
              messageId: messageId ?? undefined,
              rawMeta: { connectorTest: true, token },
            });
            testsReceived++;
            await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'], { uid: true });
            continue;
          }

          if (!messageId) {
            console.warn(`[email-inbound] No Message-ID in account ${account.id}, skipping`);
            continue;
          }

          if (await isDuplicate(account.tenantId, messageId)) {
            console.log(`[email-inbound] Duplicate Message-ID ${messageId}, skipping`);
            await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'], { uid: true });
            continue;
          }

          const inReplyTo = parsed.inReplyTo;
          const references = Array.isArray(parsed.references)
            ? parsed.references
            : parsed.references
            ? [parsed.references]
            : undefined;

          const existingTicket =
            (await findTicketByHeaders(account.tenantId, references, inReplyTo)) ??
            (await findTicketBySubject(account.tenantId, parsed.subject ?? ''));

          const htmlContent = parsed.html !== false ? (parsed.html ?? '') : '';
          const textContent: string = parsed.text ?? htmlContent ?? '(No content)';

          if (existingTicket) {
            await addEmailComment(account.tenantId, existingTicket.id, textContent);
            comments++;
            await logEmailActivity({
              tenantId: account.tenantId,
              emailAccountId: account.id,
              direction: 'INBOUND',
              status: 'RECEIVED',
              subject: parsed.subject ?? undefined,
              fromAddress: parsed.from?.value?.[0]?.address ?? undefined,
              messageId: messageId,
              ticketId: existingTicket.id,
              rawMeta: { kind: 'comment-on-existing' },
            });
          } else {
            const fromEmail = parsed.from?.value?.[0]?.address;
            const requestedById = await lookupUserByEmail(account.tenantId, fromEmail);

            const ticket = await createTicketFromEmail(account.tenantId, {
              title: parsed.subject ?? 'No Subject',
              description: textContent,
              queueId: account.defaultQueueId ?? undefined,
              categoryId: account.defaultCategoryId ?? undefined,
              requestedById: requestedById ?? undefined,
            });

            newTickets++;
            await logEmailActivity({
              tenantId: account.tenantId,
              emailAccountId: account.id,
              direction: 'INBOUND',
              status: 'RECEIVED',
              subject: parsed.subject ?? undefined,
              fromAddress: fromEmail ?? undefined,
              messageId: messageId,
              ticketId: ticket.id,
              rawMeta: { kind: 'new-ticket' },
            });

            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                customFields: {
                  outboundMessageIds: [messageId],
                  fromEmail: fromEmail ?? null,
                  originalMessageId: messageId,
                } as object,
              },
            });

            if (parsed.attachments && parsed.attachments.length > 0) {
              let totalSize = 0;

              for (const attachment of parsed.attachments) {
                totalSize += attachment.size ?? attachment.content.length;
                if (totalSize > MAX_ATTACHMENT_TOTAL_BYTES) {
                  console.warn(`[email-inbound] Attachment size limit reached for ticket ${ticket.id}`);
                  break;
                }

                const filename = attachment.filename ?? 'attachment.bin';
                const ext = filename.includes('.') ? filename.split('.').pop()! : 'bin';

                try {
                  const storedKey = await uploadFile(
                    account.tenantId,
                    `email-attachments/${ticket.id}`,
                    `${randomUUID()}.${ext}`,
                    attachment.content,
                    attachment.contentType,
                  );

                  if (requestedById) {
                    await prisma.ticketAttachment.create({
                      data: {
                        tenantId: account.tenantId,
                        ticketId: ticket.id,
                        uploadedById: requestedById,
                        filename,
                        mimeType: attachment.contentType,
                        fileSize: attachment.size ?? attachment.content.length,
                        storagePath: storedKey,
                      },
                    });
                  }
                } catch (attachErr) {
                  console.error(
                    `[email-inbound] Attachment upload failed: ${attachErr instanceof Error ? attachErr.message : String(attachErr)}`,
                  );
                }
              }
            }
          }

          await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'], { uid: true });
        } catch (msgErr) {
          console.error(
            `[email-inbound] Error processing message in account ${account.id}: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`,
          );
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[email-inbound] Failed to poll mailbox for account ${account.id}: ${errMsg}`,
    );
    await logEmailActivity({
      tenantId: account.tenantId,
      emailAccountId: account.id,
      direction: 'INBOUND',
      status: 'POLL_FAILED',
      errorMessage: errMsg,
      rawMeta: { newTickets, comments, testsReceived },
    });
    throw err;
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastPolledAt: new Date() },
  });

  await logEmailActivity({
    tenantId: account.tenantId,
    emailAccountId: account.id,
    direction: 'INBOUND',
    status: 'POLL_COMPLETE',
    rawMeta: { newTickets, comments, testsReceived },
  });

  return { newTickets, comments };
}