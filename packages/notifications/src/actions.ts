// ─── Notification Rules — Action Executors ──────────────────────────────────
// Executes the action array attached to a matched notification rule.
// Each action type has its own executor; all actions run in parallel via
// Promise.allSettled so one failure does not block the rest.

import { Queue } from 'bullmq';
import crypto from 'node:crypto';
import { prisma } from '@meridian/db';
import { redis } from './redis.js';
import { renderTemplate, type EventContext } from './conditions.js';

// ─── Cross-system dedupe net ────────────────────────────────────────────────
// Prevents the same (tenant, ticket, trigger, channel, recipient) from being
// notified twice within DEDUPE_TTL_SECONDS — for any reason (overlapping
// notification rule + workflow, dispatch retries, etc.).
const DEDUPE_TTL_SECONDS = 60;

async function alreadyFired(
  tenantId: string,
  trigger: string,
  resourceId: string | undefined,
  recipient: string,
  channel: 'email' | 'in_app' | 'push',
): Promise<boolean> {
  if (!resourceId || !trigger) return false;
  const key = `notify:dedup:${tenantId}:${resourceId}:${trigger}:${channel}:${recipient}`;
  try {
    const set = await redis.set(key, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
    return set === null; // null === key already existed → duplicate
  } catch (err) {
    // Redis unavailable — fail open so notifications still go out.
    console.error('[notify] dedupe check failed (failing open):', err);
    return false;
  }
}

// ─── BullMQ Connection helper (matches notification.service.ts pattern) ──────
function makeRedisConnection() {
  return {
    host: (() => {
      try {
        return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname;
      } catch {
        return 'localhost';
      }
    })(),
    port: (() => {
      try {
        return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379;
      } catch {
        return 6379;
      }
    })(),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

const emailNotificationQueue = new Queue('email-notification', {
  connection: makeRedisConnection(),
});

const pushNotificationQueue = new Queue('push-notification', {
  connection: makeRedisConnection(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActionConfig {
  type: string;
  [key: string]: unknown;
}

export interface ActionResult {
  type: string;
  success: boolean;
  error?: string;
  detail?: string;
}

export type TemplateChannel = 'EMAIL' | 'TELEGRAM' | 'SLACK' | 'TEAMS' | 'DISCORD';

/**
 * Load an active NotificationTemplate scoped to tenantId + channel.
 * Returns null if templateId is missing, not found, inactive, or channel mismatch.
 * Callers must fall back to inline config when null is returned.
 */
export async function resolveTemplate(
  templateId: string | undefined,
  tenantId: string,
  channel: TemplateChannel,
): Promise<{ content: Record<string, unknown>; contexts: string[] } | null> {
  if (!templateId) return null;
  const tpl = await prisma.notificationTemplate.findFirst({
    where: { id: templateId, tenantId, channel, isActive: true },
    select: { content: true, contexts: true },
  });
  if (!tpl) return null;
  return {
    content: tpl.content as Record<string, unknown>,
    contexts: tpl.contexts,
  };
}

// ─── Recipient Resolvers ─────────────────────────────────────────────────────

/**
 * Resolve dynamic recipient tokens to concrete user IDs.
 */
async function resolveRecipients(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<string[]> {
  const recipients = (config.recipients ?? []) as string[];
  const userIds = new Set<string>();

  for (const r of recipients) {
    switch (r) {
      case 'assignee':
        if (context.ticket?.assignedToId) userIds.add(context.ticket.assignedToId);
        break;
      case 'requester':
        if (context.ticket?.requestedById) userIds.add(context.ticket.requestedById);
        break;
      case 'group_members': {
        const groupId = context.ticket?.assignedGroupId;
        if (groupId) {
          const members = await prisma.userGroupMember.findMany({
            where: { userGroupId: groupId, tenantId },
            select: { userId: true },
          });
          for (const m of members) userIds.add(m.userId);
        }
        break;
      }
      default:
        userIds.add(r);
        break;
    }
  }

  return Array.from(userIds);
}

/**
 * Resolve dynamic recipient tokens to email addresses.
 */
async function resolveEmailAddresses(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<string[]> {
  const userIds = await resolveRecipients(config, context, tenantId);
  const staticEmails = (config.emails ?? []) as string[];

  if (userIds.length === 0 && staticEmails.length === 0) return staticEmails;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, tenantId },
    select: { email: true },
  });

  const allEmails = new Set<string>([
    ...users.map((u) => u.email),
    ...staticEmails,
  ]);

  return Array.from(allEmails);
}

// ─── Individual Action Executors ─────────────────────────────────────────────

async function executeInApp(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const userIds = await resolveRecipients(config, context, tenantId);
  if (userIds.length === 0) {
    return { type: 'in_app', success: true, detail: 'No recipients resolved' };
  }

  const title = renderTemplate(
    (config.title as string) ?? 'Notification',
    context,
  );
  const body = config.body
    ? renderTemplate(config.body as string, context)
    : undefined;

  const trigger = (context.trigger as string | undefined) ?? '';
  const resourceId = context.ticket?.id ?? context.change?.id;

  // Filter out users already notified for this (tenant, resource, trigger, in_app)
  const recipients: string[] = [];
  for (const userId of userIds) {
    if (await alreadyFired(tenantId, trigger, resourceId, userId, 'in_app')) {
      console.log(`[notify] dedupe skip in_app -> ${userId} (${resourceId} / ${trigger})`);
      continue;
    }
    recipients.push(userId);
  }

  if (recipients.length === 0) {
    return { type: 'in_app', success: true, detail: 'All recipients deduped' };
  }

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      tenantId,
      userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: ((config.notificationType as string) ?? 'GENERAL') as any,
      title,
      body,
      resourceId,
      resource: context.ticket ? 'ticket' : context.change ? 'change' : undefined,
    })),
  });

  return { type: 'in_app', success: true, detail: `Notified ${recipients.length} user(s)` };
}

