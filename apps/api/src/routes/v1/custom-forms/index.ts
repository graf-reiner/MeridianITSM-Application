import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { createTicket } from '../../../services/ticket.service.js';
import { renderFormTemplate } from '../../../services/custom-form.service.js';

// ─── Helper: Generate URL-friendly slug from name ───────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// ─── Helper: Evaluate conditional visibility rules ──────────────────────────

function evaluateFormConditions(
  conditions: Array<{
    targetFieldId: string;
    parentFieldId: string;
    operator: string;
    value: unknown;
    action: string;
  }>,
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

// Template interpolation is owned by custom-form.service (renderFormTemplate);
// we import it above and build the context in-place at each submission site.

// ─── Layout type helpers ────────────────────────────────────────────────────

interface FieldInstance {
  id: string;
  fieldDefinitionId: string;
  position: number;
  overrides?: {
    label?: string;
    placeholder?: string;
    helpText?: string;
    isRequired?: boolean;
  };
}

interface LayoutSection {
  id: string;
  title: string;
  position: number;
  fields: FieldInstance[];
}

interface LayoutJson {
  sections: LayoutSection[];
}

/**
 * Custom Forms REST API routes.
 *
 * Admin routes:
 *   GET    /api/v1/custom-forms                        - List all forms for tenant
 *   GET    /api/v1/custom-forms/:id                    - Get form detail
 *   POST   /api/v1/custom-forms                        - Create new form (DRAFT)
 *   PATCH  /api/v1/custom-forms/:id                    - Update form
 *   DELETE /api/v1/custom-forms/:id                    - Archive form
 *   POST   /api/v1/custom-forms/:id/publish            - Publish form
 *   POST   /api/v1/custom-forms/:id/unpublish          - Unpublish form
 *   POST   /api/v1/custom-forms/:id/clone              - Clone form
 *   GET    /api/v1/custom-forms/:id/submissions        - Submission history
 *
 * Portal/public routes:
 *   GET    /api/v1/custom-forms/published               - List published portal forms
 *   GET    /api/v1/custom-forms/published/:slug         - Get published form by slug
 *   POST   /api/v1/custom-forms/published/:slug/submit  - Submit form and create ticket
 */
export async function customFormRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // ═══════════════════════════════════════════════════════════════════════════
  // PORTAL / PUBLIC ROUTES (registered first so :id doesn't capture "published")
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET published forms for portal ─────────────────────────────────────

  fastify.get(
    '/api/v1/custom-forms/published',
    async (request, reply) => {
      const user = request.user as { tenantId: string };

      const forms = await prisma.customForm.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'PUBLISHED',
          showInPortal: true,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          icon: true,
          color: true,
          ticketType: true,
        },
        orderBy: { position: 'asc' },
      });

      return reply.status(200).send(forms);
    },
  );

  // ─── GET published form by slug for rendering ───────────────────────────

  fastify.get(
    '/api/v1/custom-forms/published/:slug',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { slug } = request.params as { slug: string };

      const form = await prisma.customForm.findFirst({
        where: {
          tenantId: user.tenantId,
          slug,
          status: 'PUBLISHED',
        },
      });

      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const layout = form.layoutJson as unknown as LayoutJson;
      const conditions = form.conditionsJson as Array<{
        targetFieldId: string;
        parentFieldId: string;
        operator: string;
        value: unknown;
        action: string;
      }>;

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
          tenantId: user.tenantId,
        },
      });

      const fieldDefMap = new Map(fieldDefs.map((fd) => [fd.id, fd]));

      // Merge definitions with per-instance overrides
      const resolvedSections = (layout.sections ?? []).map((section) => ({
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

      return reply.status(200).send({
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        icon: form.icon,
        color: form.color,
        ticketType: form.ticketType,
        requireAuth: form.requireAuth,
        sections: resolvedSections,
        conditions,
      });
    },
  );

  // ─── POST submit form and create ticket ─────────────────────────────────

  fastify.post(
    '/api/v1/custom-forms/published/:slug/submit',
    async (request, reply) => {
      const user = request.user as { userId: string; tenantId: string };
      const { slug } = request.params as { slug: string };
      const body = request.body as { values: Record<string, unknown> };

      if (!body.values || typeof body.values !== 'object') {
        return reply
          .status(400)
          .send({ error: 'values object is required' });
      }

      // (a) Load published form
      const form = await prisma.customForm.findFirst({
        where: {
          tenantId: user.tenantId,
          slug,
          status: 'PUBLISHED',
        },
      });

      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const layout = form.layoutJson as unknown as LayoutJson;
      const mapping = (form.mappingJson ?? {}) as Record<string, string>;
      const conditions = (form.conditionsJson ?? []) as Array<{
        targetFieldId: string;
        parentFieldId: string;
        operator: string;
        value: unknown;
        action: string;
      }>;

      // (b) Load field definitions
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
          tenantId: user.tenantId,
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

      // (c) Parse submitted values
      const values = body.values;

      // (d) Evaluate conditions to determine visible fields
      const hiddenFields = evaluateFormConditions(conditions, values);

      // (e) Validate each visible field
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

      if (errors.length > 0) {
        return reply.status(400).send({ error: 'Validation failed', errors });
      }

      // (f) Build ticket data
      // Build fieldValues lookup for templates
      const fieldValues: Record<
        string,
        { label: string; value: unknown }
      > = {};
      for (const [instanceId, fieldInfo] of fieldInstanceMap) {
        fieldValues[instanceId] = {
          label: fieldInfo.label,
          value: values[instanceId],
        };
      }

      // Unified template context — see custom-form.service.renderFormTemplate
      // for how it's consumed. Paths exposed: field.<key>, form.*, submission.*
      const fieldContext: Record<string, unknown> = {};
      for (const [instanceId, info] of fieldInstanceMap) {
        if (info.def.key) fieldContext[info.def.key] = values[instanceId];
      }
      const templateContext = {
        field: fieldContext,
        form: { name: form.name, slug: form.slug },
        submission: {
          date: new Date().toISOString().slice(0, 10),
          submitterEmail: null as string | null,
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

      // Collect ALL field values into customFields keyed by field key (stable identifier)
      // Also store form metadata so workflows can identify which form created the ticket
      const customFields: Record<string, unknown> = {
        __formId: form.id,
        __formSlug: form.slug,
        __formName: form.name,
      };
      for (const [instanceId, fieldInfo] of fieldInstanceMap) {
        if (hiddenFields.has(instanceId)) continue;
        const val = values[instanceId];
        if (val !== null && val !== undefined && val !== '') {
          customFields[fieldInfo.def.key] = val;
        }
      }

      const ticketData = {
        title,
        description,
        customFields,
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
      for (const key of Object.keys(ticketData) as Array<
        keyof typeof ticketData
      >) {
        if (ticketData[key] === undefined || ticketData[key] === '') {
          delete ticketData[key];
        }
      }

      // Ensure title is always present
      if (!ticketData.title) {
        ticketData.title = `${form.name} submission`;
      }

      try {
        // (g) Create ticket via service
        const ticket = await createTicket(
          user.tenantId,
          ticketData,
          user.userId,
        );

        // (h) Create submission record
        const submission = await prisma.customFormSubmission.create({
          data: {
            tenantId: user.tenantId,
            formId: form.id,
            formVersion: form.currentVersion,
            ticketId: ticket.id,
            submittedById: user.userId,
            valuesJson: values as any,
            layoutSnapshot: form.layoutJson as any,
            status: 'COMPLETED',
          },
        });

        // (i) Return result
        return reply.status(201).send({
          submissionId: submission.id,
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
        });
      } catch (err) {
        // Record failed submission
        await prisma.customFormSubmission.create({
          data: {
            tenantId: user.tenantId,
            formId: form.id,
            formVersion: form.currentVersion,
            submittedById: user.userId,
            valuesJson: values as any,
            layoutSnapshot: form.layoutJson as any,
            status: 'FAILED',
            errorMessage:
              err instanceof Error ? err.message : 'Unknown error',
          },
        });

        throw err;
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── GET list all forms for tenant ──────────────────────────────────────

  fastify.get('/api/v1/custom-forms', async (request, reply) => {
    const user = request.user as { tenantId: string };

    const forms = await prisma.customForm.findMany({
      where: { tenantId: user.tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { submissions: true } },
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    return reply.status(200).send(forms);
  });

  // ─── GET form detail ────────────────────────────────────────────────────

  fastify.get('/api/v1/custom-forms/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const form = await prisma.customForm.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        tenant: {
          select: { slug: true },
        },
        _count: { select: { submissions: true } },
      },
    });

    if (!form) {
      return reply.status(404).send({ error: 'Form not found' });
    }

    return reply.status(200).send(form);
  });

  // ─── POST create form ──────────────────────────────────────────────────

  fastify.post('/api/v1/custom-forms', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      name: string;
      slug?: string;
      description?: string;
      icon?: string;
      color?: string;
      ticketType?: string;
      layoutJson?: unknown;
      defaultPriority?: string;
      defaultCategoryId?: string;
      defaultQueueId?: string;
      defaultAssigneeId?: string;
      defaultGroupId?: string;
      defaultSlaId?: string;
      defaultTags?: string[];
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const slug = body.slug || generateSlug(body.name);

    // Validate slug uniqueness within tenant
    const existing = await prisma.customForm.findFirst({
      where: { tenantId: user.tenantId, slug },
    });
    if (existing) {
      return reply
        .status(409)
        .send({ error: `A form with slug "${slug}" already exists` });
    }

    const maxPos = await prisma.customForm.aggregate({
      where: { tenantId: user.tenantId },
      _max: { position: true },
    });

    const form = await prisma.customForm.create({
      data: {
        tenantId: user.tenantId,
        createdById: user.userId,
        name: body.name,
        slug,
        description: body.description ?? null,
        icon: body.icon ?? null,
        color: body.color ?? null,
        ticketType: (body.ticketType as any) ?? 'SERVICE_REQUEST',
        layoutJson: (body.layoutJson as any) ?? { sections: [] },
        status: 'DRAFT',
        defaultPriority: (body.defaultPriority as any) ?? null,
        defaultCategoryId: body.defaultCategoryId ?? null,
        defaultQueueId: body.defaultQueueId ?? null,
        defaultAssigneeId: body.defaultAssigneeId ?? null,
        defaultGroupId: body.defaultGroupId ?? null,
        defaultSlaId: body.defaultSlaId ?? null,
        defaultTags: body.defaultTags ?? [],
        position: (maxPos._max.position ?? 0) + 1,
      },
    });

    return reply.status(201).send(form);
  });

  // ─── PATCH update form ──────────────────────────────────────────────────

  fastify.patch('/api/v1/custom-forms/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.customForm.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Form not found' });
    }

    // Validate slug uniqueness if slug is being changed
    if (body.slug && body.slug !== existing.slug) {
      const slugConflict = await prisma.customForm.findFirst({
        where: {
          tenantId: user.tenantId,
          slug: body.slug as string,
          id: { not: id },
        },
      });
      if (slugConflict) {
        return reply
          .status(409)
          .send({
            error: `A form with slug "${body.slug}" already exists`,
          });
      }
    }

    const allowedFields = [
      'name',
      'slug',
      'description',
      'icon',
      'color',
      'layoutJson',
      'mappingJson',
      'conditionsJson',
      'ticketType',
      'defaultPriority',
      'defaultCategoryId',
      'defaultQueueId',
      'defaultAssigneeId',
      'defaultGroupId',
      'defaultSlaId',
      'defaultTags',
      'titleTemplate',
      'descriptionTemplate',
      'showInPortal',
      'requireAuth',
      'position',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // defaultTags is a String[] and cannot be null — coerce to empty array
    if (updates.defaultTags === null) updates.defaultTags = [];

    const form = await prisma.customForm.update({
      where: { id },
      data: updates as any,
    });

    return reply.status(200).send(form);
  });

  // ─── DELETE (archive) form ──────────────────────────────────────────────

  fastify.delete('/api/v1/custom-forms/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.customForm.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) {
      return reply.status(404).send({ error: 'Form not found' });
    }

    await prisma.customForm.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return reply.status(204).send();
  });

  // ─── POST publish form ──────────────────────────────────────────────────

  fastify.post(
    '/api/v1/custom-forms/:id/publish',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      const form = await prisma.customForm.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Validate layout has at least one section with at least one field
      const layout = form.layoutJson as unknown as LayoutJson;
      const hasFields = (layout.sections ?? []).some(
        (s) => (s.fields ?? []).length > 0,
      );
      if (!hasFields) {
        return reply.status(400).send({
          error:
            'Form must have at least one section with at least one field before publishing',
        });
      }

      const updated = await prisma.customForm.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          currentVersion: { increment: 1 },
          publishedAt: new Date(),
        },
      });

      return reply.status(200).send(updated);
    },
  );

  // ─── POST unpublish form ────────────────────────────────────────────────

  fastify.post(
    '/api/v1/custom-forms/:id/unpublish',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      const form = await prisma.customForm.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const updated = await prisma.customForm.update({
        where: { id },
        data: { status: 'DRAFT' },
      });

      return reply.status(200).send(updated);
    },
  );

  // ─── POST clone form ───────────────────────────────────────────────────

  fastify.post(
    '/api/v1/custom-forms/:id/clone',
    async (request, reply) => {
      const user = request.user as { userId: string; tenantId: string };
      const { id } = request.params as { id: string };

      const original = await prisma.customForm.findFirst({
        where: { id, tenantId: user.tenantId },
      });
      if (!original) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Generate unique slug for clone
      let cloneSlug = `${original.slug}-copy`;
      let suffix = 1;
      while (
        await prisma.customForm.findFirst({
          where: { tenantId: user.tenantId, slug: cloneSlug },
        })
      ) {
        suffix++;
        cloneSlug = `${original.slug}-copy-${suffix}`;
      }

      const maxPos = await prisma.customForm.aggregate({
        where: { tenantId: user.tenantId },
        _max: { position: true },
      });

      const clone = await prisma.customForm.create({
        data: {
          tenantId: user.tenantId,
          createdById: user.userId,
          name: `${original.name} (Copy)`,
          slug: cloneSlug,
          description: original.description,
          icon: original.icon,
          color: original.color,
          ticketType: original.ticketType,
          layoutJson: original.layoutJson ?? { sections: [] },
          mappingJson: original.mappingJson ?? {},
          conditionsJson: original.conditionsJson ?? [],
          status: 'DRAFT',
          defaultPriority: original.defaultPriority,
          defaultCategoryId: original.defaultCategoryId,
          defaultQueueId: original.defaultQueueId,
          defaultAssigneeId: original.defaultAssigneeId,
          defaultGroupId: original.defaultGroupId,
          defaultSlaId: original.defaultSlaId,
          defaultTags: original.defaultTags,
          titleTemplate: original.titleTemplate,
          descriptionTemplate: original.descriptionTemplate,
          showInPortal: original.showInPortal,
          requireAuth: original.requireAuth,
          position: (maxPos._max.position ?? 0) + 1,
        },
      });

      return reply.status(201).send(clone);
    },
  );

  // ─── GET form submissions ──────────────────────────────────────────────

  fastify.get(
    '/api/v1/custom-forms/:id/submissions',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      const query = request.query as {
        page?: string;
        pageSize?: string;
      };

      // Verify form exists and belongs to tenant
      const form = await prisma.customForm.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20),
      );
      const skip = (page - 1) * pageSize;

      const [submissions, total] = await Promise.all([
        prisma.customFormSubmission.findMany({
          where: { formId: id, tenantId: user.tenantId },
          include: {
            submittedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            ticket: {
              select: { id: true, ticketNumber: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.customFormSubmission.count({
          where: { formId: id, tenantId: user.tenantId },
        }),
      ]);

      return reply.status(200).send({
        data: submissions,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    },
  );

  // ─── GET form field definitions (for workflow builder) ──────────────────

  fastify.get(
    '/api/v1/custom-forms/:id/fields',
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { id } = request.params as { id: string };

      const form = await prisma.customForm.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { layoutJson: true, tenantId: true },
      });

      if (!form) return reply.status(404).send({ error: 'Form not found' });

      const layout = form.layoutJson as any;
      const sections = layout?.sections ?? (Array.isArray(layout) ? layout : []);

      // Collect all field definition IDs from the layout
      const fieldDefIds: string[] = [];
      for (const section of sections) {
        for (const field of section.fields ?? []) {
          fieldDefIds.push(field.fieldDefinitionId);
        }
      }

      // Load field definitions
      const fieldDefs = await prisma.fieldDefinition.findMany({
        where: { id: { in: fieldDefIds }, tenantId: user.tenantId },
        select: { id: true, key: true, label: true, fieldType: true, optionsJson: true },
      });

      const fieldDefMap = new Map(fieldDefs.map(fd => [fd.id, fd]));

      // Build the fields list with overrides applied
      const fields: Array<{
        key: string;
        label: string;
        fieldType: string;
        options?: Array<{ label: string; value: string }>;
      }> = [];
      const seenKeys = new Set<string>();

      for (const section of sections) {
        for (const fieldInstance of section.fields ?? []) {
          const def = fieldDefMap.get(fieldInstance.fieldDefinitionId);
          if (!def || seenKeys.has(def.key)) continue;
          seenKeys.add(def.key);

          const overrides = fieldInstance.overrides ?? fieldInstance;
          const entry: (typeof fields)[number] = {
            key: def.key,
            label: overrides.labelOverride ?? overrides.label ?? def.label,
            fieldType: def.fieldType,
          };

          if (def.optionsJson && Array.isArray(def.optionsJson)) {
            entry.options = def.optionsJson as Array<{ label: string; value: string }>;
          }

          fields.push(entry);
        }
      }

      return reply.status(200).send(fields);
    },
  );
}
