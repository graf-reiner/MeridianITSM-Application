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
 * Returns step-by-step results for diagnostic display.
 */
export async function testSmtpConnection(config: SmtpConfig): Promise<TestConnectionResult> {
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
  const start = Date.now();
  try {
    await transport.verify();
    const duration = Date.now() - start;
    steps.push({ step: 'SMTP handshake (EHLO)', status: 'ok', detail: `Server responded`, durationMs: duration });
    if (hasAuth) {
      steps.push({ step: 'AUTH login', status: 'ok', detail: 'Credentials accepted', durationMs: duration });
    }
    transport.close();
    return { success: true, steps };
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    // Try to identify which step failed
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
