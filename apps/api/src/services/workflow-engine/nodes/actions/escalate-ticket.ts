import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../notification-rules-actions.js';

registerNode({
  type: 'action_escalate',
  category: 'action',
  label: 'Escalate Ticket',
  description: 'Escalate a ticket to a different queue, group, or user',
  icon: 'mdiArrowUpBold',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'queueId', label: 'Queue ID', type: 'text', placeholder: 'Target queue ID' },
    { key: 'assignedGroupId', label: 'Assigned Group ID', type: 'text', placeholder: 'Target group ID' },
    { key: 'assignedToId', label: 'Assigned To User ID', type: 'text', placeholder: 'Target user ID' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'escalate', config } };
    }

    const actionConfig = {
      type: 'escalate' as const,
      queueId: config.queueId,
      assignedGroupId: config.assignedGroupId,
      assignedToId: config.assignedToId,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
