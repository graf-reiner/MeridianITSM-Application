import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../notification-rules-actions.js';

registerNode({
  type: 'action_update_field',
  category: 'action',
  label: 'Update Field',
  description: 'Update a field on the ticket',
  icon: 'mdiPencilBox',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'field', label: 'Field', type: 'text', required: true, placeholder: 'Field name to update' },
    { key: 'value', label: 'Value', type: 'text', required: true, placeholder: 'New value' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'update_field', config } };
    }

    const actionConfig = {
      type: 'update_field' as const,
      field: config.field,
      value: config.value,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
