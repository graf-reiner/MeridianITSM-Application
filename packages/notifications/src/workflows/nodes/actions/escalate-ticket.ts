import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../actions.js';

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
    { key: 'queueId', label: 'Escalate to Queue', type: 'entity_select', helpText: 'endpoint:/api/v1/settings/queues', placeholder: 'Select queue...' },
    { key: 'assignedGroupId', label: 'Escalate to Group', type: 'entity_select', helpText: 'endpoint:/api/v1/settings/groups', placeholder: 'Select group...' },
    { key: 'assignedToId', label: 'Escalate to User', type: 'entity_select', helpText: 'endpoint:/api/v1/settings/users?isActive=true&pageSize=200', placeholder: 'Select user...' },
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
