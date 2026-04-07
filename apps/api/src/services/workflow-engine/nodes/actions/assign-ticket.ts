import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { prisma } from '@meridian/db';

registerNode({
  type: 'action_assign_ticket',
  category: 'action',
  label: 'Assign Ticket',
  description: 'Assign the ticket to a user or move to a queue',
  icon: 'mdiAccountArrowRight',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'assignedToId', label: 'Assign to User', type: 'entity_select', helpText: 'endpoint:/api/v1/settings/users?isActive=true&pageSize=200', placeholder: 'Select user...' },
    { key: 'queueId', label: 'Move to Queue', type: 'entity_select', helpText: 'endpoint:/api/v1/settings/queues', placeholder: 'Select queue...' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'assign_ticket', config } };
    }

    const ticketId = context.eventContext.ticket?.id;
    if (!ticketId) {
      return { success: false, error: 'No ticket in context' };
    }

    const assignedToId = config.assignedToId as string | undefined;
    const queueId = config.queueId as string | undefined;

    const updateData: Record<string, unknown> = {};
    const activities: Array<{ type: string; description: string; oldValue?: string; newValue?: string }> = [];

    if (assignedToId) {
      updateData.assignedToId = assignedToId;
      activities.push({
        type: 'ASSIGNMENT',
        description: `Ticket assigned to user ${assignedToId} by workflow`,
        oldValue: context.eventContext.ticket?.assignedToId ?? undefined,
        newValue: assignedToId,
      });
    }

    if (queueId) {
      updateData.queueId = queueId;
      activities.push({
        type: 'QUEUE_CHANGE',
        description: `Ticket moved to queue ${queueId} by workflow`,
        oldValue: context.eventContext.ticket?.queueId ?? undefined,
        newValue: queueId,
      });
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: 'No assignedToId or queueId provided' };
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
    });

    for (const activity of activities) {
      await prisma.ticketActivity.create({
        data: {
          tenantId: context.tenantId,
          ticketId,
          activityType: 'FIELD_CHANGED',
          fieldName: activity.type === 'ASSIGNMENT' ? 'assignedToId' : 'queueId',
          oldValue: activity.oldValue,
          newValue: activity.newValue,
          metadata: {
            source: 'workflow',
            workflowId: context.workflowId,
            workflowName: context.workflowName,
            executionId: context.executionId,
          },
        },
      });
    }

    return {
      success: true,
      output: { ticketId, assignedToId, queueId },
    };
  },
});