async function executeEmail(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const emails = await resolveEmailAddresses(config, context, tenantId);
  if (emails.length === 0) {
    return { type: 'email', success: true, detail: 'No email recipients resolved' };
  }

  // Template takes precedence over inline subject/body when templateId is set
  const tpl = await resolveTemplate(config.templateId as string | undefined, tenantId, 'EMAIL');
  const subjectRaw = tpl ? (tpl.content.subject as string) : ((config.subject as string) ?? 'Notification');
  const bodyRaw = tpl ? (tpl.content.htmlBody as string) : ((config.body as string) ?? '');

  const subject = renderTemplate(subjectRaw, context);
  const body = renderTemplate(bodyRaw, context);

  const trigger = (context.trigger as string | undefined) ?? '';
  const resourceId = context.ticket?.id ?? context.change?.id;

  let enqueued = 0;
  for (const to of emails) {
    if (await alreadyFired(tenantId, trigger, resourceId, to, 'email')) {
      console.log(`[notify] dedupe skip email -> ${to} (${resourceId} / ${trigger})`);
      continue;
    }
    await emailNotificationQueue.add('send-email', {
      tenantId,
      to,
      templateName: (config.templateName as string) ?? null,
      variables: {
        subject,
        body,
        ticketNumber: context.ticket?.ticketNumber?.toString() ?? '',
        ticketTitle: context.ticket?.title ?? '',
        ticketId: context.ticket?.id ?? '',
      },
    });
    enqueued += 1;
  }

  return { type: 'email', success: true, detail: `Enqueued ${enqueued} email(s)` };
}

