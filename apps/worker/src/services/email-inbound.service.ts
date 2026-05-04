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
import { decrypt, encrypt, uploadFile, getFreshAccessToken, getOAuthCredentials, TICKET_NUMBER_SUBJECT_REGEX } from '@meridian/core';
import { Redis } from 'ioredis';
import { logEmailActivity } from './email-activity.service.js';
import { markTestReceived, CONNECTOR_TEST_SUBJECT_REGEX } from './connector-test.service.js';
import { findOrCreateAnonymousUser } from './anonymous-user.service.js';
import { dispatchNotificationEvent, type EventContext } from '@meridian/notifications';

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
  const match = subject.match(TICKET_NUMBER_SUBJECT_REGEX);
  if (!match) return null;
  const ticketNumber = parseInt(match[1], 10);
  return prisma.ticket.findFirst({
    where: { tenantId, ticketNumber },
    select: { id: true, ticketNumber: true },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

    const ticket = await tx.ticket.create({
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
      select: { id: true, assignedToId: true, title: true, type: true, priority: true },
    });

    // Mirror the API's ticket.service.ts CREATED activity write so the per-ticket
    // Activity tab is populated for email-originated tickets.
    await tx.ticketActivity.create({
      data: {
        tenantId,
        ticketId: ticket.id,
        actorId: data.requestedById ?? null,
        activityType: 'CREATED',
        metadata: {
          title: ticket.title,
          type: ticket.type,
          priority: ticket.priority,
          source: 'EMAIL',
        },
      },
    });

    return { id: ticket.id, assignedToId: ticket.assignedToId };
  });
}

