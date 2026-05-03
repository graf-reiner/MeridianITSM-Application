// ─── Inbound Webhook Service (worker-side copy) ─────────────────────────────
// Mirrors apps/api/src/services/inbound-webhook.service.ts. Cross-app imports
// are forbidden, so the mapping + token logic is duplicated. Keep the two
// files in sync — the api side uses applyMapping for /preview-mapping; the
// worker uses it for actual ticket creation.
//
// One intentional divergence from the api copy: this version LOOKS UP users
// by email but never creates new ones. The api side may auto-create requesters
// for portal form submissions, but the worker treats unknown alert emails as
// "no requester" and falls back to defaultRequesterId — alert traffic
// shouldn't pollute the user table.

import { createHash } from 'node:crypto';
import { prisma, Prisma } from '@meridian/db';
import { renderTemplate } from '@meridian/core';

type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TicketType = 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM' | 'CHANGE_REQUEST' | 'TASK' | 'MAJOR_INCIDENT';
type InboundWebhook = Prisma.InboundWebhookGetPayload<Record<string, never>>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface InboundWebhookMapping {
  titleTemplate?: string;
  descriptionTemplate?: string;
  priorityTemplate?: string;
  typeTemplate?: string;
  requesterEmailTemplate?: string;
  queueIdTemplate?: string;
  categoryIdTemplate?: string;
  customFields?: Record<string, string>;
}

const VALID_PRIORITIES = new Set<TicketPriority>(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const VALID_TYPES = new Set<TicketType>(['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE_REQUEST', 'TASK', 'MAJOR_INCIDENT']);

const BUILT_IN_DEFAULTS = {
  titleTemplate: '{{json.title}}',
  descriptionTemplate: '{{json.description}}',
  priorityTemplate: '{{json.priority}}',
  typeTemplate: '{{json.type}}',
  requesterEmailTemplate: '{{json.requesterEmail}}',
};

export interface MappedTicketInput {
  title: string;
  description?: string;
  type?: TicketType;
  priority?: TicketPriority;
  queueId?: string;
  categoryId?: string;
  requestedById?: string;
  customFields?: Record<string, unknown>;
  source: 'WEBHOOK';
}

export interface MappingResult {
  data: MappedTicketInput;
  mappedFields: Record<string, unknown>;
}

export async function applyMapping(
  webhook: Pick<InboundWebhook,
    'id' | 'tenantId' | 'name' | 'mapping' | 'defaultPriority' | 'defaultType' |
    'defaultQueueId' | 'defaultCategoryId' | 'defaultRequesterId'
  >,
  payload: unknown,
  headers: Record<string, string>,
): Promise<MappingResult> {
  const mapping = (webhook.mapping ?? {}) as InboundWebhookMapping;
  const ctx = {
    json: payload ?? {},
    headers,
    now: new Date().toISOString(),
  };

  const titleRaw = renderTemplate(
    mapping.titleTemplate ?? BUILT_IN_DEFAULTS.titleTemplate,
    ctx,
  ).trim();
  const title = titleRaw || `Webhook from ${webhook.name}`;

  const description = renderTemplate(
    mapping.descriptionTemplate ?? BUILT_IN_DEFAULTS.descriptionTemplate,
    ctx,
  ).trim() || undefined;

  const priorityRendered = renderTemplate(
    mapping.priorityTemplate ?? BUILT_IN_DEFAULTS.priorityTemplate,
    ctx,
  ).trim().toUpperCase();
  const priority: TicketPriority | undefined = VALID_PRIORITIES.has(priorityRendered as TicketPriority)
    ? (priorityRendered as TicketPriority)
    : ((webhook.defaultPriority as TicketPriority | null) ?? undefined);

  const typeRendered = renderTemplate(
    mapping.typeTemplate ?? BUILT_IN_DEFAULTS.typeTemplate,
    ctx,
  ).trim().toUpperCase();
  const type: TicketType | undefined = VALID_TYPES.has(typeRendered as TicketType)
    ? (typeRendered as TicketType)
    : ((webhook.defaultType as TicketType | null) ?? undefined);

  const queueIdRendered = mapping.queueIdTemplate ? renderTemplate(mapping.queueIdTemplate, ctx).trim() : '';
  const queueId = queueIdRendered || webhook.defaultQueueId || undefined;

  const categoryIdRendered = mapping.categoryIdTemplate ? renderTemplate(mapping.categoryIdTemplate, ctx).trim() : '';
  const categoryId = categoryIdRendered || webhook.defaultCategoryId || undefined;

  // Requester — look up by email but don't create. Fall back to defaultRequesterId.
  const requesterEmail = renderTemplate(
    mapping.requesterEmailTemplate ?? BUILT_IN_DEFAULTS.requesterEmailTemplate,
    ctx,
  ).trim().toLowerCase();
  let requestedById: string | undefined;
  if (requesterEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requesterEmail)) {
    const u = await prisma.user.findFirst({
      where: { tenantId: webhook.tenantId, email: requesterEmail },
      select: { id: true },
    });
    requestedById = u?.id ?? webhook.defaultRequesterId ?? undefined;
  } else if (webhook.defaultRequesterId) {
    requestedById = webhook.defaultRequesterId;
  }

  let customFields: Record<string, unknown> | undefined;
  if (mapping.customFields) {
    customFields = {};
    for (const [k, tpl] of Object.entries(mapping.customFields)) {
      customFields[k] = renderTemplate(tpl, ctx);
    }
  }

  const data: MappedTicketInput = {
    title,
    description,
    type,
    priority,
    queueId,
    categoryId,
    requestedById,
    customFields,
    source: 'WEBHOOK',
  };

  return {
    data,
    mappedFields: {
      title,
      description,
      type,
      priority,
      queueId,
      categoryId,
      requesterEmail: requesterEmail || null,
      requestedById,
      customFields,
    },
  };
}
