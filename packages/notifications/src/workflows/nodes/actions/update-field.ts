import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { executeActions } from '../../../actions.js';

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
    {
      key: 'field', label: 'Field', type: 'select', required: true,
      options: [
        { label: 'Title', value: 'title' },
        { label: 'Description', value: 'description' },
        { label: 'Priority', value: 'priority' },
        { label: 'Status', value: 'status' },
        { label: 'Type', value: 'type' },
        { label: 'Impact', value: 'impact' },
        { label: 'Urgency', value: 'urgency' },
        { label: 'Resolution', value: 'resolution' },
        { label: 'Source', value: 'source' },
        { label: 'Tags', value: 'tags' },
      ],
    },
    {
      key: 'value', label: 'Value', type: 'dynamic_select', required: true,
      helpText: 'dependsOn:field',
      options: [],
    },
    {
      key: 'mode', label: 'Update Mode', type: 'select',
      helpText: 'For text fields (description, resolution): replace the entire value or append to it',
      options: [
        { label: 'Replace (overwrite)', value: 'replace' },
        { label: 'Append (add to existing)', value: 'append' },
      ],
      defaultValue: 'replace',
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    if (context.isSimulation) {
      return { success: true, output: { simulated: true, action: 'update_field', config } };
    }

    const field = config.field as string;
    let value = config.value as string;
    const mode = (config.mode as string) ?? 'replace';

    // Handle append mode for text fields
    if (mode === 'append' && ['description', 'resolution', 'title'].includes(field)) {
      const ticketId = context.eventContext.ticket?.id;
      if (ticketId) {
        const { prisma } = await import('@meridian/db');
        const ticket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { [field]: true },
        });
        const existing = (ticket as Record<string, unknown>)?.[field] as string ?? '';
        value = existing ? `${existing}\n\n${value}` : value;
      }
    }

    const actionConfig = {
      type: 'update_field' as const,
      field,
      value,
    };

    const [result] = await executeActions([actionConfig as any], context.eventContext, context.tenantId);
    return { success: result?.success ?? false, output: result as any, error: result?.error };
  },
});
