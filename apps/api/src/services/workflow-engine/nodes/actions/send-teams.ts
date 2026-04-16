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
    {
      key: 'templateId',
      label: 'Template',
      type: 'template_ref',
      templateChannel: 'TEAMS',
      helpText: 'Optional — pick a saved template, or leave blank to type inline.',
      hidesKeys: ['title', 'body'],
    },
    { key: 'title', label: 'Title', type: 'text', placeholder: 'Type / to insert a variable', variableContext: ['ticket', 'requester', 'assignee', 'tenant', 'now'] },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Type / to insert a variable', variableContext: ['ticket', 'requester', 'assignee', 'tenant', 'now'] },
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
      templateId: config.templateId,
      // Inline fallback for Teams executor — combine title+body into a single
      // `message` string so the pre-existing executor path works when no template is set.
      message: config.title && config.body
        ? `${config.title as string}\n\n${config.body as string}`
        : (config.title ?? config.body),
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
