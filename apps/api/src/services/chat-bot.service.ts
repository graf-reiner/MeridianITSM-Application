import { prisma } from '@meridian/db';
import { createTicket } from './ticket.service.js';
import { findOrCreateAnonymousUser } from './anonymous-user.service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BotCommandResult {
  text: string;
  buttons?: Array<{ label: string; data: string }>;
}

interface FormField {
  instanceId: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  placeholder: string | null;
  helpText: string | null;
  optionsJson: Array<{ label: string; value: string }> | null;
}

// ─── Command Router ──────────────────────────────────────────────────────────

/**
 * Route an incoming bot command to the appropriate handler.
 * Returns a text response (and optional buttons) to send back to the user.
 */
export async function handleBotCommand(
  platform: 'discord' | 'telegram',
  platformUserId: string,
  channelId: string,
  tenantId: string,
  messageText: string,
): Promise<BotCommandResult> {
  const text = messageText.trim();

  // Check if user is in an active form session
  const activeSession = await prisma.chatBotSession.findFirst({
    where: {
      tenantId,
      platform,
      platformUserId,
      status: 'active',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (activeSession) {
    // Cancel command
    if (text.toLowerCase() === '/cancel') {
      await prisma.chatBotSession.update({
        where: { id: activeSession.id },
        data: { status: 'abandoned' },
      });
      return { text: 'Form session cancelled.' };
    }
    return handleFormResponse(activeSession, text, tenantId);
  }

  // Parse command
  const commandMatch = text.match(/^\/([\w-]+)\s*(.*)/s);
  if (!commandMatch) {
    return { text: 'Use /help to see available commands.' };
  }

  const command = commandMatch[1].toLowerCase();
  const args = commandMatch[2].trim();

  switch (command) {
    case 'ticket_new':
    case 'ticket-new':
    case 'new':
      return handleTicketNew(platform, platformUserId, channelId, tenantId, args);

    case 'ticket_status':
    case 'ticket-status':
    case 'status':
      return handleTicketStatus(tenantId, args);

    case 'ticket_form':
    case 'ticket-form':
    case 'form':
      return handleFormStart(platform, platformUserId, channelId, tenantId, args);

    case 'help':
    case 'start':
      return {
        text: [
          '📋 *MeridianITSM Bot Commands*',
          '',
          '/ticket_new <title> — Create a quick ticket',
          '/ticket_status <number> — Check ticket status',
          '/ticket_form <form-slug> — Start a guided form',
          '/help — Show this help message',
          '/cancel — Cancel active form session',
        ].join('\n'),
      };

    default:
      return { text: `Unknown command: /${command}. Use /help for available commands.` };
  }
}

// ─── Quick Ticket Creation ───────────────────────────────────────────────────

async function handleTicketNew(
  platform: string,
  platformUserId: string,
  channelId: string,
  tenantId: string,
  title: string,
): Promise<BotCommandResult> {
  if (!title) {
    return { text: 'Please provide a ticket title. Example: /ticket_new My laptop screen is flickering' };
  }

  try {
    // Find or create user
    const userId = await findOrCreateAnonymousUser(
      tenantId,
      `${platform}-${platformUserId}@bot.meridianitsm.local`,
      platform === 'discord' ? 'Discord' : 'Telegram',
      `User ${platformUserId}`,
    );

    const ticket = await createTicket(tenantId, {
      title,
      type: 'INCIDENT',
      priority: 'MEDIUM',
      source: platform.toUpperCase(),
    }, userId);

    const ticketNum = `TKT-${String(ticket.ticketNumber).padStart(5, '0')}`;
    return {
      text: `✅ Ticket created: *${ticketNum}*\n📝 ${title}\n\nAn agent will be assigned shortly.`,
      buttons: [
        { label: '📊 Check Status', data: `/ticket_status ${ticket.ticketNumber}` },
      ],
    };
  } catch (err) {
    return { text: `❌ Failed to create ticket: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}

// ─── Ticket Status Lookup ────────────────────────────────────────────────────

async function handleTicketStatus(tenantId: string, args: string): Promise<BotCommandResult> {
  const numStr = args.replace(/^TKT-/i, '').replace(/^0+/, '');
  const ticketNumber = Number(numStr);

  if (!ticketNumber || isNaN(ticketNumber)) {
    return { text: 'Please provide a ticket number. Example: /ticket_status 42 or /ticket_status TKT-00042' };
  }

  const ticket = await prisma.ticket.findFirst({
    where: { tenantId, ticketNumber },
    select: {
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      assignedTo: { select: { firstName: true, lastName: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!ticket) {
    return { text: `Ticket #${ticketNumber} not found.` };
  }

  const assignee = ticket.assignedTo
    ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
    : 'Unassigned';

  return {
    text: [
      `📋 *TKT-${String(ticket.ticketNumber).padStart(5, '0')}*`,
      `📝 ${ticket.title}`,
      `📊 Status: ${ticket.status.replace(/_/g, ' ')}`,
      `🔥 Priority: ${ticket.priority}`,
      `👤 Assigned: ${assignee}`,
      `📅 Created: ${ticket.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    ].join('\n'),
  };
}

// ─── Form Conversation Start ─────────────────────────────────────────────────

async function handleFormStart(
  platform: 'discord' | 'telegram',
  platformUserId: string,
  channelId: string,
  tenantId: string,
  formSlug: string,
): Promise<BotCommandResult> {
  if (!formSlug) {
    // List available forms
    const forms = await prisma.customForm.findMany({
      where: { tenantId, status: 'PUBLISHED', showInPortal: true },
      select: { slug: true, name: true, description: true },
      orderBy: { position: 'asc' },
      take: 10,
    });

    if (forms.length === 0) {
      return { text: 'No forms available.' };
    }

    const list = forms.map((f) => `• /ticket_form ${f.slug} — ${f.name}`).join('\n');
    return { text: `📋 *Available Forms:*\n\n${list}` };
  }

  // Load form
  const form = await prisma.customForm.findFirst({
    where: { tenantId, slug: formSlug, status: 'PUBLISHED' },
  });

  if (!form) {
    return { text: `Form "${formSlug}" not found. Use /ticket_form to see available forms.` };
  }

  // Resolve form fields
  const layout = form.layoutJson as { sections?: Array<{ fields: Array<{ fieldDefinitionId: string; instanceId: string; overrides?: Record<string, unknown> }> }> };
  const sections = layout?.sections ?? [];
  const fieldDefIds = sections.flatMap((s) => s.fields.map((f) => f.fieldDefinitionId));

  const fieldDefs = await prisma.fieldDefinition.findMany({
    where: { id: { in: fieldDefIds } },
  });

  const defMap = new Map(fieldDefs.map((d) => [d.id, d]));
  const flatFields: FormField[] = sections.flatMap((s) =>
    s.fields.map((f) => {
      const def = defMap.get(f.fieldDefinitionId);
      const overrides = (f.overrides ?? {}) as Record<string, unknown>;
      return {
        instanceId: f.instanceId,
        label: (overrides.label as string) ?? def?.label ?? 'Field',
        fieldType: def?.fieldType ?? 'text',
        isRequired: (overrides.isRequired as boolean) ?? def?.isRequired ?? false,
        placeholder: (overrides.placeholder as string) ?? def?.placeholder ?? null,
        helpText: (overrides.helpText as string) ?? def?.helpText ?? null,
        optionsJson: (def?.optionsJson as Array<{ label: string; value: string }>) ?? null,
      };
    }),
  ).filter((f) => !['file', 'user_picker', 'group_picker', 'hidden'].includes(f.fieldType));

  if (flatFields.length === 0) {
    return { text: 'This form has no fields that can be filled via chat.' };
  }

  // Create session
  await prisma.chatBotSession.create({
    data: {
      tenantId,
      platform,
      platformUserId,
      channelId,
      formId: form.id,
      currentFieldIdx: 0,
      collectedValues: {},
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min timeout
    },
  });

  // Send first question
  return formatFieldQuestion(flatFields[0], form.name, 0, flatFields.length);
}

// ─── Form Response Handler ───────────────────────────────────────────────────

async function handleFormResponse(
  session: { id: string; formId: string | null; currentFieldIdx: number; collectedValues: unknown; tenantId?: string },
  answer: string,
  tenantId: string,
): Promise<BotCommandResult> {
  if (!session.formId) {
    return { text: 'Session error. Please start over with /ticket_form.' };
  }

  // Load form and fields
  const form = await prisma.customForm.findFirst({
    where: { id: session.formId, tenantId },
  });

  if (!form) {
    return { text: 'Form not found. Please start over.' };
  }

  const layout = form.layoutJson as { sections?: Array<{ fields: Array<{ fieldDefinitionId: string; instanceId: string; overrides?: Record<string, unknown> }> }> };
  const sections = layout?.sections ?? [];
  const fieldDefIds = sections.flatMap((s) => s.fields.map((f) => f.fieldDefinitionId));
  const fieldDefs = await prisma.fieldDefinition.findMany({ where: { id: { in: fieldDefIds } } });
  const defMap = new Map(fieldDefs.map((d) => [d.id, d]));

  const flatFields: FormField[] = sections.flatMap((s) =>
    s.fields.map((f) => {
      const def = defMap.get(f.fieldDefinitionId);
      const overrides = (f.overrides ?? {}) as Record<string, unknown>;
      return {
        instanceId: f.instanceId,
        label: (overrides.label as string) ?? def?.label ?? 'Field',
        fieldType: def?.fieldType ?? 'text',
        isRequired: (overrides.isRequired as boolean) ?? def?.isRequired ?? false,
        placeholder: null,
        helpText: null,
        optionsJson: (def?.optionsJson as Array<{ label: string; value: string }>) ?? null,
      };
    }),
  ).filter((f) => !['file', 'user_picker', 'group_picker', 'hidden'].includes(f.fieldType));

  const currentField = flatFields[session.currentFieldIdx];
  if (!currentField) {
    return { text: 'Session error. Please start over.' };
  }

  // Validate answer
  const trimmed = answer.trim();
  if (currentField.isRequired && !trimmed) {
    return { text: `❌ This field is required. Please provide a value for: *${currentField.label}*` };
  }

  // Resolve select/radio by number
  let resolvedValue: unknown = trimmed;
  if (currentField.optionsJson && currentField.optionsJson.length > 0 && trimmed) {
    const num = Number(trimmed);
    if (!isNaN(num) && num >= 1 && num <= currentField.optionsJson.length) {
      resolvedValue = currentField.optionsJson[num - 1].value;
    } else {
      // Try matching by label or value
      const match = currentField.optionsJson.find(
        (o) => o.value.toLowerCase() === trimmed.toLowerCase() || o.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (match) {
        resolvedValue = match.value;
      } else {
        const options = currentField.optionsJson.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
        return { text: `❌ Invalid choice. Please enter a number:\n${options}` };
      }
    }
  }

  // Handle checkbox
  if (currentField.fieldType === 'checkbox') {
    resolvedValue = ['yes', 'y', 'true', '1'].includes(trimmed.toLowerCase());
  }

  // Store answer
  const values = (session.collectedValues as Record<string, unknown>) ?? {};
  values[currentField.instanceId] = resolvedValue;

  const nextIdx = session.currentFieldIdx + 1;

  if (nextIdx >= flatFields.length) {
    // All fields collected — submit
    await prisma.chatBotSession.update({
      where: { id: session.id },
      data: { status: 'completed', collectedValues: values as any },
    });

    return submitFormFromChat(form, values, tenantId, session);
  }

  // Advance to next field
  await prisma.chatBotSession.update({
    where: { id: session.id },
    data: {
      currentFieldIdx: nextIdx,
      collectedValues: values as any,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  return formatFieldQuestion(flatFields[nextIdx], form.name, nextIdx, flatFields.length);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFieldQuestion(field: FormField, formName: string, idx: number, total: number): BotCommandResult {
  const progress = `(${idx + 1}/${total})`;
  let text = `📋 *${formName}* ${progress}\n\n`;
  text += `❓ *${field.label}*${field.isRequired ? ' (required)' : ''}\n`;

  if (field.helpText) {
    text += `💡 ${field.helpText}\n`;
  }

  if (field.optionsJson && field.optionsJson.length > 0) {
    text += '\n';
    const options = field.optionsJson.map((o, i) => `${i + 1}. ${o.label}`);
    text += options.join('\n');
    text += '\n\nReply with a number to choose.';

    return {
      text,
      buttons: field.optionsJson.slice(0, 5).map((o, i) => ({
        label: o.label,
        data: String(i + 1),
      })),
    };
  }

  if (field.fieldType === 'checkbox') {
    text += 'Reply: yes or no';
    return {
      text,
      buttons: [
        { label: 'Yes', data: 'yes' },
        { label: 'No', data: 'no' },
      ],
    };
  }

  if (field.placeholder) {
    text += `Example: ${field.placeholder}`;
  }

  return { text };
}

async function submitFormFromChat(
  form: { id: string; name: string; ticketType: string; defaultPriority: string | null; defaultCategoryId: string | null; defaultQueueId: string | null; titleTemplate: string | null; descriptionTemplate: string | null; defaultTags: string[] },
  values: Record<string, unknown>,
  tenantId: string,
  session: { platform?: string; platformUserId?: string },
): Promise<BotCommandResult> {
  try {
    const platform = (session as any).platform ?? 'bot';
    const platformUserId = (session as any).platformUserId ?? 'unknown';

    const userId = await findOrCreateAnonymousUser(
      tenantId,
      `${platform}-${platformUserId}@bot.meridianitsm.local`,
      platform === 'discord' ? 'Discord' : 'Telegram',
      `User ${platformUserId}`,
    );

    // Build title from template or first text field
    let title = form.titleTemplate
      ? form.titleTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''))
      : `${form.name} submission`;

    if (!title || title === `${form.name} submission`) {
      // Use first text field value as title
      const firstText = Object.values(values).find((v) => typeof v === 'string' && v.length > 0);
      if (firstText) title = String(firstText).slice(0, 200);
    }

    // Build description from all values
    const descLines = Object.entries(values)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `**${k}**: ${String(v)}`)
      .join('\n');

    const ticket = await createTicket(tenantId, {
      title,
      description: descLines,
      type: (form.ticketType as any) ?? 'SERVICE_REQUEST',
      priority: (form.defaultPriority as any) ?? 'MEDIUM',
      categoryId: form.defaultCategoryId ?? undefined,
      queueId: form.defaultQueueId ?? undefined,
      tags: form.defaultTags ?? [],
      source: platform.toUpperCase(),
    }, userId);

    const ticketNum = `TKT-${String(ticket.ticketNumber).padStart(5, '0')}`;
    return {
      text: `✅ *Form submitted successfully!*\n\n📋 Ticket: *${ticketNum}*\n📝 ${title}\n\nYou'll receive updates when the ticket is processed.`,
    };
  } catch (err) {
    return { text: `❌ Failed to submit form: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}
