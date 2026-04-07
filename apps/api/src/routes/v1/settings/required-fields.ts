import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';

/**
 * Required Fields Per Ticket Type — tenant-configurable validation rules.
 *
 * Stored in Tenant.settings.requiredFields as:
 * {
 *   INCIDENT: ["impact", "urgency"],
 *   SERVICE_REQUEST: ["categoryId"],
 *   PROBLEM: ["impact", "urgency", "description"]
 * }
 *
 * GET  /api/v1/settings/required-fields  — Get current required fields config
 * PUT  /api/v1/settings/required-fields  — Update required fields config
 */
export async function requiredFieldsRoutes(fastify: FastifyInstance): Promise<void> {

  const VALID_FIELDS = [
    'description', 'impact', 'urgency', 'categoryId', 'queueId',
    'assignedToId', 'assignedGroupId', 'slaId', 'priority',
  ];

  const VALID_TYPES = ['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM'];

  fastify.get('/api/v1/settings/required-fields', async (request, reply) => {
    const user = request.user as { tenantId: string };

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { settings: true },
    });

    const settings = tenant?.settings as Record<string, unknown> | null;
    const requiredFields = settings?.requiredFields ?? {};

    return reply.status(200).send(requiredFields);
  });

  fastify.put('/api/v1/settings/required-fields', async (request, reply) => {
    const user = request.user as { tenantId: string; roles: string[] };
    const body = request.body as Record<string, string[]>;

    // Only admins can configure
    const isAdmin = user.roles.includes('admin') || user.roles.includes('msp_admin');
    if (!isAdmin) {
      return reply.status(403).send({ error: 'Only admins can configure required fields' });
    }

    // Validate input
    for (const [type, fields] of Object.entries(body)) {
      if (!VALID_TYPES.includes(type)) {
        return reply.status(400).send({ error: `Invalid ticket type: ${type}` });
      }
      if (!Array.isArray(fields)) {
        return reply.status(400).send({ error: `Fields for ${type} must be an array` });
      }
      for (const field of fields) {
        if (!VALID_FIELDS.includes(field)) {
          return reply.status(400).send({ error: `Invalid field: ${field}. Valid fields: ${VALID_FIELDS.join(', ')}` });
        }
      }
    }

    // Merge into existing tenant settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { settings: true },
    });

    const currentSettings = (tenant?.settings as Record<string, unknown> | null) ?? {};

    await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        settings: {
          ...currentSettings,
          requiredFields: body,
        },
      },
    });

    return reply.status(200).send({ success: true, requiredFields: body });
  });
}
