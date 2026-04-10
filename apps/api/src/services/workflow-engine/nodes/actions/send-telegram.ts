import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../notification-rules-actions.js';

registerNode({
  type: 'action_send_telegram',
  category: 'action',
  label: 'Send Telegram Message',
  description: 'Send a message to a Telegram chat or group',
  icon: 'mdiSend',
  color: '#0088cc',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'alertChannelId', label: 'Telegram Channel', type: 'text', placeholder: 'Alert channel ID' },
    { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Type / to insert a variable', variableContext: ['ticket', 'requester', 'assignee', 'tenant', 'now'] },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'send_telegram', config } };
    }

    const actionConfig = {
      type: 'telegram' as const,
      alertChannelId: config.alertChannelId,
      message: config.message,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
