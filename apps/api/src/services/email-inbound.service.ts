import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'node:crypto';
import { prisma, PrismaClient } from '@meridian/db';
import { decrypt, uploadFile } from '@meridian/core';
import { redis } from '../lib/redis.js';
import { createTicket, addComment } from './ticket.service.js';
import { logEmailActivity } from './email-activity.service.js';

// Derive EmailAccount type from PrismaClient inference to avoid direct @prisma/client dependency
type EmailAccount = Awaited<ReturnType<PrismaClient['emailAccount']['findUniqueOrThrow']>>;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEDUP_TTL_SECONDS = 90 * 24 * 3600; // 90 days
const DEDUP_KEY_PREFIX = 'email:msgids:';
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Checks if a Message-ID has already been processed for a tenant.
 * Returns true if duplicate (should skip), false if new.
 * Does NOT mark the message as processed — call markProcessed() after successful handling.
 */
export async function isDuplicate(tenantId: string, messageId: string): Promise<boolean> {
  const key = `${DEDUP_KEY_PREFIX}${tenantId}`;
  const isMember = await redis.sismember(key, messageId);
  return isMember === 1;
}

/**
 * Records a Message-ID as processed for a tenant with a 90-day TTL.
 * Call this AFTER successful ticket/comment creation to avoid losing messages on failure.
 */
export async function markProcessed(tenantId: string, messageId: string): Promise<void> {
  const key = `${DEDUP_KEY_PREFIX}${tenantId}`;
  await redis.sadd(key, messageId);
  await redis.expire(key, DEDUP_TTL_SECONDS);
}

// ─── Reply Threading ──────────────────────────────────────────────────────────

/**
 * Attempts to find an existing ticket by matching MIME In-Reply-To / References headers.
 * Searches customFields.outboundMessageIds JSON array for any matching Message-ID.
 */
export async function findTicketByHeaders(
  tenantId: string,
  references?: string[],
  inReplyTo?: string,
): Promise<{ id: string; ticketNumber: number } | null> {
  const searchIds: string[] = [];
  if (inReplyTo) searchIds.push(inReplyTo);
  if (references) searchIds.push(...references);

  if (searchIds.length === 0) return null;

  // Search tickets whose customFields.outboundMessageIds contains any search ID
  for (const msgId of searchIds) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        tenantId,
        customFields: {
          path: ['outboundMessageIds'],
          array_contains: msgId,
        },
      },
      select: { id: true, ticketNumber: true },
    });
    if (ticket) return ticket;
  }

  return null;
}

/**
 * Attempts to find an existing ticket by matching TKT-XXXXX pattern in subject line.
 */
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

// ─── User Lookup ──────────────────────────────────────────────────────────────

async function lookupUserByEmail(tenantId: string, email?: string): Promise<string | null> {
  if (!email) return null;

  const user = await prisma.user.findFirst({
    where: { tenantId, email: email.toLowerCase() },
    select: { id: true },
  });

  return user?.id ?? null;
}

// ─── Mailbox Polling ──────────────────────────────────────────────────────────

/**
 * Polls a single tenant mailbox using UID-based tracking + Redis dedup.
 * Instead of relying on IMAP \Seen flags, tracks the highest processed UID
 * per email account. Resilient to Gmail IMAP timeouts and connection drops.
 * Returns counts of new tickets and threaded comments created.
 */
