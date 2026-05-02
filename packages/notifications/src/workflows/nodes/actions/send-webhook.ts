import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../actions.js';

registerNode({
  type: 'action_send_webhook',
  category: 'action',
  label: 'Send Webhook',
  description: 'Send an HTTP webhook request',
  icon: 'mdiWebhook',
  color: '#059669',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    { key: 'url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://example.com/webhook' },
    { key: 'secret', label: 'Secret', type: 'text', placeholder: 'HMAC signing secret (optional)' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'send_webhook', config } };
    }

    const actionConfig = {
      type: 'webhook' as const,
      url: config.url,
      secret: config.secret,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
