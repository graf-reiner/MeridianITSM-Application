import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { randomUUID } from 'node:crypto';
import { prisma, PrismaClient } from '@meridian/db';
import { decrypt, renderTemplate as renderSharedTemplate } from '@meridian/core';
import { logEmailActivity } from './email-activity.service.js';

// Derive EmailAccount type from PrismaClient inference to avoid direct @prisma/client dependency
type EmailAccount = Awaited<ReturnType<PrismaClient['emailAccount']['findUniqueOrThrow']>>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  inReplyTo?: string;
  references?: string[];
  messageId?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
}

export interface TestStep {
  step: string;
  status: 'ok' | 'failed' | 'skipped';
  detail?: string;
  durationMs?: number;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  steps: TestStep[];
}

export interface RenderedTemplate {
  subject: string;
  html: string;
}

// ─── Default HTML Template ────────────────────────────────────────────────────

function buildDefaultHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
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
    <div class="header"><h1>${title}</h1></div>
    <div class="body">${body}</div>
    <div class="footer">Powered by MeridianITSM</div>
  </div>
</body>
</html>`;
}

// ─── SMTP Transport ───────────────────────────────────────────────────────────

/**
 * Creates a nodemailer SMTP transport for the given email account.
 * Decrypts the stored password before use.
 */
export async function getSmtpTransport(account: EmailAccount): Promise<nodemailer.Transporter> {
  const decryptedPassword = account.smtpPasswordEnc ? decrypt(account.smtpPasswordEnc) : '';
  const hasAuth = account.smtpUser || decryptedPassword;

  return nodemailer.createTransport({
    host: account.smtpHost ?? undefined,
    port: account.smtpPort ?? 587,
    secure: account.smtpSecure,
    ...(hasAuth ? { auth: { user: account.smtpUser ?? undefined, pass: decryptedPassword } } : {}),
  });
}

// ─── Outbound Send ────────────────────────────────────────────────────────────

/**
 * Sends an HTML email via the account's SMTP configuration.
 * Returns the Message-ID of the sent email for reply threading.
 */
export async function sendEmail(
  account: EmailAccount,
  to: string,
  subject: string,
  html: string,
  options: SendEmailOptions = {},
): Promise<string> {
  const transport = await getSmtpTransport(account);

  const messageId = options.messageId ?? `<${randomUUID()}@meridian.local>`;

  try {
    await transport.sendMail({
      from: account.emailAddress,
      to,
      subject,
      html,
      messageId,
      inReplyTo: options.inReplyTo,
      references: options.references?.join(' '),
    });

    logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'OUTBOUND', status: 'SENT', subject, toAddresses: [to], messageId });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logEmailActivity({ tenantId: account.tenantId, emailAccountId: account.id, direction: 'OUTBOUND', status: 'FAILED', subject, toAddresses: [to], errorMessage: errMsg });
    throw err;
  } finally {
    transport.close();
  }

  return messageId;
}

// ─── Template Rendering ───────────────────────────────────────────────────────

/**
 * Renders an email template by name for a tenant.
 * Falls back to built-in default template if no matching template is found in DB.
 * Variable substitution: replaces {{variableName}} placeholders.
 */
export async function renderTemplate(
  tenantId: string,
  templateName: string,
  variables: Record<string, string>,
): Promise<RenderedTemplate> {
  // Look up template: exact match by name first, then default template by name, then any default
  const template = await prisma.emailTemplate.findFirst({
    where: {
      tenantId,
      OR: [
        { name: templateName },
        { isDefault: true },
      ],
    },
    orderBy: [
      // Prefer exact name match over default
      { isDefault: 'asc' },
    ],
  });

  let subject: string;
  let htmlBody: string;

  if (template) {
    subject = template.subject;
    htmlBody = template.htmlBody;
  } else {
    // Hardcoded fallback template
    subject = variables['subject'] ?? templateName;
    htmlBody = buildDefaultHtml(
      variables['title'] ?? templateName,
      variables['body'] ?? '',
    );
  }

  // Shared template engine: supports dotted paths and falls back to ""
  // for missing variables. HTML escaping is applied to the HTML body so
  // user-supplied values can't inject markup into the email.
  return {
    subject: renderSharedTemplate(subject, variables),
    html: renderSharedTemplate(htmlBody, variables, { escapeHtml: true }),
  };
}

// ─── Connection Testing ───────────────────────────────────────────────────────

/**
 * Tests an SMTP connection without saving credentials.
 * If sendTo is provided, also sends a real test email after handshake.
 * Returns step-by-step results for diagnostic display.
 */
export async function testSmtpConnection(config: SmtpConfig, sendTo?: string, fromAddress?: string): Promise<TestConnectionResult> {
  const steps: TestStep[] = [];
  const hasAuth = config.user || config.password;

  // Step 1: DNS / host resolution
  steps.push({ step: 'Resolving host', status: 'ok', detail: `${config.host}:${config.port}` });

  // Step 2: Create transport
  let transport: nodemailer.Transporter;
  try {
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      ...(hasAuth ? { auth: { user: config.user, pass: config.password } } : {}),
    });
    steps.push({ step: 'Transport created', status: 'ok', detail: config.secure ? 'SSL/TLS enabled' : `Plain connection (port ${config.port})` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: 'Transport created', status: 'failed', detail: msg });
    return { success: false, error: msg, steps };
  }

  // Step 3: Auth mode
  if (hasAuth) {
    steps.push({ step: 'Authentication', status: 'ok', detail: `User: ${config.user}` });
  } else {
    steps.push({ step: 'Authentication', status: 'skipped', detail: 'No credentials — unauthenticated relay' });
  }

  // Step 4: SMTP handshake (verify)
  const verifyStart = Date.now();
  try {
    await transport.verify();
    const duration = Date.now() - verifyStart;
    steps.push({ step: 'SMTP handshake (EHLO)', status: 'ok', detail: 'Server responded', durationMs: duration });
    if (hasAuth) {
      steps.push({ step: 'AUTH login', status: 'ok', detail: 'Credentials accepted', durationMs: duration });
    }
  } catch (err) {
    const duration = Date.now() - verifyStart;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
      steps.push({ step: 'TCP connection', status: 'failed', detail: msg, durationMs: duration });
    } else if (msg.includes('STARTTLS') || msg.includes('SSL') || msg.includes('certificate') || msg.includes('self signed') || msg.includes('self-signed')) {
      steps.push({ step: 'TLS/SSL negotiation', status: 'failed', detail: msg, durationMs: duration });
    } else if (msg.includes('auth') || msg.includes('AUTH') || msg.includes('535') || msg.includes('534') || msg.includes('credential')) {
      steps.push({ step: 'AUTH login', status: 'failed', detail: msg, durationMs: duration });
    } else {
      steps.push({ step: 'SMTP handshake (EHLO)', status: 'failed', detail: msg, durationMs: duration });
    }
    transport.close();
    return { success: false, error: msg, steps };
  }

  // Step 5: Send test email (if sendTo provided)
  if (sendTo) {
    const from = fromAddress || config.user || `test@${config.host}`;
    const sendStart = Date.now();
    try {
      const info = await transport.sendMail({
        from: `"MeridianITSM Test" <${from}>`,
        to: sendTo,
        subject: 'MeridianITSM — SMTP Test Email',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111827; margin: 0 0 12px;">SMTP Test Successful</h2>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              This email confirms that your SMTP configuration in MeridianITSM is working correctly.
            </p>
            <table style="font-size: 13px; color: #374151; margin: 16px 0; border-collapse: collapse;">
              <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Host</td><td style="padding: 4px 0;">${config.host}:${config.port}</td></tr>
              <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">TLS</td><td style="padding: 4px 0;">${config.secure ? 'Yes' : 'No'}</td></tr>
              <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Auth</td><td style="padding: 4px 0;">${hasAuth ? config.user : 'None (relay)'}</td></tr>
              <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Sent at</td><td style="padding: 4px 0;">${new Date().toISOString()}</td></tr>
            </table>
            <p style="color: #9ca3af; font-size: 12px;">Sent by MeridianITSM email configuration test.</p>
          </div>
        `,
      });
      const duration = Date.now() - sendStart;
      const messageId = info.messageId || 'unknown';
      steps.push({ step: 'Send test email', status: 'ok', detail: `Delivered to ${sendTo} (Message-ID: ${messageId})`, durationMs: duration });
    } catch (err) {
      const duration = Date.now() - sendStart;
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ step: 'Send test email', status: 'failed', detail: msg, durationMs: duration });
      transport.close();
      return { success: false, error: `Handshake OK but send failed: ${msg}`, steps };
    }
  } else {
    steps.push({ step: 'Send test email', status: 'skipped', detail: 'No recipient address provided' });
  }

  transport.close();
  return { success: true, steps };
}

