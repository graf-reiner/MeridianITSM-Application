import { registerNode } from '../../node-registry.js';
import type { ExecutionContext, NodeResult } from '../../types.js';
import { evaluateCondition } from '../../../conditions.js';

registerNode({
  type: 'condition_form_field',
  category: 'condition',
  label: 'Form Field Condition',
  description: 'Check a value submitted through a custom form',
  icon: 'mdiFormSelect',
  color: '#0d9488',
  inputs: [{ id: 'in', label: 'Input', type: 'default' }],
  outputs: [
    { id: 'true', label: 'True', type: 'true' },
    { id: 'false', label: 'False', type: 'false' },
  ],
  configSchema: [
    {
      key: 'formId',
      label: 'Custom Form',
      type: 'entity_select',
      required: true,
      helpText: 'endpoint:/api/v1/custom-forms',
    },
    {
      key: 'fieldKey',
      label: 'Form Field',
      type: 'dynamic_select',
      required: true,
      helpText: 'dependsOn:formId',
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
        { label: 'Is Not Empty', value: 'is_not_empty' },
        { label: 'Is Empty', value: 'is_empty' },
      ],
    },
    {
      key: 'value',
      label: 'Value',
      type: 'dynamic_select',
      required: false,
      helpText: 'dependsOn:fieldKey',
    },
  ],
  execute: async (config: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> => {
    const customFields = ((context.eventContext.ticket as any)?.customFields ?? {}) as Record<string, unknown>;
    const fieldValue = customFields[config.fieldKey as string];

    // If a specific form is selected, verify the ticket was created by that form
    if (config.formId && customFields.__formId !== config.formId) {
      return { success: true, nextPort: 'false', output: { matched: false, reason: 'different_form' } };
    }

    const matched = evaluateCondition(
      { field: `customFields.${config.fieldKey}`, operator: config.operator as string, value: config.value },
      context.eventContext as any,
    );

    return {
      success: true,
      nextPort: matched ? 'true' : 'false',
      output: {
        formId: config.formId,
        fieldKey: config.fieldKey,
        fieldValue,
        operator: config.operator,
        expectedValue: config.value,
        matched,
      },
    };
  },
});
