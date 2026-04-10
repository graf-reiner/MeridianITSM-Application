import { prisma } from '@meridian/db';
import { renderTemplate } from '@meridian/core';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FieldInstance {
  id: string;
  instanceId?: string;
  fieldDefinitionId: string;
  position: number;
  overrides?: {
    label?: string;
    placeholder?: string;
    helpText?: string;
    isRequired?: boolean;
  };
}

export interface LayoutSection {
  id: string;
  title: string;
  position: number;
  fields: FieldInstance[];
}

export interface LayoutJson {
  sections: LayoutSection[];
}

export interface FormCondition {
  targetFieldId: string;
  parentFieldId: string;
  operator: string;
  value: unknown;
  action: string;
}

// ─── Helper: Evaluate conditional visibility rules ──────────────────────────

export function evaluateFormConditions(
  conditions: FormCondition[],
  values: Record<string, unknown>,
): Set<string> {
  const hiddenFields = new Set<string>();
  for (const cond of conditions) {
    const parentValue = values[cond.parentFieldId];
    let met = false;
    switch (cond.operator) {
      case 'equals':
        met = parentValue === cond.value;
        break;
      case 'not_equals':
        met = parentValue !== cond.value;
        break;
      case 'contains':
        met =
          typeof parentValue === 'string' &&
          parentValue.includes(String(cond.value));
        break;
      case 'in':
        met =
          Array.isArray(cond.value) &&
          (cond.value as unknown[]).includes(parentValue);
        break;
      case 'is_not_empty':
        met =
          parentValue !== null &&
          parentValue !== undefined &&
          parentValue !== '';
        break;
      case 'is_empty':
        met =
          parentValue === null ||
          parentValue === undefined ||
          parentValue === '';
        break;
    }
    if (cond.action === 'show' && !met) hiddenFields.add(cond.targetFieldId);
    if (cond.action === 'hide' && met) hiddenFields.add(cond.targetFieldId);
  }
  return hiddenFields;
}

// ─── Helper: Interpolate template strings with field values ─────────────────

/**
 * Legacy pre-pass: rewrites raw `{{<field-instance-uuid>}}` tokens
 * inline with their current submission value. Kept here so un-migrated
 * forms continue to render correctly while the one-shot
 * `migrate-form-templates.ts` script is rolled out across tenants.
 * After migration, templates use `{{field.<key>}}` which the shared
 * renderTemplate() handles natively — this pre-pass then becomes a no-op.
 */
function substituteLegacyUuidTokens(
  template: string,
  valuesByInstanceId: Record<string, unknown>,
): string {
  return template.replace(/\{\{([0-9a-f-]{36})\}\}/gi, (match, uuid: string) => {
    if (!(uuid in valuesByInstanceId)) return match; // leave unknown UUID alone
    const value = valuesByInstanceId[uuid];
    if (value === null || value === undefined) return '';
    return Array.isArray(value) ? value.join(', ') : String(value);
  });
}

/**
 * Renders a custom-form template string using the unified engine.
 * Accepts a fully-built context with `field.<key>`, `form.*`, and
 * `submission.*` paths, plus the raw values-by-instance-id map for the
 * legacy UUID pre-pass.
 */
export function renderFormTemplate(
  template: string,
  context: {
    field: Record<string, unknown>;
    form: { name: string; slug: string };
    submission: { date: string; submitterEmail: string | null };
  },
  valuesByInstanceId: Record<string, unknown>,
): string {
  const legacyReplaced = substituteLegacyUuidTokens(template, valuesByInstanceId);
  return renderTemplate(legacyReplaced, context as unknown as Record<string, unknown>);
}

/**
 * @deprecated Kept for backwards compatibility with callers that still
 * expect the old `{ [instanceId]: { label, value } }` shape. New code
 * should use `renderFormTemplate()`.
 */
export function interpolateTemplate(
  template: string,
  fieldValues: Record<string, { label: string; value: unknown }>,
): string {
  const rawValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fieldValues)) rawValues[k] = v.value;
  return substituteLegacyUuidTokens(template, rawValues);
}

// ─── Resolve form layout for rendering ──────────────────────────────────────