/**
 * Tests an IMAP connection without saving credentials.
 * Returns step-by-step results for diagnostic display.
 */
export async function testImapConnection(config: ImapConfig): Promise<TestConnectionResult> {
  const steps: TestStep[] = [];
  const hasAuth = config.user || config.password;

  // Step 1: Host info
  steps.push({ step: 'Resolving host', status: 'ok', detail: `${config.host}:${config.port}` });

  // Step 2: TLS mode
  steps.push({ step: 'Connection mode', status: 'ok', detail: config.secure ? 'SSL/TLS (implicit)' : `Plain / STARTTLS (port ${config.port})` });

  // Step 3: Auth mode
  if (hasAuth) {
    steps.push({ step: 'Authentication', status: 'ok', detail: `User: ${config.user}` });
  } else {
    steps.push({ step: 'Authentication', status: 'skipped', detail: 'No credentials provided' });
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: hasAuth ? { user: config.user, pass: config.password } : { user: '', pass: '' },
    logger: false,
    tls: { rejectUnauthorized: false },
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  // Step 4: Connect
  const start = Date.now();
  try {
    await client.connect();
    const duration = Date.now() - start;
    steps.push({ step: 'IMAP connection', status: 'ok', detail: 'Connected to server', durationMs: duration });

    if (hasAuth) {
      steps.push({ step: 'IMAP LOGIN', status: 'ok', detail: 'Credentials accepted', durationMs: duration });
    }

    // Step 5: List mailboxes
    try {
      const mailboxes = await client.list();
      steps.push({ step: 'List mailboxes', status: 'ok', detail: `Found ${mailboxes.length} mailbox(es)` });
    } catch {
      steps.push({ step: 'List mailboxes', status: 'skipped', detail: 'Could not list — may require auth' });
    }

    await client.logout();
    steps.push({ step: 'Logout', status: 'ok', detail: 'Clean disconnect' });
    return { success: true, steps };
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
      steps.push({ step: 'TCP connection', status: 'failed', detail: msg, durationMs: duration });
    } else if (msg.includes('certificate') || msg.includes('SSL') || msg.includes('self signed') || msg.includes('self-signed')) {
      steps.push({ step: 'TLS/SSL negotiation', status: 'failed', detail: msg, durationMs: duration });
    } else if (msg.includes('auth') || msg.includes('AUTH') || msg.includes('LOGIN') || msg.includes('credential') || msg.includes('Invalid')) {
      steps.push({ step: 'IMAP LOGIN', status: 'failed', detail: msg, durationMs: duration });
    } else {
      steps.push({ step: 'IMAP connection', status: 'failed', detail: msg, durationMs: duration });
    }
    return { success: false, error: msg, steps };
  }
}
