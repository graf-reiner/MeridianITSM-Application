import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { prisma } from '@meridian/db';

registerNode({
  type: 'action_change_priority',
  category: 'action',
  label: 'Change Priority',
  description: 'Change the priority of the current ticket',
  icon: 'mdiAlertCircle',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    {
      key: 'priority',
      label: 'New Priority',
      type: 'select',
      required: true,
      options: [
        { label: 'Low', value: 'LOW' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'High', value: 'HIGH' },
        { label: 'Critical', value: 'CRITICAL' },
      ],
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'change_priority', config } };
    }

    const ticketId = context.eventContext.ticket?.id;
    if (!ticketId) {
      return { success: false, error: 'No ticket in context' };
    }

    const newPriority = config.priority as string;
    const oldPriority = context.eventContext.ticket?.priority;

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { priority: newPriority },
    });

    await prisma.ticketActivity.create({
      data: {
        tenantId: context.tenantId,
        ticketId,
        type: 'PRIORITY_CHANGE',
        description: `Priority changed from ${oldPriority} to ${newPriority} by workflow`,
        oldValue: oldPriority,
        newValue: newPriority,
      },
    });

    return {
      success: true,
      output: { ticketId, oldPriority, newPriority },
    };
  },
});
