import type { VariableDefinition } from './types.js';

/**
 * Shape of a custom form field as needed by the variable registry.
 * Matches the relevant subset of `CustomFormField` joined to
 * `FieldDefinition` — the `fieldKey` is the stable slug from
 * `FieldDefinition.key`, NOT the volatile instance UUID.
 *
 * We take a minimal shape (not the raw Prisma type) so this module stays
 * zero-dependency and can be called from both API services and (via the
 * shared core package) from the web client.
 */
export interface FormFieldLike {
  /** Stable tenant-unique slug from FieldDefinition — e.g. "first_name". */
  fieldKey: string;
  /** Human label shown next to the input on the form. */
  label: string;
  /** Short helper text shown in the picker's description row. */
  helpText?: string | null;
  /** Field type from the form builder — determines the example value. */
  fieldType: string;
}

/**
 * Turns a form's fields into picker variables addressed as
 * `{{field.<fieldKey>}}`. Consumed by the form builder UI so the
 * template picker shows real, current field names for the form the
 * admin is editing.
 *
 * Output is deduplicated by `fieldKey` — if two instances of the same
 * field definition appear in one form (unusual but possible), only the
 * first is listed.
 */
export function getFormFieldVariables(
  fields: FormFieldLike[],
): VariableDefinition[] {
  const seen = new Set<string>();
  const out: VariableDefinition[] = [];
  for (const f of fields) {
    if (!f.fieldKey || seen.has(f.fieldKey)) continue;
    seen.add(f.fieldKey);
    out.push({
      key: `field.${f.fieldKey}`,
      label: f.label,
      description: f.helpText?.trim() || `Form field (${f.fieldType})`,
      example: exampleValueFor(f.fieldType),
      category: 'Form Fields',
    });
  }
  return out;
}

/**
 * Returns an illustrative example value for the picker's preview cell,
 * based on the form field's declared type.
 */
function exampleValueFor(fieldType: string): string {
  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'richtext':
      return 'Lorem ipsum...';
    case 'number':
      return '42';
    case 'email':
      return 'user@example.com';
    case 'phone':
      return '+1 555-0100';
    case 'url':
      return 'https://example.com';
    case 'date':
      return '2026-04-10';
    case 'datetime':
      return '2026-04-10T14:30';
    case 'select':
    case 'radio':
      return 'Option A';
    case 'multiselect':
    case 'checkbox':
      return 'Option A, Option B';
    case 'user_picker':
      return 'Alex Smith';
    case 'group_picker':
      return 'IT Support';
    case 'file':
      return 'document.pdf';
    default:
      return 'value';
  }
}

/**
 * Builds a runtime context object addressable by the template engine
 * from a form submission's raw values, keyed by the stable `fieldKey`.
 *
 * Pair this with `renderTemplate()` like:
 *
 *     const ctx = {
 *       field: buildFormFieldContext(fields, valuesByInstanceId),
 *       form: { name, slug },
 *       submission: { date, submitterEmail },
 *     };
 *     renderTemplate(form.descriptionTemplate, ctx)
 */
export function buildFormFieldContext(
  fields: Array<FormFieldLike & { instanceId: string }>,
  valuesByInstanceId: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.fieldKey) continue;
    const raw = valuesByInstanceId[f.instanceId];
    // If the raw value is wrapped `{ label, value }`, unwrap it.
    if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
      out[f.fieldKey] = (raw as { value: unknown }).value;
    } else {
      out[f.fieldKey] = raw;
    }
  }
  return out;
}
