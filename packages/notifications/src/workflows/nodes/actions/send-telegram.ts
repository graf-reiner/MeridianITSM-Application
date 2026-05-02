import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../actions.js';

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
    {
      key: 'templateId',
      label: 'Template',
      type: 'template_ref',
      templateChannel: 'TELEGRAM',
      helpText: 'Optional — pick a saved template, or leave blank to type inline.',
      hidesKeys: ['message'],
    },
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
      templateId: config.templateId,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
