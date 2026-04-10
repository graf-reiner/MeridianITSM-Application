/**
 * Unified variable-template types shared between the API, the workers,
 * and the web client's variable picker UI.
 *
 * The goal: one `{{variable.path}}` syntax, one registry, one renderer
 * — used by email templates, custom forms, notification rules, workflow
 * actions, canned responses, ticket templates, and recurring tickets.
 */

/**
 * A single template variable the UI can offer in the picker and the
 * renderer can resolve from a context object.
 *
 * `key` is the dotted path that appears inside `{{...}}` — e.g.
 * `"ticket.number"`. It must match a path in the runtime context object
 * passed to `renderTemplate()`.
 */
export interface VariableDefinition {
  /** Dotted path used inside `{{...}}` — e.g. "ticket.number". */
  key: string;
  /** Short human label shown as the picker row title. */
  label: string;
  /** One-line description shown under the label in the picker. */
  description: string;
  /** Example rendered value shown as placeholder text. */
  example: string;
  /** Group heading in the picker (e.g. "Ticket", "Form", "Requester"). */
  category: string;
}

/**
 * Catalog keys identifying which variable groups a given template field
 * wants to expose in its picker. A field can merge several catalogs
 * (e.g. an email body exposes `ticket + requester + tenant`).
 *
 * `formFields` is special — it indicates the UI should inject dynamically
 * built variables from the current form's field list (see
 * `getFormFieldVariables()` in form-fields.ts).
 */
export type VariableContextKey =
  | 'ticket'
  | 'requester'
  | 'assignee'
  | 'tenant'
  | 'form'
  | 'submission'
  | 'formFields'
  | 'sla'
  | 'change'
  | 'comment'
  | 'now';

/**
 * Options for `renderTemplate()`.
 */
export interface RenderTemplateOptions {
  /** String used when a `{{path}}` has no value in the context. Default: `""`. */
  fallback?: string;
  /** When true, rendered values are HTML-escaped (for HTML email bodies). */
  escapeHtml?: boolean;
}
