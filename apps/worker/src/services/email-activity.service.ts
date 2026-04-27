// ─── Email Activity Logging (worker-side) ───────────────────────────────────
// Writes EmailActivityLog rows AND publishes them to the tenant+account-scoped
// Redis pub/sub channel that the api's SSE endpoint forwards to live-tail
// viewers. Mirrors apps/api/src/services/email-activity.service.ts; keep in sync.

import { prisma } from '@meridian/db';
import { redisConnection } from '../queues/connection.js';

interface LogEntry {
  tenantId: string;
  emailAccountId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'RETRYING' | 'PERMANENT_FAILURE' | 'RECEIVED' | 'POLL_STARTED' | 'POLL_COMPLETE' | 'POLL_FAILED';
  subject?: string;
  fromAddress?: string;
  toAddresses?: string[];
  messageId?: string;
  ticketId?: string;
  attemptNumber?: number;
  errorCode?: string;
  errorMessage?: string;
  rawMeta?: Record<string, unknown>;
}

function channelFor(tenantId: string, emailAccountId: string): string {
  return `email-activity:${tenantId}:${emailAccountId}`;
}

function serializeForStream(row: {
  id: string;
  tenantId: string;
  emailAccountId: string;
  direction: string;
  status: string;
  subject: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  messageId: string | null;
  ticketId: string | null;
  attemptNumber: number;
  errorCode: string | null;
  errorMessage: string | null;
  rawMeta: unknown;
  occurredAt: Date;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    emailAccountId: row.emailAccountId,
    direction: row.direction,
    status: row.status,
    subject: row.subject,
    fromAddress: row.fromAddress,
    toAddresses: row.toAddresses,
    messageId: row.messageId,
    ticketId: row.ticketId,
    attemptNumber: row.attemptNumber,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    rawMeta: row.rawMeta,
    occurredAt: row.occurredAt.toISOString(),
  };
}

export async function logEmailActivity(entry: LogEntry): Promise<void> {
  try {
    const row = await prisma.emailActivityLog.create({
      data: {
        tenantId: entry.tenantId,
        emailAccountId: entry.emailAccountId,
        direction: entry.direction,
        status: entry.status,
        subject: entry.subject,
        fromAddress: entry.fromAddress,
        toAddresses: entry.toAddresses ?? [],
        messageId: entry.messageId,
        ticketId: entry.ticketId,
        attemptNumber: entry.attemptNumber ?? 1,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        rawMeta: entry.rawMeta as never,
      },
    });
    try {
      await redisConnection.publish(channelFor(row.tenantId, row.emailAccountId), JSON.stringify(serializeForStream(row)));
    } catch (pubErr) {
      console.error(`[activity-log] pub/sub publish failed (non-critical): ${pubErr instanceof Error ? pubErr.message : String(pubErr)}`);
    }
  } catch (err) {
    // Activity logging is non-critical — never fail the parent operation
    console.error(`[activity-log] Failed to write email activity: ${err instanceof Error ? err.message : String(err)}`);
  }
}
