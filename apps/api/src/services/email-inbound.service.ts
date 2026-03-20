import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'node:crypto';
import { prisma, PrismaClient } from '@meridian/db';
import { decrypt, uploadFile } from '@meridian/core';
import { redis } from '../lib/redis.js';
import { createTicket, addComment } from './ticket.service.js';

// Derive EmailAccount type from PrismaClient inference to avoid direct @prisma/client dependency
type EmailAccount = Awaited<ReturnType<PrismaClient['emailAccount']['findUniqueOrThrow']>>;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEDUP_TTL_SECONDS = 90 * 24 * 3600; // 90 days
const DEDUP_KEY_PREFIX = 'email:msgids:';
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Checks if a Message-ID has already been processed for a tenant.
 * On first sight, records it with a 90-day TTL.
 * Returns true if duplicate (should skip), false if new.
 */
export async function isDuplicate(tenantId: string, messageId: string): Promise<boolean> {
  const key = `${DEDUP_KEY_PREFIX}${tenantId}`;

  const isMember = await redis.sismember(key, messageId);
  if (isMember === 1) {
    return true;
  }

  // New message: record it and set/refresh TTL
  await redis.sadd(key, messageId);
  await redis.expire(key, DEDUP_TTL_SECONDS);

  return false;
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
 * Polls a single tenant mailbox: fetches unseen emails, creates tickets or threads
 * comments onto existing tickets, deduplicates via Redis Message-ID set.
 * Returns counts of new tickets and threaded comments created.
 */
export async function pollMailbox(account: EmailAccount): Promise<{ newTickets: number; comments: number }> {
  if (!account.imapHost || !account.imapUser || !account.imapPasswordEnc) {
    console.warn(`[email-inbound] Account ${account.id} missing IMAP config, skipping`);
    return { newTickets: 0, comments: 0 };
  }

  const decryptedPassword = decrypt(account.imapPasswordEnc);

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: account.imapSecure,
    auth: {
      user: account.imapUser,
      pass: decryptedPassword,
    },
    logger: false,
  });

  let newTickets = 0;
  let comments = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const messages = client.fetch({ seen: false }, { envelope: true, source: true }, { uid: true });

      for await (const message of messages) {
        try {
          if (!message.source) {
            console.warn(`[email-inbound] Message has no source in account ${account.id}, skipping`);
            continue;
          }

          const parsed = await simpleParser(message.source);
          const messageId = parsed.messageId;

          if (!messageId) {
            console.warn(`[email-inbound] Message without Message-ID in account ${account.id}, skipping`);
            continue;
          }

          const duplicate = await isDuplicate(account.tenantId, messageId);
          if (duplicate) {
            console.log(`[email-inbound] Duplicate Message-ID ${messageId}, skipping`);
            await client.messageFlagsAdd({ uid: message.uid }, ['\\Seen'], { uid: true });
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
            comments++;
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
    console.error(
      `[email-inbound] Failed to poll mailbox for account ${account.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastPolledAt: new Date() },
  });

  return { newTickets, comments };
}
