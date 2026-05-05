import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { evaluateCondition, resolveFieldValue } from '../../../conditions.js';

registerNode({
  type: 'condition_field',
  category: 'condition',
  label: 'Field Condition',
  description: 'Evaluate a field against a value',
  icon: 'mdiCodeBraces',
  color: '#8b5cf6',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [
    { id: 'true', label: 'True', type: 'true' },
    { id: 'false', label: 'False', type: 'false' },
  ],
  configSchema: [
    {
      key: 'field',
      label: 'Field',
      type: 'select',
      required: true,
      options: [
        { label: 'Priority', value: 'priority' },
        { label: 'Status', value: 'status' },
        { label: 'Type', value: 'type' },
        { label: 'Queue', value: 'queue' },
        { label: 'Category', value: 'category' },
        { label: 'Assigned To', value: 'assignedTo' },
        { label: 'Assigned Group', value: 'assignedGroup' },
        { label: 'Source', value: 'source' },
        { label: 'SLA Status', value: 'slaStatus' },
        { label: 'SLA Percentage', value: 'slaPercentage' },
        { label: 'Event Origin Type', value: 'origin.type' },
      ],
    },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      required: true,
      options: [
        { label: 'Equals', value: 'equals' },
        { label: 'Not Equals', value: 'not_equals' },
        { label: 'Contains', value: 'contains' },
        { label: 'In List', value: 'in' },
        { label: 'Not In List', value: 'not_in' },
        { label: 'Greater Than', value: 'greater_than' },
        { label: 'Less Than', value: 'less_than' },
        { label: 'Is True', value: 'is_true' },
        { label: 'Is False', value: 'is_false' },
      ],
    },
    {
      key: 'value', label: 'Value', type: 'dynamic_select', required: true,
      helpText: 'dependsOn:field',
      options: [
        // These are shown when field=priority
        { label: 'Low', value: 'LOW' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'High', value: 'HIGH' },
        { label: 'Critical', value: 'CRITICAL' },
      ],
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    const field = config.field as string;
    const operator = config.operator as string;
    const value = config.value;

    const fieldValue = resolveFieldValue(field, context.eventContext);
    const matched = evaluateCondition({ field, operator, value }, context.eventContext);

    return {
      success: true,
      nextPort: matched ? 'true' : 'false',
      output: { field, operator, value, fieldValue, matched },
    };
  },
});
