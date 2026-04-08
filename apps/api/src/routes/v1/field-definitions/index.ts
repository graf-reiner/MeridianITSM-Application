import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Field Definition (Reusable Field Library) REST API routes.
 *
 * GET    /api/v1/field-definitions          — List fields (with search/filter)
 * GET    /api/v1/field-definitions/:id      — Get field detail
 * POST   /api/v1/field-definitions          — Create field
 * PATCH  /api/v1/field-definitions/:id      — Update field (increments version)
 * DELETE /api/v1/field-definitions/:id      — Archive field
 * GET    /api/v1/field-definitions/:id/usage — List forms using this field
 */
export async function fieldDefinitionRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET list fields ──────────────────────────────────────────────────────

  fastify.get('/api/v1/field-definitions', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const query = request.query as { status?: string; search?: string; fieldType?: string };

    const where: Record<string, unknown> = { tenantId: user.tenantId };
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }
    if (query.fieldType) {
      where.fieldType = query.fieldType;
    }
    if (query.search) {
      where.OR = [
        { label: { contains: query.search, mode: 'insensitive' } },
        { key: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const fields = await prisma.fieldDefinition.findMany({
      where: where as any,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ label: 'asc' }],
    });

    return reply.status(200).send(fields);
  });

  // ─── GET field detail ─────────────────────────────────────────────────────

  fastify.get('/api/v1/field-definitions/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const field = await prisma.fieldDefinition.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!field) return reply.status(404).send({ error: 'Field definition not found' });
    return reply.status(200).send(field);
  });

  // ─── POST create field ────────────────────────────────────────────────────

  fastify.post('/api/v1/field-definitions', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string };
    const body = request.body as {
      key: string;
      label: string;
      fieldType: string;
      description?: string;
      placeholder?: string;
      helpText?: string;
      isRequired?: boolean;
      isReadOnly?: boolean;
      validationConfig?: unknown;
      optionsJson?: unknown;
    };

    if (!body.key || !body.label || !body.fieldType) {
      return reply.status(400).send({ error: 'key, label, and fieldType are required' });
    }

    // Validate key format (alphanumeric + underscores)
    if (!/^[a-z][a-z0-9_]*$/.test(body.key)) {
      return reply.status(400).send({ error: 'key must be lowercase alphanumeric with underscores, starting with a letter' });
    }

    // Check for duplicate key within tenant
    const existing = await prisma.fieldDefinition.findFirst({
      where: { tenantId: user.tenantId, key: body.key },
    });
    if (existing) {
      return reply.status(409).send({ error: `Field with key "${body.key}" already exists` });
    }

    const VALID_FIELD_TYPES = [
      'text', 'textarea', 'richtext', 'number', 'select', 'multiselect',
      'radio', 'checkbox', 'date', 'datetime', 'email', 'phone', 'url',
      'file', 'user_picker', 'group_picker', 'hidden',
    ];
    if (!VALID_FIELD_TYPES.includes(body.fieldType)) {
      return reply.status(400).send({ error: `Invalid fieldType. Must be one of: ${VALID_FIELD_TYPES.join(', ')}` });
    }

    const field = await prisma.fieldDefinition.create({
      data: {
        tenantId: user.tenantId,
        key: body.key,
        label: body.label,
        fieldType: body.fieldType,
        description: body.description ?? null,
        placeholder: body.placeholder ?? null,
        helpText: body.helpText ?? null,
        isRequired: body.isRequired ?? false,
        isReadOnly: body.isReadOnly ?? false,
        validationConfig: body.validationConfig as any ?? null,
        optionsJson: body.optionsJson as any ?? null,
        createdById: user.userId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return reply.status(201).send(field);
  });

  // ─── PATCH update field ───────────────────────────────────────────────────

  fastify.patch('/api/v1/field-definitions/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.fieldDefinition.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Field definition not found' });

    const allowedFields = [
      'label', 'description', 'placeholder', 'helpText',
      'isRequired', 'isReadOnly', 'validationConfig', 'optionsJson', 'status',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Increment version on meaningful changes
    const meaningfulChanges = ['label', 'fieldType', 'isRequired', 'validationConfig', 'optionsJson'];
    const hasMeaningfulChange = meaningfulChanges.some(f => body[f] !== undefined);
    if (hasMeaningfulChange) {
      updates.version = existing.version + 1;
    }

    const field = await prisma.fieldDefinition.update({
      where: { id },
      data: updates,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return reply.status(200).send(field);
  });

  // ─── DELETE (archive) field ───────────────────────────────────────────────

  fastify.delete('/api/v1/field-definitions/:id', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.fieldDefinition.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Field definition not found' });

    await prisma.fieldDefinition.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    return reply.status(204).send();
  });

  // ─── GET field usage ──────────────────────────────────────────────────────

  fastify.get('/api/v1/field-definitions/:id/usage', async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const existing = await prisma.fieldDefinition.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) return reply.status(404).send({ error: 'Field definition not found' });

    // Search all custom forms that reference this field definition in their layoutJson
    const forms = await prisma.customForm.findMany({
      where: { tenantId: user.tenantId, status: { not: 'ARCHIVED' } },
      select: { id: true, name: true, slug: true, status: true, layoutJson: true },
    });

    const usedInForms = forms.filter(form => {
      const layout = form.layoutJson as { sections?: Array<{ fields?: Array<{ fieldDefinitionId?: string }> }> };
      return layout.sections?.some(section =>
        section.fields?.some(field => field.fieldDefinitionId === id)
      );
    }).map(({ layoutJson: _, ...rest }) => rest);

    return reply.status(200).send({ fieldId: id, usedIn: usedInForms });
  });
}