export async function resolveFormForRendering(
  form: {
    layoutJson: unknown;
    conditionsJson: unknown;
  },
  tenantId: string,
) {
  const layout = form.layoutJson as unknown as LayoutJson;
  const conditions = (form.conditionsJson ?? []) as FormCondition[];

  // Collect all fieldDefinitionIds from the layout
  const fieldDefIds: string[] = [];
  for (const section of layout.sections ?? []) {
    for (const field of section.fields ?? []) {
      fieldDefIds.push(field.fieldDefinitionId);
    }
  }

  // Load field definitions
  const fieldDefs = await prisma.fieldDefinition.findMany({
    where: {
      id: { in: fieldDefIds },
      tenantId,
    },
  });

  const fieldDefMap = new Map(fieldDefs.map((fd) => [fd.id, fd]));

  // Merge definitions with per-instance overrides
  const sections = (layout.sections ?? []).map((section) => ({
    ...section,
    fields: (section.fields ?? []).map((fieldInstance) => {
      const def = fieldDefMap.get(fieldInstance.fieldDefinitionId);
      const overrides = fieldInstance.overrides ?? {};
      return {
        instanceId: fieldInstance.instanceId ?? fieldInstance.id,
        fieldDefinitionId: fieldInstance.fieldDefinitionId,
        position: fieldInstance.position,
        key: def?.key ?? '',
        fieldType: def?.fieldType ?? 'text',
        label: overrides.label ?? def?.label ?? '',
        placeholder: overrides.placeholder ?? def?.placeholder ?? null,
        helpText: overrides.helpText ?? def?.helpText ?? null,
        isRequired: overrides.isRequired ?? def?.isRequired ?? false,
        isReadOnly: def?.isReadOnly ?? false,
        validationConfig: def?.validationConfig ?? null,
        optionsJson: def?.optionsJson ?? null,
      };
    }),
  }));

  return { sections, conditions };
}

// ─── Build ticket data from form submission ─────────────────────────────────

