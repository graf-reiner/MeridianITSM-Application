import { Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '@meridian/db';
import { decrypt, encrypt, getFreshAccessToken, getOAuthCredentials, renderTemplate as renderSharedTemplate } from '@meridian/core';
import { bullmqConnection } from '../queues/connection.js';
import { assertTenantId, QUEUE_NAMES } from '../queues/definitions.js';

// ─── Template Rendering (worker-local, mirrors email.service.ts) ──────────────

function buildDefaultHtml(title: string, body: string): string {
  const trimmedTitle = title.trim();
  const headerBlock = trimmedTitle
    ? `<div class="header"><h1>${trimmedTitle}</h1></div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${trimmedTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: #1a56db; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .body { padding: 32px; color: #333; line-height: 1.6; }
    .footer { padding: 16px 32px; font-size: 12px; color: #888; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    ${headerBlock}
    <div class="body">${body}</div>
    <div class="footer">Powered by MeridianITSM</div>
  </div>
</body>
</html>`;
}

function buildCtx(variables: Record<string, string>): Record<string, unknown> {
  // Promote known flat keys (legacy callers) into the nested shape used by
  // saved templates and the unified picker UI, so {{ticket.title}} resolves.
  return {
    ...variables,
    ticket: {
      number: variables.ticketNumber ?? '',
      title: variables.ticketTitle ?? '',
      id: variables.ticketId ?? '',
    },
  };
}

async function renderTemplate(
  tenantId: string,
  templateName: string | null,
  variables: Record<string, string>,
): Promise<{ subject: string; html: string }> {
  const ctx = buildCtx(variables);

  // Pre-rendered path: caller already substituted variables (notification-rule
  // action executor). Trust that content and just wrap it in default chrome.
  if (variables.subject !== undefined && variables.body !== undefined) {
    return {
      subject: variables.subject,
      html: buildDefaultHtml(variables.subject, variables.body),
    };
  }

  // Named-template path: look up an EmailTemplate row by name (or default).
  const template = templateName
    ? await prisma.emailTemplate.findFirst({
        where: {
          tenantId,
          OR: [{ name: templateName }, { isDefault: true }],
        },
        orderBy: [{ isDefault: 'asc' }],
      })
    : await prisma.emailTemplate.findFirst({
        where: { tenantId, isDefault: true },
      });

  if (template) {
    const subject = renderSharedTemplate(template.subject, ctx);
    const html = renderSharedTemplate(template.htmlBody, ctx, { escapeHtml: true });
    return { subject, html };
  }

  // Bare-fallback path: no pre-rendered content and no DB template. Best-effort
  // wrap whatever the caller provided; use the resolved subject as the header.
  const subject = renderSharedTemplate(variables.subject ?? '', ctx);
  const body = renderSharedTemplate(variables.body ?? '', ctx, { escapeHtml: true });
  return { subject, html: buildDefaultHtml(subject, body) };
}

// ─── Email Notification Worker ────────────────────────────────────────────────

/**
 * Email Notification Worker — event-driven, triggered by BullMQ job enqueue.
 * Job data: { tenantId, to, templateName, variables, inReplyTo?, references? }
 */
export const emailNotificationWorker = new Worker(
  QUEUE_NAMES.EMAIL_NOTIFICATION,
  async (job) => {
    assertTenantId(job.id, job.data);

    const {
      tenantId,
      to,
      templateName,
      variables,
      inReplyTo,
      references,
    } = job.data as {
      tenantId: string;
      to: string;
      templateName: string | null;
      variables: Record<string, string>;
      inReplyTo?: string;
      references?: string[];
    };

    // Fetch the tenant's first active email account for SMTP config
    const account = await prisma.emailAccount.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!account || !account.smtpHost) {
      console.warn(
        `[email-notification] No active SMTP account for tenant ${tenantId}, skipping send to ${to}`,
      );
      return;
    }

    const { subject, html } = await renderTemplate(tenantId, templateName, variables);

    const authProvider = (account as any).authProvider as string | null;
    let transport: nodemailer.Transporter;

    if (authProvider === 'GOOGLE' || authProvider === 'MICROSOFT') {
      // ── OAuth2 SMTP path ──
      const encRefresh = (account as any).oauthRefreshTokenEnc as string | null;
      if (!encRefresh) {
        console.warn(`[email-notification] OAuth account ${account.id} missing refresh token, skipping`);
        return;
      }

      const providerLower = authProvider.toLowerCase() as 'google' | 'microsoft';

      // Resolve OAuth credentials — DB first (Owner Admin Integrations wizard), env fallback
      const creds = await getOAuthCredentials(prisma, providerLower);
      if (!creds) {
        console.warn(`[email-notification] Missing ${authProvider} OAuth client credentials (DB + env both empty), skipping`);
        return;
      }

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

      transport = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort ?? 587,
        secure: false, // STARTTLS for both Google and Microsoft on port 587
        auth: {
          type: 'OAuth2',
          user: account.smtpUser ?? account.emailAddress,
          accessToken: result.accessToken,
        } as any,
      });
    } else {
      // ── Manual / password path ──
      let decryptedPassword = '';
      if (account.smtpPasswordEnc) {
        try { decryptedPassword = decrypt(account.smtpPasswordEnc); } catch { decryptedPassword = ''; }
      }
      const hasAuth = !!(account.smtpUser || decryptedPassword);

      transport = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort ?? 587,
        secure: account.smtpSecure,
        ...(hasAuth ? { auth: { user: account.smtpUser ?? '', pass: decryptedPassword } } : {}),
      });
    }

    let messageId: string | undefined;
    try {
      const info = await transport.sendMail({
        from: account.emailAddress,
        to,
        subject,
        html,
        inReplyTo,
        references: references?.join(' '),
      });
      messageId = info.messageId;

      // Log successful send to email activity
      await prisma.emailActivityLog.create({
        data: {
          tenantId,
          emailAccountId: account.id,
          direction: 'OUTBOUND',
          status: 'SENT',
          subject,
          fromAddress: account.emailAddress,
          toAddresses: [to],
          messageId: messageId ?? null,
          ticketId: variables.ticketId || null,
          attemptNumber: 1,
        },
      }).catch(() => { /* activity logging is non-critical */ });

      console.log(`[email-notification] Sent ${templateName} to ${to} for tenant ${tenantId} (${messageId})`);
    } catch (sendErr) {
      // Log failed send to email activity
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await prisma.emailActivityLog.create({
        data: {
          tenantId,
          emailAccountId: account.id,
          direction: 'OUTBOUND',
          status: 'FAILED',
          subject,
          fromAddress: account.emailAddress,
          toAddresses: [to],
          ticketId: variables.ticketId || null,
          attemptNumber: 1,
          errorMessage: errMsg,
        },
      }).catch(() => { /* activity logging is non-critical */ });

      throw sendErr; // Re-throw so BullMQ marks the job as failed
    } finally {
      transport.close();
    }
  },
  {
    connection: bullmqConnection,
    concurrency: 10,
  },
);

emailNotificationWorker.on('failed', (job, err) => {
  console.error(`[email-notification] Job ${job?.id} failed:`, err.message);
});
