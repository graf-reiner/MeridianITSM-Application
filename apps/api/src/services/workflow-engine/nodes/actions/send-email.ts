import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../notification-rules-actions.js';

registerNode({
  type: 'action_send_email',
  category: 'action',
  label: 'Send Email',
  description: 'Send an email notification',
  icon: 'mdiEmail',
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
    { key: 'emails', label: 'Additional Emails', type: 'text', placeholder: 'comma-separated' },
    { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Ticket {{ticketNumber}}: {{ticketTitle}}' },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Email body with {{variables}}' },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'send_email', config } };
    }

    const actionConfig = {
      type: 'email' as const,
      recipients: config.recipients,
      emails: config.emails,
      subject: config.subject,
      body: config.body,
      templateName: config.templateName,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