export async function buildTicketDataFromForm(
  form: {
    name: string;
    slug?: string;
    ticketType: string;
    layoutJson: unknown;
    mappingJson: unknown;
    conditionsJson: unknown;
    titleTemplate: string | null;
    descriptionTemplate: string | null;
    defaultPriority: string | null;
    defaultCategoryId: string | null;
    defaultQueueId: string | null;
    defaultAssigneeId: string | null;
    defaultGroupId: string | null;
    defaultSlaId: string | null;
    defaultTags: string[];
  },
  values: Record<string, unknown>,
  tenantId: string,
  submissionMeta?: {
    submitterEmail?: string | null;
  },
) {
  const layout = form.layoutJson as unknown as LayoutJson;
  const mapping = (form.mappingJson ?? {}) as Record<string, string>;
  const conditions = (form.conditionsJson ?? []) as FormCondition[];

  // Load field definitions
  const fieldDefIds: string[] = [];
  const allFieldInstances: FieldInstance[] = [];
  for (const section of layout.sections ?? []) {
    for (const field of section.fields ?? []) {
      fieldDefIds.push(field.fieldDefinitionId);
      allFieldInstances.push(field);
    }
  }

  const fieldDefs = await prisma.fieldDefinition.findMany({
    where: {
      id: { in: fieldDefIds },
      tenantId,
    },
  });
  const fieldDefMap = new Map(fieldDefs.map((fd) => [fd.id, fd]));

  // Build field instance map with resolved properties
  const fieldInstanceMap = new Map<
    string,
    {
      instanceId: string;
      def: (typeof fieldDefs)[0];
      label: string;
      isRequired: boolean;
      fieldType: string;
    }
  >();

  for (const fi of allFieldInstances) {
    const def = fieldDefMap.get(fi.fieldDefinitionId);
    if (!def) continue;
    const overrides = fi.overrides ?? {};
    fieldInstanceMap.set(fi.id, {
      instanceId: fi.id,
      def,
      label: overrides.label ?? def.label,
      isRequired: overrides.isRequired ?? def.isRequired,
      fieldType: def.fieldType,
    });
  }

  // Evaluate conditions to determine visible fields
  const hiddenFields = evaluateFormConditions(conditions, values);

  // Validate each visible field
  const errors: Array<{ fieldId: string; message: string }> = [];
  for (const [instanceId, fieldInfo] of fieldInstanceMap) {
    if (hiddenFields.has(instanceId)) continue;

    const value = values[instanceId];
    const isEmpty =
      value === null || value === undefined || value === '';

    if (fieldInfo.isRequired && isEmpty) {
      errors.push({
        fieldId: instanceId,
        message: `${fieldInfo.label} is required`,
      });
    }
  }

  // Build the unified template context addressed by `field.<key>`,
  // `form.*`, and `submission.*`. Stable field keys come from
  // FieldDefinition.key, NOT from the volatile instance UUIDs.
  const fieldContext: Record<string, unknown> = {};
  for (const [instanceId, info] of fieldInstanceMap) {
    if (info.def.key) fieldContext[info.def.key] = values[instanceId];
  }
  const templateContext = {
    field: fieldContext,
    form: { name: form.name, slug: form.slug ?? '' },
    submission: {
      date: new Date().toISOString().slice(0, 10),
      submitterEmail: submissionMeta?.submitterEmail ?? null,
    },
  };

  // Determine title
  let title: string | undefined;
  if (form.titleTemplate) {
    title = renderFormTemplate(form.titleTemplate, templateContext, values);
  } else if (mapping.title) {
    title = String(values[mapping.title] ?? '');
  } else {
    // Use first text field value as title
    for (const section of layout.sections ?? []) {
      for (const fi of section.fields ?? []) {
        const info = fieldInstanceMap.get(fi.id);
        if (
          info &&
          (info.fieldType === 'text' || info.fieldType === 'textarea') &&
          values[fi.id]
        ) {
          title = String(values[fi.id]);
          break;
        }
      }
      if (title) break;
    }
  }

  if (!title) {
    title = `${form.name} submission`;
  }

  // Determine description
  let description: string | undefined;
  if (form.descriptionTemplate) {
    description = renderFormTemplate(
      form.descriptionTemplate,
      templateContext,
      values,
    );
  } else if (mapping.description) {
    description = String(values[mapping.description] ?? '');
  } else {
    // Collect all field values into a summary
    const lines: string[] = [];
    for (const section of layout.sections ?? []) {
      for (const fi of section.fields ?? []) {
        if (hiddenFields.has(fi.id)) continue;
        const info = fieldInstanceMap.get(fi.id);
        if (!info) continue;
        const val = values[fi.id];
        if (val !== null && val !== undefined && val !== '') {
          lines.push(
            `**${info.label}:** ${Array.isArray(val) ? val.join(', ') : String(val)}`,
          );
        }
      }
    }
    description = lines.join('\n');
  }

  // Map priority from form value or use default
  const priorityValue = mapping.priority
    ? (String(values[mapping.priority] ?? '') as
        | 'LOW'
        | 'MEDIUM'
        | 'HIGH'
        | 'CRITICAL')
    : undefined;

  // Collect unmapped field values into customFields
  const mappedFieldIds = new Set(Object.values(mapping));
  const customFields: Record<string, unknown> = {};
  for (const [instanceId, fieldInfo] of fieldInstanceMap) {
    if (hiddenFields.has(instanceId)) continue;
    if (mappedFieldIds.has(instanceId)) continue;
    const val = values[instanceId];
    if (val !== null && val !== undefined && val !== '') {
      customFields[fieldInfo.label] = val;
    }
  }

  const ticketData: Record<string, unknown> = {
    title,
    description,
    type: form.ticketType as
      | 'INCIDENT'
      | 'SERVICE_REQUEST'
      | 'PROBLEM',
    priority:
      priorityValue || form.defaultPriority || undefined,
    categoryId: mapping.categoryId
      ? String(values[mapping.categoryId] ?? '')
      : form.defaultCategoryId || undefined,
    queueId: form.defaultQueueId || undefined,
    assignedToId: form.defaultAssigneeId || undefined,
    assignedGroupId: form.defaultGroupId || undefined,
    slaId: form.defaultSlaId || undefined,
    tags: form.defaultTags.length > 0 ? form.defaultTags : undefined,
    source: `Custom Form - ${form.name}`,
  };

  // Clean up undefined optional fields
  for (const key of Object.keys(ticketData)) {
    if (ticketData[key] === undefined || ticketData[key] === '') {
      delete ticketData[key];
    }
  }

  // Ensure title is always present
  if (!ticketData.title) {
    ticketData.title = `${form.name} submission`;
  }

  return { ticketData, errors, hiddenFields, fieldInstanceMap };
}