export async function pollMailbox(account: EmailAccount): Promise<{ newTickets: number; comments: number }> {
  if (!account.imapHost || !account.imapUser || !account.imapPasswordEnc) {
    return { newTickets: 0, comments: 0 };
  }

  const decryptedPassword = decrypt(account.imapPasswordEnc);
  let newTickets = 0;
  let comments = 0;
  let highestUid = account.lastProcessedUid ?? 0;

  console.log(`[email-inbound] Polling account ${account.name} (${account.emailAddress}), lastUid=${highestUid}`);

  logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'INBOUND', status: 'POLL_STARTED' });

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: {
      user: account.imapUser,
      pass: decryptedPassword,
    },
    logger: false,
    greetingTimeout: 15000,
    socketTimeout: 120000,
    tls: { rejectUnauthorized: false },
  });

  // Prevent unhandled 'error' events from crashing the process
  client.on('error', (err: Error) => {
    console.error(`[email-inbound] ImapFlow error for ${account.name}: ${err.message}`);
  });

  // Wrap entire poll in a 2-minute abort timeout
  const abortController = new AbortController();
  const abortTimer = setTimeout(() => abortController.abort(), 120000);

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // UID-based fetch: get messages newer than lastProcessedUid
      const uidRange = highestUid > 0 ? `${highestUid + 1}:*` : '1:*';

      let fetchedAny = false;
      const messages = client.fetch(uidRange, { envelope: true, source: true, uid: true });

      for await (const message of messages) {
        if (abortController.signal.aborted) {
          console.warn(`[email-inbound] Abort timeout reached for ${account.name}, saving progress`);
          break;
        }

        fetchedAny = true;
        const uid = message.uid;

        // Skip if we've already processed this UID (can happen with UID range edge cases)
        if (uid <= highestUid) continue;

        try {
          if (!message.source) {
            highestUid = Math.max(highestUid, uid);
            continue;
          }

          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId;

          if (!messageId) {
            highestUid = Math.max(highestUid, uid);
            continue;
          }

          // Redis dedup check
          const duplicate = await isDuplicate(account.tenantId, messageId);
          if (duplicate) {
            highestUid = Math.max(highestUid, uid);
            // Fire-and-forget Seen flag — don't await, don't care if it fails
            client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true }).catch(() => {});
            continue;
          }

          // Extract In-Reply-To and References headers for threading
          const inReplyTo = parsed.inReplyTo;
          const references = Array.isArray(parsed.references)
            ? parsed.references
            : parsed.references
            ? [parsed.references]
            : undefined;

          // Attempt reply threading: MIME headers first, subject TKT-XXXXX fallback
          const existingTicket =
            (await findTicketByHeaders(account.tenantId, references, inReplyTo)) ??
            (await findTicketBySubject(account.tenantId, parsed.subject ?? ''));

          const htmlContent = parsed.html !== false ? (parsed.html ?? '') : '';
          const textContent: string = parsed.text ?? htmlContent ?? '(No content)';

          if (existingTicket) {
            await addComment(
              account.tenantId,
              existingTicket.id,
              { content: textContent, visibility: 'PUBLIC' },
              null as unknown as string,
            );
            await markProcessed(account.tenantId, messageId);
            comments++;
            logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'INBOUND', status: 'RECEIVED', subject: parsed.subject ?? undefined, fromAddress: parsed.from?.value?.[0]?.address, messageId, ticketId: existingTicket.id });
            console.log(`[email-inbound] Threaded comment on TKT-${existingTicket.ticketNumber} from uid ${uid}`);
          } else {
            const fromEmail = parsed.from?.value?.[0]?.address;
            const requestedById = await lookupUserByEmail(account.tenantId, fromEmail);

            const ticket = await createTicket(
              account.tenantId,
              {
                title: parsed.subject ?? 'No Subject',
                description: textContent,
                type: 'INCIDENT',
                priority: 'MEDIUM',
                queueId: account.defaultQueueId ?? undefined,
                categoryId: account.defaultCategoryId ?? undefined,
                requestedById: requestedById ?? undefined,
              },
              null as unknown as string,
            );

            newTickets++;

            // Store message IDs in customFields for future reply threading
            const existingFields =
              (ticket as { customFields?: Record<string, unknown> }).customFields ?? {};
            const existingIds: string[] = Array.isArray(existingFields['outboundMessageIds'])
              ? (existingFields['outboundMessageIds'] as string[])
              : [];
            existingIds.push(messageId);

            await prisma.ticket.update({
              where: { id: ticket.id },
              data: {
                customFields: {
                  ...existingFields,
                  outboundMessageIds: existingIds,
                  fromEmail: fromEmail ?? null,
                  originalMessageId: messageId,
                } as object,
              },
            });

            // Mark as processed AFTER successful ticket creation
            await markProcessed(account.tenantId, messageId);

            logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'INBOUND', status: 'RECEIVED', subject: parsed.subject ?? undefined, fromAddress: fromEmail, messageId, ticketId: ticket.id });

            console.log(`[email-inbound] Created ticket ${ticket.id} from uid ${uid} (${parsed.subject ?? 'No Subject'})`);

            // Process attachments (25 MB total cap)
            if (parsed.attachments && parsed.attachments.length > 0) {
              let totalSize = 0;

              for (const attachment of parsed.attachments) {
                totalSize += attachment.size ?? attachment.content.length;
                if (totalSize > MAX_ATTACHMENT_TOTAL_BYTES) {
                  console.warn(
                    `[email-inbound] Attachment size limit reached for ticket ${ticket.id}, skipping rest`,
                  );
                  break;
                }

                const filename = attachment.filename ?? 'attachment.bin';
                const ext = filename.includes('.') ? filename.split('.').pop()! : 'bin';
                const attachmentUuid = randomUUID();
                const storageFilename = `${attachmentUuid}.${ext}`;
                const storageResource = `email-attachments/${ticket.id}`;

                try {
                  const storedKey = await uploadFile(
                    account.tenantId,
                    storageResource,
                    storageFilename,
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

          // After successful processing, update highestUid
          highestUid = Math.max(highestUid, uid);

          // Fire-and-forget Seen flag — non-blocking, ignore failures (Gmail timeout fix)
          client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true }).catch(() => {});

        } catch (msgErr) {
          console.error(
            `[email-inbound] Error processing uid ${uid} in ${account.name}: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`,
          );
          // Still advance the UID so we don't get stuck on a bad message
          highestUid = Math.max(highestUid, uid);
        }
      }

      if (!fetchedAny && highestUid === 0) {
        // First poll — set highestUid to current mailbox state so we don't reprocess old emails
        highestUid = client.mailbox?.uidNext ? client.mailbox.uidNext - 1 : 0;
        console.log(`[email-inbound] First poll for ${account.name}, setting baseline uid=${highestUid}`);
      }

    } finally {
      try { lock.release(); } catch { /* ignore */ }
    }

    try { await client.logout(); } catch { /* ignore */ }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[email-inbound] Failed to poll ${account.name}: ${errMsg}`,
    );

    // Log poll failure
    logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'INBOUND', status: 'POLL_FAILED', errorMessage: errMsg });

    // Track consecutive failures and auto-pause if >= 5
    try {
      const pollJob = await prisma.emailPollJob.findUnique({ where: { emailAccountId: account.id } });
      const failures = (pollJob?.consecutiveFailures ?? 0) + 1;
      await prisma.emailPollJob.upsert({
        where: { emailAccountId: account.id },
        create: { tenantId: account.tenantId, emailAccountId: account.id, consecutiveFailures: failures, isPaused: failures >= 5, pauseReason: failures >= 5 ? 'Auto-paused after 5 consecutive failures' : null },
        update: { consecutiveFailures: failures, isPaused: failures >= 5, pauseReason: failures >= 5 ? 'Auto-paused after 5 consecutive failures' : null },
      });
    } catch { /* non-critical */ }

    // Don't throw — let the worker continue to the next account
  } finally {
    clearTimeout(abortTimer);
  }

  // Always save progress — even partial
  try {
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastPolledAt: new Date(), lastProcessedUid: highestUid },
    });
  } catch (err) {
    console.error(
      `[email-inbound] Failed to update lastProcessedUid for ${account.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Log poll completion and update poll job tracking
  logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'INBOUND', status: 'POLL_COMPLETE', rawMeta: { newTickets, comments, lastUid: highestUid } });

  try {
    await prisma.emailPollJob.upsert({
      where: { emailAccountId: account.id },
      create: { tenantId: account.tenantId, emailAccountId: account.id, lastPollAt: new Date(), lastUid: highestUid, consecutiveFailures: 0, nextPollAt: new Date(Date.now() + (account.pollInterval ?? 5) * 60000) },
      update: { lastPollAt: new Date(), lastUid: highestUid, consecutiveFailures: 0, nextPollAt: new Date(Date.now() + (account.pollInterval ?? 5) * 60000) },
    });
  } catch { /* non-critical */ }

  console.log(`[email-inbound] Poll complete for ${account.name}: ${newTickets} new, ${comments} comments, lastUid=${highestUid}`);
  return { newTickets, comments };
}
