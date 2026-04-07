import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../notification-rules-actions.js';

registerNode({
  type: 'action_send_push',
  category: 'action',
  label: 'Send Push Notification',
  description: 'Send a push notification to mobile devices',
  icon: 'mdiBellAlert',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    {
      key: 'recipients',
      label: 'Recipients',
      type: 'multiselect',
      options: [
        { label: 'Assignee', value: 'assignee' },
        { label: 'Requester', value: 'requester' },
        { label: 'Group Members', value: 'group_members' },
      ],
    },
    { key: 'title', label: 'Title', type: 'text', placeholder: 'Push notification title' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Push notification body with {{variables}}' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'send_push', config } };
    }

    const actionConfig = {
      type: 'push' as const,
      recipients: config.recipients,
      title: config.title,
      body: config.body,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