async function executeSlack(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const channelId = config.alertChannelId as string | undefined;
  if (!channelId) {
    return { type: 'slack', success: false, error: 'No alertChannelId configured' };
  }

  const alertConfig = await prisma.alertConfiguration.findFirst({
    where: { id: channelId, isActive: true },
  });
  if (!alertConfig) {
    return { type: 'slack', success: false, error: 'AlertConfiguration not found or inactive' };
  }

  const cfgData = alertConfig.config as Record<string, unknown>;
  const webhookUrl = cfgData.webhookUrl as string | undefined;
  if (!webhookUrl) {
    return { type: 'slack', success: false, error: 'No webhookUrl in alert config' };
  }

  const tpl = await resolveTemplate(config.templateId as string | undefined, tenantId, 'SLACK');
  const messageRaw = tpl
    ? (tpl.content.message as string)
    : ((config.message as string) ?? 'Notification from MeridianITSM');
  const message = renderTemplate(messageRaw, context);

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });

  if (!resp.ok) {
    return { type: 'slack', success: false, error: `Slack webhook returned ${resp.status}` };
  }

  return { type: 'slack', success: true };
}

async function executeTeams(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const channelId = config.alertChannelId as string | undefined;
  if (!channelId) {
    return { type: 'teams', success: false, error: 'No alertChannelId configured' };
  }

  const alertConfig = await prisma.alertConfiguration.findFirst({
    where: { id: channelId, isActive: true },
  });
  if (!alertConfig) {
    return { type: 'teams', success: false, error: 'AlertConfiguration not found or inactive' };
  }

  const cfgData = alertConfig.config as Record<string, unknown>;
  const webhookUrl = cfgData.webhookUrl as string | undefined;
  if (!webhookUrl) {
    return { type: 'teams', success: false, error: 'No webhookUrl in alert config' };
  }

  // TEAMS templates carry title + body separately; collapse into a single "TITLE\n\nBODY" string
  // for the adaptive card since the Teams action historically rendered one message block.
  const tpl = await resolveTemplate(config.templateId as string | undefined, tenantId, 'TEAMS');
  const messageRaw = tpl
    ? `${tpl.content.title as string}\n\n${tpl.content.body as string}`
    : ((config.message as string) ?? 'Notification from MeridianITSM');
  const message = renderTemplate(messageRaw, context);

  // Teams Adaptive Card format
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: message,
              wrap: true,
            },
          ],
        },
      },
    ],
  };

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });

  if (!resp.ok) {
    return { type: 'teams', success: false, error: `Teams webhook returned ${resp.status}` };
  }

  return { type: 'teams', success: true };
}

async function executeDiscord(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const channelId = config.alertChannelId as string | undefined;
  if (!channelId) {
    return { type: 'discord', success: false, error: 'No alertChannelId configured' };
  }

  const alertConfig = await prisma.alertConfiguration.findFirst({
    where: { id: channelId, isActive: true },
  });
  if (!alertConfig) {
    return { type: 'discord', success: false, error: 'AlertConfiguration not found or inactive' };
  }

  const cfgData = alertConfig.config as Record<string, unknown>;
  const webhookUrl = cfgData.webhookUrl as string | undefined;
  if (!webhookUrl) {
    return { type: 'discord', success: false, error: 'No webhookUrl in alert config' };
  }

  const tpl = await resolveTemplate(config.templateId as string | undefined, tenantId, 'DISCORD');
  const messageRaw = tpl
    ? (tpl.content.message as string)
    : ((config.message as string) ?? 'Notification from MeridianITSM');
  const message = renderTemplate(messageRaw, context);

  // Discord webhook embed format
  const payload = {
    content: message,
    embeds: context.ticket
      ? [
          {
            title: `${context.ticket.ticketNumber ? `TKT-${String(context.ticket.ticketNumber).padStart(5, '0')}: ` : ''}${context.ticket.title ?? ''}`,
            color: 0x5865f2, // Discord blurple
          },
        ]
      : undefined,
  };

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    return { type: 'discord', success: false, error: `Discord webhook returned ${resp.status}` };
  }

  return { type: 'discord', success: true };
}

