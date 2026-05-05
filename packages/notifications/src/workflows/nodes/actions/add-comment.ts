import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { prisma } from '@meridian/db';
import { renderTemplate as renderNotificationTemplate } from '../../../conditions.js';
import { guardMutation } from '../../node-idempotency.js';

registerNode({
  type: 'action_add_comment',
  category: 'action',
  mutates: true,
  label: 'Add Comment',
  description: 'Add an automated comment to the ticket',
  icon: 'mdiCommentText',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'content', label: 'Comment Content', type: 'textarea', required: true, placeholder: 'Type / to insert a variable', variableContext: ['ticket', 'requester', 'assignee', 'tenant', 'now'] },
    {
      key: 'visibility',
      label: 'Visibility',
      type: 'select',
      defaultValue: 'INTERNAL',
      options: [
        { label: 'Public', value: 'PUBLIC' },
        { label: 'Internal', value: 'INTERNAL' },
      ],
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'add_comment', config } };
    }

    const ticketId = context.eventContext.ticket?.id;
    if (!ticketId) {
      return { success: false, error: 'No ticket in context' };
    }

    // Render template variables in the comment content (ticket, requester, etc.)
    const content = renderNotificationTemplate(
      (config.content as string) ?? '',
      context.eventContext,
    );
    const visibility = (config.visibility as string) ?? 'INTERNAL';

    // Use the actor from event context, or the ticket requester as fallback
    const authorId = context.eventContext.actorId ?? context.eventContext.ticket?.requestedById;
    if (!authorId) {
      return { success: false, error: 'No author available for comment' };
    }

    const dup = await guardMutation('action_add_comment', context, [visibility, content]);
    if (dup) return dup;

    const comment = await prisma.ticketComment.create({
      data: {
        tenantId: context.tenantId,
        ticketId,
        authorId,
        content: `[Automated] ${content}`,
        visibility: visibility as any,
      },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: context.tenantId,
        ticketId,
        activityType: 'COMMENT_ADDED',
        metadata: {
          source: 'workflow',
          workflowId: context.workflowId,
          workflowName: context.workflowName,
          executionId: context.executionId,
          visibility,
          commentId: comment.id,
        },
      },
    });

    return {
      success: true,
      output: { ticketId, commentId: comment.id, visibility },
    };
  },
});
