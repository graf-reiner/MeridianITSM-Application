import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { evaluateCondition } from '../../../conditions.js';

registerNode({
  type: 'condition_group',
  category: 'condition',
  label: 'Condition Group',
  description: 'Evaluate multiple conditions with AND/OR logic',
  icon: 'mdiCodeBraces',
  color: '#8b5cf6',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [
    { id: 'true', label: 'True', type: 'true' },
    { id: 'false', label: 'False', type: 'false' },
  ],
  configSchema: [
    {
      key: 'conditions',
      label: 'Conditions (JSON)',
      type: 'json',
      required: true,
      helpText: 'Array of {field, operator, value} objects',
    },
    {
      key: 'logic',
      label: 'Logic',
      type: 'select',
      options: [
        { label: 'All must match (AND)', value: 'and' },
        { label: 'Any must match (OR)', value: 'or' },
      ],
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    const logic = (config.logic as string) ?? 'and';

    let conditions: Array<{ field: string; operator: string; value: unknown }>;
    try {
      conditions = typeof config.conditions === 'string'
        ? JSON.parse(config.conditions)
        : (config.conditions as Array<{ field: string; operator: string; value: unknown }>);
    } catch {
      return { success: false, error: 'Invalid conditions JSON' };
    }

    if (!Array.isArray(conditions) || conditions.length === 0) {
      return { success: false, error: 'Conditions must be a non-empty array' };
    }

    const results = conditions.map((c) => evaluateCondition(c, context.eventContext));

    const matched = logic === 'and'
      ? results.every(Boolean)
      : results.some(Boolean);

    return {
      success: true,
      nextPort: matched ? 'true' : 'false',
      output: { logic, conditionCount: conditions.length, results, matched },
    };
  },
});