async function executeTelegram(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const channelId = config.alertChannelId as string | undefined;
  if (!channelId) {
    return { type: 'telegram', success: false, error: 'No alertChannelId configured' };
  }

  const alertConfig = await prisma.alertConfiguration.findFirst({
    where: { id: channelId, isActive: true },
  });
  if (!alertConfig) {
    return { type: 'telegram', success: false, error: 'AlertConfiguration not found or inactive' };
  }

  const cfgData = alertConfig.config as Record<string, unknown>;
  const botToken = cfgData.botToken as string | undefined;
  const chatId = cfgData.chatId as string | undefined;
  if (!botToken || !chatId) {
    return { type: 'telegram', success: false, error: 'Missing botToken or chatId in alert config' };
  }

  const tpl = await resolveTemplate(config.templateId as string | undefined, tenantId, 'TELEGRAM');
  const messageRaw = tpl
    ? (tpl.content.message as string)
    : ((config.message as string) ?? 'Notification from MeridianITSM');
  const message = renderTemplate(messageRaw, context);

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  });

  if (!resp.ok) {
    return { type: 'telegram', success: false, error: `Telegram API returned ${resp.status}` };
  }

  return { type: 'telegram', success: true };
}

async function executeWebhook(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const url = config.url as string | undefined;
  if (!url) {
    return { type: 'webhook', success: false, error: 'No URL configured' };
  }

  const payload = JSON.stringify({
    tenantId,
    trigger: context.trigger ?? 'unknown',
    ticket: context.ticket,
    change: context.change,
    comment: context.comment,
    actorId: context.actorId,
    timestamp: new Date().toISOString(),
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // HMAC-SHA256 signature if a secret is configured
  const secret = config.secret as string | undefined;
  if (secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    headers['X-Meridian-Signature'] = `sha256=${signature}`;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
  });

  if (!resp.ok) {
    return { type: 'webhook', success: false, error: `Webhook returned ${resp.status}` };
  }

  return { type: 'webhook', success: true };
}

async function executeSms(
  _config: ActionConfig,
  _context: EventContext,
  _tenantId: string,
): Promise<ActionResult> {
  // Placeholder — SMS provider not yet integrated
  console.log('[notification-rules] SMS action triggered (placeholder)');
  return { type: 'sms', success: true, detail: 'SMS placeholder — no provider configured' };
}

async function executePush(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const userIds = await resolveRecipients(config, context, tenantId);
  if (userIds.length === 0) {
    return { type: 'push', success: true, detail: 'No push recipients resolved' };
  }

  const title = renderTemplate(
    (config.title as string) ?? 'Notification',
    context,
  );
  const body = config.body
    ? renderTemplate(config.body as string, context)
    : undefined;

  const entityId = context.ticket?.id ?? context.change?.id ?? 'unknown';
  const screen = context.ticket ? 'ticket' : context.change ? 'change' : 'home';
  const trigger = (context.trigger as string | undefined) ?? '';

  let enqueued = 0;
  for (const userId of userIds) {
    if (await alreadyFired(tenantId, trigger, entityId, userId, 'push')) {
      console.log(`[notify] dedupe skip push -> ${userId} (${entityId} / ${trigger})`);
      continue;
    }
    const jobId = `push:${userId}:${entityId}`;
    await pushNotificationQueue.add(
      'send-push',
      {
        tenantId,
        userId,
        notificationType: (config.notificationType as string) ?? 'GENERAL',
        title,
        body,
        screen,
        entityId,
      },
      {
        jobId,
        removeOnComplete: { age: 60 },
      },
    );
    enqueued += 1;
  }

  return { type: 'push', success: true, detail: `Enqueued ${enqueued} push notification(s)` };
}

async function executeEscalate(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const ticketId = context.ticket?.id;
  if (!ticketId) {
    return { type: 'escalate', success: false, error: 'No ticket in context' };
  }

  const updateData: Record<string, unknown> = {};
  if (config.queueId) updateData.queueId = config.queueId;
  if (config.assignedGroupId) updateData.assignedGroupId = config.assignedGroupId;
  if (config.assignedToId) updateData.assignedToId = config.assignedToId;

  if (Object.keys(updateData).length === 0) {
    return { type: 'escalate', success: false, error: 'No escalation target configured' };
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
  });

  await prisma.ticketActivity.create({
    data: {
      tenantId,
      ticketId,
      actorId: context.actorId ?? 'system',
      activityType: 'ESCALATED',
      metadata: {
        action: 'notification_rule_escalation',
        ...updateData,
      },
    },
  });

  return { type: 'escalate', success: true, detail: `Escalated ticket ${ticketId}` };
}

