import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../notification-rules-actions.js';

registerNode({
  type: 'action_send_teams',
  category: 'action',
  label: 'Send Teams Message',
  description: 'Send a message to a Microsoft Teams channel',
  icon: 'mdiMicrosoftTeams',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'alertChannelId', label: 'Channel ID', type: 'text', placeholder: 'Teams channel webhook URL' },
    { key: 'title', label: 'Title', type: 'text', placeholder: 'Card title with {{variables}}' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Card body with {{variables}}' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'send_teams', config } };
    }

    const actionConfig = {
      type: 'teams' as const,
      alertChannelId: config.alertChannelId,
      title: config.title,
      body: config.body,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
