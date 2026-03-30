import { prisma } from '@meridian/db';

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

export async function logEmailActivity(entry: LogEntry): Promise<void> {
  try {
    await prisma.emailActivityLog.create({
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
  } catch (err) {
    // Activity logging is non-critical — never fail the parent operation
    console.error(`[activity-log] Failed to write email activity: ${err instanceof Error ? err.message : String(err)}`);
  }
}
