import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { prisma } from '@meridian/db';

registerNode({
  type: 'action_change_status',
  category: 'action',
  label: 'Change Ticket Status',
  description: 'Change the status of the current ticket',
  icon: 'mdiSwapHorizontal',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    {
      key: 'status',
      label: 'New Status',
      type: 'select',
      required: true,
      options: [
        { label: 'New', value: 'NEW' },
        { label: 'Open', value: 'OPEN' },
        { label: 'In Progress', value: 'IN_PROGRESS' },
        { label: 'Pending', value: 'PENDING' },
        { label: 'Resolved', value: 'RESOLVED' },
        { label: 'Closed', value: 'CLOSED' },
        { label: 'Cancelled', value: 'CANCELLED' },
      ],
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'change_status', config } };
    }

    const ticketId = context.eventContext.ticket?.id;
    if (!ticketId) {
      return { success: false, error: 'No ticket in context' };
    }

    const newStatus = config.status as string;
    const oldStatus = context.eventContext.ticket?.status;

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: newStatus,
        ...(newStatus === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
        ...(newStatus === 'CLOSED' ? { closedAt: new Date() } : {}),
      },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: context.tenantId,
        ticketId,
        activityType: 'FIELD_CHANGED',
        fieldName: 'status',
        oldValue: oldStatus,
        newValue: newStatus,
        metadata: {
          source: 'workflow',
          workflowId: context.workflowId,
          workflowName: context.workflowName,
          executionId: context.executionId,
        },
      },
    });

    return {
      success: true,
      output: { ticketId, oldStatus, newStatus },
    };
  },
});