async function executeUpdateField(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const ticketId = context.ticket?.id;
  if (!ticketId) {
    return { type: 'update_field', success: false, error: 'No ticket in context' };
  }

  const field = config.field as string | undefined;
  const value = config.value;
  if (!field) {
    return { type: 'update_field', success: false, error: 'No field specified' };
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { [field]: value },
  });

  await prisma.ticketActivity.create({
    data: {
      tenantId,
      ticketId,
      actorId: context.actorId ?? 'system',
      activityType: 'FIELD_CHANGED',
      fieldName: field,
      oldValue: String(context.ticket?.[field] ?? ''),
      newValue: String(value ?? ''),
    },
  });

  return { type: 'update_field', success: true, detail: `Set ${field} = ${String(value)}` };
}

async function executeWebhookWait(
  config: ActionConfig,
  context: EventContext,
  tenantId: string,
): Promise<ActionResult> {
  const url = config.url as string | undefined;
  if (!url) {
    return { type: 'webhook_wait', success: false, error: 'No URL configured' };
  }

  const ticketId = context.ticket?.id;

  const payload = JSON.stringify({
    tenantId,
    trigger: context.trigger ?? 'unknown',
    ticket: context.ticket,
    change: context.change,
    comment: context.comment,
    actorId: context.actorId,
    timestamp: new Date().toISOString(),
  });

  // 5-second timeout via AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return { type: 'webhook_wait', success: false, error: `Webhook returned ${resp.status}` };
    }

    // Parse response and apply responseMapping to ticket
    const responseBody = await resp.json() as Record<string, unknown>;
    const mapping = config.responseMapping as Record<string, string> | undefined;

    if (mapping && ticketId) {
      const updateData: Record<string, unknown> = {};
      for (const [responseKey, ticketField] of Object.entries(mapping)) {
        if (responseBody[responseKey] !== undefined) {
          updateData[ticketField] = responseBody[responseKey];
        }
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.ticket.update({
          where: { id: ticketId },
          data: updateData,
        });
      }
    }

    return { type: 'webhook_wait', success: true, detail: 'Response received and mapped' };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'webhook_wait', success: false, error: `Webhook wait failed: ${message}` };
  }
}

// ─── Action Router ───────────────────────────────────────────────────────────

const ACTION_EXECUTORS: Record<
  string,
  (config: ActionConfig, context: EventContext, tenantId: string) => Promise<ActionResult>
> = {
  in_app: executeInApp,
  email: executeEmail,
  slack: executeSlack,
  teams: executeTeams,
  discord: executeDiscord,
  telegram: executeTelegram,
  webhook: executeWebhook,
  sms: executeSms,
  push: executePush,
  escalate: executeEscalate,
  update_field: executeUpdateField,
  webhook_wait: executeWebhookWait,
};

/**
 * Execute all actions for a matched notification rule in parallel.
 * Returns results for each action (success or failure).
 */
export async function executeActions(
  actions: ActionConfig[],
  context: EventContext,
  tenantId: string,
): Promise<ActionResult[]> {
  if (!actions || actions.length === 0) return [];

  const results = await Promise.allSettled(
    actions.map(async (action) => {
      const executor = ACTION_EXECUTORS[action.type];
      if (!executor) {
        return { type: action.type, success: false, error: `Unknown action type: ${action.type}` } as ActionResult;
      }
      return executor(action, context, tenantId);
    }),
  );

  return results.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      type: actions[idx].type,
      success: false,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    } as ActionResult;
  });
}
