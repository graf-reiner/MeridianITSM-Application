import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '@meridian/db';
import { decrypt } from '@meridian/core';
import { Cron } from 'croner';
import { stringify } from 'csv-stringify/sync';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── Report Generators ────────────────────────────────────────────────────────

/**
 * Generate ticket report as CSV string for a given tenantId and optional filters.
 */
async function generateTicketCsv(
  tenantId: string,
  filters: Record<string, unknown>,
): Promise<string> {
  const where: Record<string, unknown> = { tenantId };

  if (filters['dateFrom']) where.createdAt = { gte: new Date(filters['dateFrom'] as string) };
  if (filters['dateTo']) {
    where.createdAt = {
      ...(typeof where.createdAt === 'object' && where.createdAt !== null ? where.createdAt : {}),
      lte: new Date(filters['dateTo'] as string),
    };
  }
  if (filters['status']) where.status = filters['status'];
  if (filters['priority']) where.priority = filters['priority'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tickets = await prisma.ticket.findMany({
    where: where as any,
    take: 5000,
    orderBy: { createdAt: 'desc' },
    include: {
      assignedTo: { select: { firstName: true, lastName: true } },
      category: { select: { name: true } },
    },
  });

  const rows = tickets.map((t) => [
    `TKT-${String(t.ticketNumber).padStart(5, '0')}`,
    t.title,
    t.status,
    t.priority,
    t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '',
    t.category?.name ?? '',
    t.createdAt.toISOString(),
    t.resolvedAt?.toISOString() ?? '',
  ]);

  return stringify(rows, {
    header: true,
    columns: ['Ticket Number', 'Title', 'Status', 'Priority', 'Assignee', 'Category', 'Created', 'Resolved'],
  });
}

/**
 * Generate SLA compliance report as CSV string.
 */
async function generateSlaCsv(
  tenantId: string,
  filters: Record<string, unknown>,
): Promise<string> {
  const where: Record<string, unknown> = {
    tenantId,
    status: { in: ['RESOLVED', 'CLOSED'] },
    slaBreachAt: { not: null },
  };

  if (filters['dateFrom']) {
    where.resolvedAt = { gte: new Date(filters['dateFrom'] as string) };
  }
  if (filters['dateTo']) {
    where.resolvedAt = {
      ...(typeof where.resolvedAt === 'object' && where.resolvedAt !== null ? where.resolvedAt : {}),
      lte: new Date(filters['dateTo'] as string),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tickets = await prisma.ticket.findMany({
    where: where as any,
    select: {
      ticketNumber: true,
      title: true,
      priority: true,
      createdAt: true,
      resolvedAt: true,
      slaBreachAt: true,
    },
  });

  const rows = tickets.map((t) => [
    `TKT-${String(t.ticketNumber).padStart(5, '0')}`,
    t.title,
    t.priority,
    t.createdAt.toISOString(),
    t.resolvedAt?.toISOString() ?? '',
    t.slaBreachAt?.toISOString() ?? '',
    t.resolvedAt && t.slaBreachAt && t.resolvedAt > t.slaBreachAt ? 'BREACHED' : 'COMPLIANT',
  ]);

  return stringify(rows, {
    header: true,
    columns: ['Ticket Number', 'Title', 'Priority', 'Created', 'Resolved', 'SLA Deadline', 'SLA Status'],
  });
}

/**
 * Generate change report as CSV string.
 */
async function generateChangesCsv(
  tenantId: string,
  filters: Record<string, unknown>,
): Promise<string> {
  const where: Record<string, unknown> = { tenantId };

  if (filters['dateFrom']) where.createdAt = { gte: new Date(filters['dateFrom'] as string) };
  if (filters['dateTo']) {
    where.createdAt = {
      ...(typeof where.createdAt === 'object' && where.createdAt !== null ? where.createdAt : {}),
      lte: new Date(filters['dateTo'] as string),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const changes = await prisma.change.findMany({
    where: where as any,
    take: 5000,
    orderBy: { createdAt: 'desc' },
    select: {
      changeNumber: true,
      title: true,
      type: true,
      status: true,
      riskLevel: true,
      createdAt: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });

  const rows = changes.map((c) => [
    `CHG-${String(c.changeNumber).padStart(5, '0')}`,
    c.title,
    c.type,
    c.status,
    c.riskLevel,
    c.createdAt.toISOString(),
    c.scheduledStart?.toISOString() ?? '',
    c.scheduledEnd?.toISOString() ?? '',
  ]);

  return stringify(rows, {
    header: true,
    columns: ['Change Number', 'Title', 'Type', 'Status', 'Risk Level', 'Created', 'Scheduled Start', 'Scheduled End'],
  });
}

// ─── Scheduled Report Worker ──────────────────────────────────────────────────

/**
 * Scheduled Report Worker — runs hourly, processes due scheduled reports.
 *
 * For each ScheduledReport where isActive=true AND nextRunAt <= now():
 *   1. Generate CSV report based on reportType
 *   2. Send to each recipient via tenant's SMTP account
 *   3. Update lastRunAt and calculate nextRunAt from cron
 *
 * Per-report try/catch prevents one failure from blocking others.
 */
export const scheduledReportWorker = new Worker(
  QUEUE_NAMES.SCHEDULED_REPORT,
  async (_job) => {
    const now = new Date();

    const dueReports = await prisma.scheduledReport.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
      },
    });

    console.log(`[scheduled-report] Found ${dueReports.length} due report(s)`);

    for (const report of dueReports) {
      try {
        const filters = (report.filters as Record<string, unknown>) ?? {};

        // Generate CSV based on reportType
        let csvContent: string;
        let fileName: string;

        if (report.reportType === 'tickets') {
          csvContent = await generateTicketCsv(report.tenantId, filters);
          fileName = 'tickets-report.csv';
        } else if (report.reportType === 'sla') {
          csvContent = await generateSlaCsv(report.tenantId, filters);
          fileName = 'sla-compliance-report.csv';
        } else if (report.reportType === 'changes') {
          csvContent = await generateChangesCsv(report.tenantId, filters);
          fileName = 'changes-report.csv';
        } else {
          console.warn(`[scheduled-report] Unknown reportType '${report.reportType}' for report ${report.id}`);
          continue;
        }

        // Fetch tenant's first active SMTP account
        const account = await prisma.emailAccount.findFirst({
          where: { tenantId: report.tenantId, isActive: true },
          orderBy: { createdAt: 'asc' },
        });

        if (!account || !account.smtpHost || !account.smtpUser || !account.smtpPasswordEnc) {
          console.warn(
            `[scheduled-report] No active SMTP account for tenant ${report.tenantId}, skipping report ${report.id}`,
          );
        } else {
          const decryptedPassword = decrypt(account.smtpPasswordEnc);

          const transport = nodemailer.createTransport({
            host: account.smtpHost,
            port: account.smtpPort ?? 587,
            secure: account.smtpSecure,
            auth: {
              user: account.smtpUser,
              pass: decryptedPassword,
            },
          });

          // Send to each recipient
          for (const recipient of report.recipients) {
            try {
              await transport.sendMail({
                from: account.emailAddress,
                to: recipient,
                subject: `Scheduled Report: ${report.name}`,
                text: `Please find the scheduled ${report.reportType} report attached.`,
                attachments: [
                  {
                    filename: fileName,
                    content: csvContent,
                    contentType: 'text/csv',
                  },
                ],
              });
            } catch (sendErr) {
              console.error(
                `[scheduled-report] Failed to send report ${report.id} to ${recipient}:`,
                sendErr instanceof Error ? sendErr.message : String(sendErr),
              );
            }
          }

          transport.close();
        }

        // Advance nextRunAt from cron expression
        let nextRunAt: Date | null = null;
        try {
          const cron = new Cron(report.schedule);
          nextRunAt = cron.nextRun() ?? null;
        } catch (cronErr) {
          console.error(
            `[scheduled-report] Invalid cron '${report.schedule}' for report ${report.id}:`,
            cronErr instanceof Error ? cronErr.message : String(cronErr),
          );
        }

        await prisma.scheduledReport.update({
          where: { id: report.id },
          data: {
            lastRunAt: now,
            nextRunAt,
          },
        });

        console.log(`[scheduled-report] Completed report ${report.id} (${report.name}), nextRunAt=${nextRunAt?.toISOString() ?? 'null'}`);
      } catch (err) {
        console.error(
          `[scheduled-report] Failed to process report ${report.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    console.log(`[scheduled-report] Completed hourly check — processed ${dueReports.length} report(s)`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

scheduledReportWorker.on('failed', (job, err) => {
  console.error(`[scheduled-report] Job ${job?.id} failed:`, err.message);
});
