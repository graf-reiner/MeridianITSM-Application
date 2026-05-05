import crypto from 'node:crypto';
import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { renderTemplate } from '../../../conditions.js';
import { guardMutation } from '../../node-idempotency.js';
import { maskObject } from '@meridian/core';

const DEFAULT_TIMEOUT_MS = 5000;

registerNode({
  type: 'action_webhook_wait',
  category: 'action',
  mutates: true,
  label: 'Webhook (Wait for Response)',
  description: 'POST to an external URL, parse the JSON response, optionally map fields back to the ticket',
  icon: 'mdiWebhook',
  color: '#0891b2',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [
    { id: 'success',          label: 'Success',          type: 'default' },
    { id: 'failure',          label: 'HTTP Error',       type: 'default' },
    { id: 'timeout',          label: 'Timeout',          type: 'default' },
    { id: 'invalid_response', label: 'Invalid Response', type: 'default' },
  ],
  configSchema: [
    {
      key: 'url', label: 'Webhook URL', type: 'text', required: true,
      placeholder: 'https://example.com/webhook',
      variableContext: ['ticket', 'requester', 'assignee', 'tenant', 'now'],
    },
    {
      key: 'bodyTemplate', label: 'Request Body (optional)', type: 'textarea',
      helpText: 'Leave blank to send the default ticket payload as JSON. If set, the rendered string is sent as the body.',
      placeholder: '{"ticketId": "{{ticket.id}}", "priority": "{{priority}}"}',
      variableContext: ['ticket', 'requester', 'assignee', 'tenant', 'now'],
    },
    { key: 'secret', label: 'HMAC Signing Secret (optional)', type: 'text', placeholder: 'Adds X-Meridian-Signature header' },
    {
      key: 'timeoutMs', label: 'Timeout (ms)', type: 'number',
      defaultValue: DEFAULT_TIMEOUT_MS,
      helpText: 'Request is aborted after this many milliseconds. Default 5000.',
    },
    {
      key: 'responseMapping', label: 'Response Mapping (JSON)', type: 'json',
      helpText: 'Object mapping response keys to ticket fields. e.g. {"externalId": "customFields.externalId", "status": "status"}',
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return {
        success: true,
        nextPort: 'success',
        output: { simulated: true, action: 'webhook_wait', config },
      };
    }

    const url = config.url ? renderTemplate(String(config.url), context.eventContext) : '';
    if (!url) {
      return { success: false, nextPort: 'failure', error: 'No URL configured' };
    }

    const dup = await guardMutation('action_webhook_wait', context, [url]);
    if (dup) return { ...dup, nextPort: 'success' };

    const ticketId = context.eventContext.ticket?.id;
    const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS;

    // Build payload — either the rendered template or the default ticket envelope
    const bodyTemplate = (config.bodyTemplate as string | undefined)?.trim();
    const payload = bodyTemplate
      ? renderTemplate(bodyTemplate, context.eventContext)
      : JSON.stringify({
          tenantId: context.tenantId,
          trigger: context.eventContext.trigger ?? 'unknown',
          ticket: context.eventContext.ticket,
          change: context.eventContext.change,
          comment: context.eventContext.comment,
          actorId: context.eventContext.actorId,
          timestamp: new Date().toISOString(),
        });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = config.secret as string | undefined;
    if (secret) {
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      headers['X-Meridian-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body: payload, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === 'AbortError';
      return {
        success: false,
        nextPort: aborted ? 'timeout' : 'failure',
        error: aborted ? `Webhook timed out after ${timeoutMs}ms` : `Webhook request failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    clearTimeout(timer);

    if (!response.ok) {
      return {
        success: false,
        nextPort: 'failure',
        output: { httpStatus: response.status },
        error: `Webhook returned ${response.status}`,
      };
    }

    let responseBody: Record<string, unknown>;
    try {
      responseBody = await response.json() as Record<string, unknown>;
    } catch (err) {
      return {
        success: false,
        nextPort: 'invalid_response',
        error: `Webhook response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Apply response mapping to ticket if configured
    const mappingRaw = config.responseMapping;
    const mapping: Record<string, string> | null = (() => {
      if (!mappingRaw) return null;
      if (typeof mappingRaw === 'string') {
        try { return JSON.parse(mappingRaw); } catch { return null; }
      }
      if (typeof mappingRaw === 'object') return mappingRaw as Record<string, string>;
      return null;
    })();

    let mappedFields: Record<string, unknown> = {};
    if (mapping && ticketId) {
      const updateData: Record<string, unknown> = {};
      const customFieldUpdates: Record<string, unknown> = {};
      for (const [responseKey, ticketField] of Object.entries(mapping)) {
        if (responseBody[responseKey] === undefined) continue;
        if (ticketField.startsWith('customFields.')) {
          customFieldUpdates[ticketField.slice('customFields.'.length)] = responseBody[responseKey];
        } else {
          updateData[ticketField] = responseBody[responseKey];
        }
      }
      mappedFields = { ...updateData, ...(Object.keys(customFieldUpdates).length ? { customFields: customFieldUpdates } : {}) };

      if (Object.keys(updateData).length > 0 || Object.keys(customFieldUpdates).length > 0) {
        const { prisma } = await import('@meridian/db');

        // Merge custom field updates with existing JSON column
        if (Object.keys(customFieldUpdates).length > 0) {
          const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { customFields: true },
          });
          const existing = (ticket?.customFields ?? {}) as Record<string, unknown>;
          updateData.customFields = { ...existing, ...customFieldUpdates };
        }

        await prisma.ticket.update({
          where: { id: ticketId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: updateData as any,
        });

        await prisma.ticketActivity.create({
          data: {
            tenantId: context.tenantId,
            ticketId,
            actorId: context.eventContext.actorId ?? 'system',
            activityType: 'FIELD_CHANGED',
            metadata: {
              source: 'workflow',
              workflowId: context.workflowId,
              executionId: context.executionId,
              action: 'webhook_wait_response_mapping',
              fields: Object.keys(updateData),
            },
          },
        });
      }
    }

    return {
      success: true,
      nextPort: 'success',
      output: {
        httpStatus: response.status,
        // Mask response keys that look like secrets/tokens before they land in
        // the persisted WorkflowExecutionStep.outputData JSON. Shallow-only —
        // nested fields aren't masked by design (callers should reshape).
        responseBody: maskObject(responseBody),
        mappedFields,
      },
    };
  },
});
