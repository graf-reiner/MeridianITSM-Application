// ─── Inbound Webhook Service ─────────────────────────────────────────────────
// Helpers used by the public POST endpoint AND the BullMQ worker that
// processes queued deliveries. Keeps mapping logic in one place so the
// "preview-mapping" admin route returns identical results to a real delivery.

import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@meridian/db';
import { renderTemplate } from '@meridian/core';
import { redis } from '../lib/redis.js';
import { findOrCreateAnonymousUser } from './anonymous-user.service.js';

// Local type aliases — @meridian/db doesn't re-export the Prisma enums, but
// using the string-literal shapes is sufficient for our purposes (we never
// actually pass these to a Prisma generated input — createTicket accepts the
// strings directly via its CreateTicketData interface).
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TicketType = 'INCIDENT' | 'SERVICE_REQUEST' | 'PROBLEM' | 'CHANGE_REQUEST' | 'TASK' | 'MAJOR_INCIDENT';
type InboundWebhook = Prisma.InboundWebhookGetPayload<Record<string, never>>;

// ─── Token hashing ───────────────────────────────────────────────────────────
// Same algorithm as ApiKey + AgentEnrollmentToken — SHA-256 hex.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

// ─── Mapping types ──────────────────────────────────────────────────────────

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

// Built-in defaults so a plain `curl -d '{"title":"hi","description":"yo"}'`
// works without any per-webhook mapping configured. Power users override
// these by setting the corresponding template fields in webhook.mapping.
const BUILT_IN_DEFAULTS: Required<Pick<InboundWebhookMapping,
  'titleTemplate' | 'descriptionTemplate' | 'priorityTemplate' | 'typeTemplate' | 'requesterEmailTemplate'
>> = {
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
  mappedFields: Record<string, unknown>; // for delivery audit
}

/**
 * Render the inbound payload through the webhook's mapping templates and
 * produce a CreateTicket-shaped object. Pure function — no DB writes except
 * the optional findOrCreateAnonymousUser call when an email maps to a new
 * requester. Safe to call from the preview-mapping admin endpoint.
 */
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

  // Title — fall back to built-in template, then to a synthesized name.
  const titleRaw = renderTemplate(
    mapping.titleTemplate ?? BUILT_IN_DEFAULTS.titleTemplate,
    ctx,
  ).trim();
  const title = titleRaw || `Webhook from ${webhook.name}`;

  const description = renderTemplate(
    mapping.descriptionTemplate ?? BUILT_IN_DEFAULTS.descriptionTemplate,
    ctx,
  ).trim() || undefined;

  // Priority — validate against enum, fall back to default.
  const priorityRendered = renderTemplate(
    mapping.priorityTemplate ?? BUILT_IN_DEFAULTS.priorityTemplate,
    ctx,
  ).trim().toUpperCase();
  const priority: TicketPriority | undefined = VALID_PRIORITIES.has(priorityRendered as TicketPriority)
    ? (priorityRendered as TicketPriority)
    : (webhook.defaultPriority ?? undefined);

  // Type — validate against enum, fall back to default (or INCIDENT).
  const typeRendered = renderTemplate(
    mapping.typeTemplate ?? BUILT_IN_DEFAULTS.typeTemplate,
    ctx,
  ).trim().toUpperCase();
  const type: TicketType | undefined = VALID_TYPES.has(typeRendered as TicketType)
    ? (typeRendered as TicketType)
    : (webhook.defaultType ?? undefined);

  // Queue / Category — uuid templates fall back to defaults.
  const queueIdRendered = mapping.queueIdTemplate ? renderTemplate(mapping.queueIdTemplate, ctx).trim() : '';
  const queueId = queueIdRendered || webhook.defaultQueueId || undefined;

  const categoryIdRendered = mapping.categoryIdTemplate ? renderTemplate(mapping.categoryIdTemplate, ctx).trim() : '';
  const categoryId = categoryIdRendered || webhook.defaultCategoryId || undefined;

  // Requester — if email maps to a value, find/create that user; else default.
  const requesterEmail = renderTemplate(
    mapping.requesterEmailTemplate ?? BUILT_IN_DEFAULTS.requesterEmailTemplate,
    ctx,
  ).trim();
  let requestedById: string | undefined;
  if (requesterEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requesterEmail)) {
    requestedById = await findOrCreateAnonymousUser(
      webhook.tenantId,
      requesterEmail,
      'External',
      'Webhook',
    );
  } else if (webhook.defaultRequesterId) {
    requestedById = webhook.defaultRequesterId;
  }

  // Custom fields — render each value template.
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

