export type {
  VariableDefinition,
  VariableContextKey,
  RenderTemplateOptions,
} from './types.js';

export { renderTemplate, extractTokens } from './render.js';

export {
  TICKET_VARIABLES,
  REQUESTER_VARIABLES,
  ASSIGNEE_VARIABLES,
  TENANT_VARIABLES,
  FORM_META_VARIABLES,
  SLA_VARIABLES,
  CHANGE_VARIABLES,
  COMMENT_VARIABLES,
  NOW_VARIABLES,
  CERT_VARIABLES,
  getVariablesForContext,
} from './registry.js';

export {
  getFormFieldVariables,
  buildFormFieldContext,
  type FormFieldLike,
} from './form-fields.js';