async function addEmailComment(
  tenantId: string,
  ticketId: string,
  authorId: string,
  content: string,
): Promise<string> {
  const created = await prisma.ticketComment.create({
    data: {
      tenantId,
      ticketId,
      authorId,
      content,
      visibility: 'PUBLIC',
    },
    select: { id: true },
  });

  // Mirror the API's ticket.service.ts COMMENT_ADDED activity write so the
  // per-ticket Activity tab shows the email-originated reply.
  await prisma.ticketActivity.create({
    data: {
      tenantId,
      ticketId,
      actorId: authorId,
      activityType: 'COMMENT_ADDED',
      metadata: {
        commentId: created.id,
        visibility: 'PUBLIC',
        source: 'EMAIL',
      },
    },
  });

  return created.id;
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
  // socketTimeout default in imapflow is 60s, which kills M365 FETCH cycles
  // mid-stream — a single pollMailbox can take longer than 60s when fetching
  // RFC822 source for several messages (each FETCH BODY[] is sequential and
  // M365 is slow returning full bodies). 5 min is a safe upper bound; the
  // worker job's own timeout catches anything truly stuck.
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: imapAuth,
    logger: false,
    greetingTimeout: 30_000,
    socketTimeout: 5 * 60 * 1000,
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

  // Hoisted to function scope so the per-poll persistence block at the bottom
  // can read it regardless of which inner try-block exited.
  let highestUid = account.lastProcessedUid ?? 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Log mailbox status for diagnostics
      const status = await client.status('INBOX', { messages: true, unseen: true });
      console.log(`[email-inbound] Account ${account.id}: INBOX has ${status.messages} total, ${status.unseen} unseen`);

      // UID-based fetch — track lastProcessedUid per account so we never
      // miss a message that was marked \Seen by something other than us
      // (Outlook Web reading pane, mail rules, mobile clients).
      //
      // - First poll (lastProcessedUid=0): baseline at current UIDNEXT-1 so we
      //   don't reprocess the entire historical mailbox. The user's first real
      //   message will be uid > baseline and get picked up next cycle.
      // - Subsequent polls: search uid > lastProcessedUid.
      // - Per-cycle cap (MAX_MESSAGES_PER_CYCLE): leftover backlog drains across
      //   later polls without slamming M365 with one huge FETCH.
      const MAX_MESSAGES_PER_CYCLE = 100;
      const lastProcessedUid = highestUid;

      if (lastProcessedUid === 0) {
        const baseline = client.mailbox && typeof client.mailbox === 'object' && 'uidNext' in client.mailbox
          ? Math.max(0, ((client.mailbox as { uidNext?: number }).uidNext ?? 1) - 1)
          : 0;
        highestUid = baseline;
        console.log(`[email-inbound] First poll for ${account.id}, baseline uid=${baseline}`);
      }

      const uidRange = `${highestUid + 1}:*`;
      const searchResult = await client.search({ uid: uidRange }, { uid: true });
      // imapflow returns `number[]` on success or `false` on no-match / error.
      const matchingUids: number[] = Array.isArray(searchResult) ? searchResult : [];
      const uidsNewestFirst = matchingUids
        .filter(uid => uid > highestUid)
        .sort((a, b) => b - a) // descending — IMAP UIDs are monotonically increasing per mailbox
        .slice(0, MAX_MESSAGES_PER_CYCLE);

      if (matchingUids.length > MAX_MESSAGES_PER_CYCLE) {
        console.log(`[email-inbound] Account ${account.id}: ${matchingUids.length} matching messages newer than uid=${lastProcessedUid}, processing newest ${MAX_MESSAGES_PER_CYCLE} this cycle`);
      }

      const messages = uidsNewestFirst.length === 0
        ? (async function* (): AsyncGenerator<never, void, unknown> { /* empty */ })()
        : client.fetch(uidsNewestFirst, { envelope: true, source: true }, { uid: true });

      // CRITICAL: do NOT issue STORE (messageFlagsAdd) calls inside the
      // for-await loop while the FETCH iterator is still streaming. IMAP is
      // a single-command-at-a-time protocol per connection, and M365 in
      // particular hangs the FETCH if a STORE is interleaved — the iterator
      // never yields a second message and the socket eventually times out.
      // Collect UIDs here and issue a single batched STORE after the loop.
      const uidsToMarkSeen: number[] = [];

      for await (const message of messages) {
        // Advance the UID watermark for EVERY fetched message — even ones we
        // skip — so the next poll cycle picks up where this one left off.
        highestUid = Math.max(highestUid, message.uid);
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
            uidsToMarkSeen.push(message.uid);
            continue;
          }

          if (!messageId) {
            console.warn(`[email-inbound] No Message-ID in account ${account.id}, skipping`);
            continue;
          }

          if (await isDuplicate(account.tenantId, messageId)) {
            console.log(`[email-inbound] Duplicate Message-ID ${messageId}, skipping`);
            uidsToMarkSeen.push(message.uid);
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
            // Resolve the comment author. We must NOT pass null — TicketComment.authorId
            // is a required FK. Strategy: if the sender's email already maps to a User
            // in this tenant, attribute the comment to that user; otherwise create a
            // no-login "anonymous" User (same pattern inbound webhooks use for
            // unrecognized requesters) so external repliers still get a stable
            // identity and the comment threads correctly.
            const fromEmail = parsed.from?.value?.[0]?.address;
            const fromDisplayName = parsed.from?.value?.[0]?.name ?? '';
            const spaceIdx = fromDisplayName.indexOf(' ');
            const fromFirst = spaceIdx === -1 ? (fromDisplayName || 'External') : fromDisplayName.slice(0, spaceIdx);
            const fromLast = spaceIdx === -1 ? (fromDisplayName ? '' : 'Email') : fromDisplayName.slice(spaceIdx + 1);

            if (!fromEmail) {
              throw new Error('Inbound email reply has no sender address — cannot create comment');
            }
            const authorId = await findOrCreateAnonymousUser(
              account.tenantId,
              fromEmail,
              fromFirst,
              fromLast,
            );

            // Audit the receipt BEFORE the comment-create so the row exists even
            // if anything downstream throws.
            await logEmailActivity({
              tenantId: account.tenantId,
              emailAccountId: account.id,
              direction: 'INBOUND',
              status: 'RECEIVED',
              subject: parsed.subject ?? undefined,
              fromAddress: fromEmail,
              messageId: messageId,
              ticketId: existingTicket.id,
              rawMeta: { kind: 'comment-on-existing' },
            });

            const commentId = await addEmailComment(account.tenantId, existingTicket.id, authorId, textContent);
            comments++;

            // dispatchNotificationEvent now fires both seed NotificationRules AND
            // user-built Workflows (since @meridian/notifications consolidation).
            // Wrapped in try/catch so a dispatch failure doesn't abort the poll cycle.
            try {
              const fullTicket = await prisma.ticket.findUnique({
                where: { id: existingTicket.id },
                include: {
                  queue: true,
                  assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
                  requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
                  category: true,
                },
              });
              if (fullTicket) {
                await dispatchNotificationEvent(account.tenantId, 'TICKET_COMMENTED', {
                  ticket: fullTicket as unknown as EventContext['ticket'],
                  comment: { id: commentId, visibility: 'PUBLIC', content: textContent, fromEmail: fromEmail ?? null },
                  actorId: authorId,
                  trigger: 'TICKET_COMMENTED',
                });
              }
            } catch (dispatchErr) {
              console.error(
                `[email-inbound] TICKET_COMMENTED dispatch failed for ticket ${existingTicket.id}: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}`,
              );
            }
          } else {
            const fromEmail = parsed.from?.value?.[0]?.address;
            // Resolve a requester even when the sender isn't in the User table.
            // Without this, the ticket lands with requestedById=null and any
            // workflow targeting "requester" finds nobody to email back.
            // findOrCreateAnonymousUser is idempotent (returns the existing
            // user if one already exists) so registered users still get
            // attributed correctly.
            let requestedById: string | null = null;
            if (fromEmail) {
              const fromDisplayName = parsed.from?.value?.[0]?.name ?? '';
              const spaceIdx = fromDisplayName.indexOf(' ');
              const fromFirst = spaceIdx === -1 ? (fromDisplayName || 'External') : fromDisplayName.slice(0, spaceIdx);
              const fromLast = spaceIdx === -1 ? (fromDisplayName ? '' : 'Email') : fromDisplayName.slice(spaceIdx + 1);
              requestedById = await findOrCreateAnonymousUser(
                account.tenantId,
                fromEmail,
                fromFirst,
                fromLast,
              );
            }

            // Audit the receipt BEFORE the ticket-create so the row exists even
            // if creation throws.
            await logEmailActivity({
              tenantId: account.tenantId,
              emailAccountId: account.id,
              direction: 'INBOUND',
              status: 'RECEIVED',
              subject: parsed.subject ?? undefined,
              fromAddress: fromEmail ?? undefined,
              messageId: messageId,
              ticketId: undefined, // not yet created
              rawMeta: { kind: 'new-ticket' },
            });

            const ticket = await createTicketFromEmail(account.tenantId, {
              title: parsed.subject ?? 'No Subject',
              description: textContent,
              queueId: account.defaultQueueId ?? undefined,
              categoryId: account.defaultCategoryId ?? undefined,
              requestedById: requestedById ?? undefined,
            });

            newTickets++;

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

            // dispatchNotificationEvent now fires both seed NotificationRules AND
            // user-built Workflows (since @meridian/notifications consolidation).
            // Re-fetch the ticket with relations the rules engine reads.
            // Wrapped in try/catch so a dispatch failure doesn't abort the poll cycle.
            try {
              const fullTicket = await prisma.ticket.findUnique({
                where: { id: ticket.id },
                include: {
                  queue: true,
                  assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
                  requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
                  category: true,
                },
              });
              if (fullTicket) {
                await dispatchNotificationEvent(account.tenantId, 'TICKET_CREATED', {
                  ticket: fullTicket as unknown as EventContext['ticket'],
                  actorId: requestedById ?? undefined,
                  trigger: 'TICKET_CREATED',
                });
              }
            } catch (dispatchErr) {
              console.error(
                `[email-inbound] TICKET_CREATED dispatch failed for ticket ${ticket.id}: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}`,
              );
            }
          }

          uidsToMarkSeen.push(message.uid);
          highestUid = Math.max(highestUid, message.uid);
        } catch (msgErr) {
          const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
          console.error(
            `[email-inbound] Error processing message in account ${account.id}: ${errMsg}`,
          );
          // Audit the failure so the operator sees it in the email log
          // alongside the per-message envelope. Best-effort — never let a
          // logging failure mask the original error.
          try {
            await logEmailActivity({
              tenantId: account.tenantId,
              emailAccountId: account.id,
              direction: 'INBOUND',
              status: 'RECEIVED',
              errorMessage: errMsg.slice(0, 500),
              rawMeta: { kind: 'processing-failed', uid: message.uid },
            });
          } catch { /* non-critical */ }
          // Advance UID anyway so we don't get stuck retrying a poisonous message forever.
          highestUid = Math.max(highestUid, message.uid);
        }
      }

      // Now that the FETCH iterator has fully closed, issue the batched
      // STORE. Doing it here (instead of inside the loop) is what stops M365
      // from hanging the iterator after the first message.
      if (uidsToMarkSeen.length > 0) {
        try {
          await client.messageFlagsAdd(uidsToMarkSeen, ['\\Seen'], { uid: true });
        } catch (flagErr) {
          console.error(
            `[email-inbound] Failed to mark ${uidsToMarkSeen.length} messages \\Seen for account ${account.id}: ${flagErr instanceof Error ? flagErr.message : String(flagErr)}`,
          );
        }
      }

      // Connector-test secondary search — find test messages even after the
      // user opened them in OWA (which marks \Seen and excludes them from the
      // main `seen: false` search above), or after the per-cycle cap pushed
      // them out of the newest-first window. Scoped to the last 30 minutes
      // and a unique subject string, so it's cheap and false-positive free.
      // markTestReceived is idempotent (Redis state update), so re-processing
      // on subsequent polls is harmless.
      try {
        const testCutoff = new Date(Date.now() - 30 * 60 * 1000);
        const testSearchResult = await client.search(
          { subject: 'MeridianITSM Connector Test', since: testCutoff },
          { uid: true },
        );
        const testUids: number[] = Array.isArray(testSearchResult) ? testSearchResult : [];
        if (testUids.length > 0) {
          const testMessages = client.fetch(testUids, { envelope: true, source: true }, { uid: true });
          for await (const message of testMessages) {
            try {
              if (!message.source) continue;
              const parsed = await simpleParser(message.source);
              const m = parsed.subject?.match(CONNECTOR_TEST_SUBJECT_REGEX);
              if (!m || !m[1]) continue;
              await markTestReceived(account.tenantId, m[1], parsed);
              await logEmailActivity({
                tenantId: account.tenantId,
                emailAccountId: account.id,
                direction: 'INBOUND',
                status: 'RECEIVED',
                subject: parsed.subject ?? undefined,
                fromAddress: parsed.from?.value?.[0]?.address ?? undefined,
                messageId: parsed.messageId ?? undefined,
                rawMeta: { connectorTest: true, token: m[1], viaSecondarySearch: true },
              });
              testsReceived++;
            } catch (innerErr) {
              console.error(
                `[email-inbound] Secondary connector-test parse failed in account ${account.id}: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
              );
            }
          }
        }
      } catch (secondaryErr) {
        // Secondary search failure must not abort the poll cycle.
        console.error(
          `[email-inbound] Secondary connector-test search failed in account ${account.id}: ${secondaryErr instanceof Error ? secondaryErr.message : String(secondaryErr)}`,
        );
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    // imapflow throws errors with rich context (response, responseText,
    // serverResponseCode, code, command, authenticationFailed) but only `.message`
    // is the bare "Command failed" string. Capture everything for diagnosis.
    const errAny = err as { message?: string; code?: string; command?: string; response?: unknown; responseText?: string; serverResponseCode?: string; authenticationFailed?: boolean };
    const errMsg = err instanceof Error ? err.message : String(err);
    const errDetail = {
      code: errAny.code,
      command: errAny.command,
      responseText: errAny.responseText,
      response: typeof errAny.response === 'string' ? errAny.response : undefined,
      serverResponseCode: errAny.serverResponseCode,
      authenticationFailed: errAny.authenticationFailed,
    };
    const expandedMessage = errAny.responseText
      ? `${errMsg} | server: ${errAny.responseText}`
      : errMsg;
    console.error(
      `[email-inbound] Failed to poll mailbox for account ${account.id}: ${expandedMessage}`,
      errDetail,
    );
    // Wrap the activity log in its own try — a dead/timed-out IMAP connection
    // shouldn't prevent us from recording the POLL_FAILED row. Same for the
    // lastPolledAt update so the next poll uses a sensible cutoff.
    try {
      await logEmailActivity({
        tenantId: account.tenantId,
        emailAccountId: account.id,
        direction: 'INBOUND',
        status: 'POLL_FAILED',
        errorMessage: expandedMessage,
        rawMeta: { newTickets, comments, testsReceived, ...errDetail },
      });
    } catch (logErr) {
      console.error('[email-inbound] Failed to write POLL_FAILED activity row:', logErr);
    }
    try {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastPolledAt: new Date(), lastProcessedUid: highestUid },
      });
    } catch { /* non-critical */ }
    throw err;
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastPolledAt: new Date(), lastProcessedUid: highestUid },
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