// ─── Idempotency ─────────────────────────────────────────────────────────────
// 24h TTL on idempotency keys — long enough to cover the typical retry windows
// of every major sender (PagerDuty 30 min, Datadog 24 h, GitHub 24 h, Stripe 3 d
// — Stripe's longer window we don't fully cover, callers just create a fresh
// key on retries past 24 h).

const IDEMPOTENCY_TTL_SECONDS = 86_400;

export interface IdempotencyHit {
  duplicate: true;
  cachedDeliveryId: string;
  cachedTicketId?: string;
  cachedTicketNumber?: number;
}

export interface IdempotencyMiss {
  duplicate: false;
}

/**
 * Check whether an idempotency key has been seen before for this webhook.
 * Returns `duplicate: false` if first sighting (and reserves the key).
 * Returns `duplicate: true` with the cached delivery + ticket ids if seen.
 *
 * Key shape: `inbound-webhook:idem:{tenantId}:{webhookId}:{sha256(rawKey)}`
 * — hashing the raw key avoids putting attacker-controlled strings in Redis
 * key names.
 */
export async function checkIdempotency(
  tenantId: string,
  webhookId: string,
  rawKey: string,
  newDeliveryId: string,
): Promise<IdempotencyHit | IdempotencyMiss> {
  const keyHash = hashToken(rawKey);
  const redisKey = `inbound-webhook:idem:${tenantId}:${webhookId}:${keyHash}`;

  // Reserve atomically. Value is "pending:<deliveryId>" until the worker
  // overwrites with the final ticket info.
  const reserveValue = `pending:${newDeliveryId}`;
  let reserved: string | null;
  try {
    reserved = await redis.set(redisKey, reserveValue, 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
  } catch (err) {
    // Redis down — fail open (skip dedup, accept the request).
    console.warn('[inbound-webhook] idempotency Redis SET failed (failing open):', err);
    return { duplicate: false };
  }

  if (reserved === 'OK') {
    return { duplicate: false };
  }

  // Key already existed — fetch the cached value and return it.
  const cached = await redis.get(redisKey).catch(() => null);
  if (!cached) return { duplicate: true, cachedDeliveryId: '' };

  // Format: "pending:<id>" or "done:<deliveryId>:<ticketId>:<ticketNumber>"
  const parts = cached.split(':');
  if (parts[0] === 'pending') {
    return { duplicate: true, cachedDeliveryId: parts[1] ?? '' };
  }
  if (parts[0] === 'done') {
    return {
      duplicate: true,
      cachedDeliveryId: parts[1] ?? '',
      cachedTicketId: parts[2] ?? undefined,
      cachedTicketNumber: parts[3] ? parseInt(parts[3], 10) : undefined,
    };
  }
  return { duplicate: true, cachedDeliveryId: '' };
}

/** Mark an idempotency key as "completed" with the resulting ticket info. */
export async function markIdempotencyComplete(
  tenantId: string,
  webhookId: string,
  rawKey: string,
  deliveryId: string,
  ticketId: string,
  ticketNumber: number,
): Promise<void> {
  const keyHash = hashToken(rawKey);
  const redisKey = `inbound-webhook:idem:${tenantId}:${webhookId}:${keyHash}`;
  try {
    await redis.set(redisKey, `done:${deliveryId}:${ticketId}:${ticketNumber}`, 'EX', IDEMPOTENCY_TTL_SECONDS);
  } catch (err) {
    console.warn('[inbound-webhook] idempotency completion failed (non-fatal):', err);
  }
}

// ─── Header sanitization ─────────────────────────────────────────────────────
// We persist a copy of every inbound request's headers for audit/debug. Strip
// `authorization` (sensitive even though we don't currently use it for inbound
// webhooks — future HMAC adds wouldn't change this filter).

const SAFE_HEADERS = new Set([
  'user-agent',
  'content-type',
  'content-length',
  'x-idempotency-key',
  'x-forwarded-for',
  'x-real-ip',
  'x-meridian-signature', // pre-emptively allowed for v2 HMAC
]);

export function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (!SAFE_HEADERS.has(lk)) continue;
    if (v === undefined) continue;
    out[lk] = Array.isArray(v) ? v.join(',') : v;
  }
  return out;
}
