import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { randomUUID } from 'node:crypto';
import { prisma, PrismaClient } from '@meridian/db';
import { decrypt } from '@meridian/core';

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

export interface TestConnectionResult {
  success: boolean;
  error?: string;
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

  return nodemailer.createTransport({
    host: account.smtpHost ?? undefined,
    port: account.smtpPort ?? 587,
    secure: account.smtpSecure,
    auth: {
      user: account.smtpUser ?? undefined,
      pass: decryptedPassword,
    },
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

  await transport.sendMail({
    from: account.emailAddress,
    to,
    subject,
    html,
    messageId,
    inReplyTo: options.inReplyTo,
    references: options.references?.join(' '),
  });

  transport.close();

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

  // Replace {{variableName}} placeholders
  const substitute = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');

  return {
    subject: substitute(subject),
    html: substitute(htmlBody),
  };
}

// ─── Connection Testing ───────────────────────────────────────────────────────

/**
 * Tests an SMTP connection without saving credentials.
 */
export async function testSmtpConnection(config: SmtpConfig): Promise<TestConnectionResult> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  try {
    await transport.verify();
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  } finally {
    transport.close();
  }
}

/**
 * Tests an IMAP connection without saving credentials.
 */
export async function testImapConnection(config: ImapConfig): Promise<TestConnectionResult> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
