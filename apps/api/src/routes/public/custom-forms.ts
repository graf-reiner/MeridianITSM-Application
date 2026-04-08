import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { createTicket } from '../../services/ticket.service.js';
import { resolveFormForRendering, buildTicketDataFromForm } from '../../services/custom-form.service.js';
import { findOrCreateAnonymousUser } from '../../services/anonymous-user.service.js';

/**
 * Public custom form routes — no authentication required.
 *
 * These routes allow anonymous users to view and submit published forms
 * that have requireAuth set to false.
 *
 *   GET  /api/v1/public/forms/:formId                    - Get published form by ID
 *   GET  /api/v1/public/forms/by-slug/:tenantSlug/:formSlug - Get published form by tenant+form slug
 *   POST /api/v1/public/forms/:formId/submit              - Submit form anonymously
 */
export async function publicFormRoutes(
  fastify: FastifyInstance,
): Promise<void> {

  // ─── GET resolve subdomain to tenant slug ───────────────────────────────────

  fastify.get(
    '/api/v1/public/resolve-subdomain/:subdomain',
    async (request, reply) => {
      const { subdomain } = request.params as { subdomain: string };

      const tenant = await prisma.tenant.findFirst({
        where: { subdomain, status: 'ACTIVE' },
        select: { id: true, name: true, slug: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      return reply.status(200).send({
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      });
    },
  );

  // ─── GET published form by ID ──────────────────────────────────────────────

  fastify.get(
    '/api/v1/public/forms/:formId',
    async (request, reply) => {
      const { formId } = request.params as { formId: string };

      // Load published form
      const form = await prisma.customForm.findFirst({
        where: { id: formId, status: 'PUBLISHED' },
      });

      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Only allow public access to forms that do not require authentication
      if (form.requireAuth) {
        return reply
          .status(403)
          .send({ error: 'This form requires authentication' });
      }

      // Verify tenant is active
      const tenant = await prisma.tenant.findFirst({
        where: { id: form.tenantId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Resolve layout with field definitions
      const { sections, conditions } = await resolveFormForRendering(
        form,
        form.tenantId,
      );

      return reply.status(200).send({
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        icon: form.icon,
        color: form.color,
        ticketType: form.ticketType,
        requireAuth: form.requireAuth,
        sections,
        conditions,
      });
    },
  );

  // ─── GET published form by tenant slug + form slug ─────────────────────────

  fastify.get(
    '/api/v1/public/forms/by-slug/:tenantSlug/:formSlug',
    async (request, reply) => {
      const { tenantSlug, formSlug } = request.params as {
        tenantSlug: string;
        formSlug: string;
      };

      // Resolve tenant by slug
      const tenant = await prisma.tenant.findFirst({
        where: { slug: tenantSlug, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Load published form within tenant
      const form = await prisma.customForm.findFirst({
        where: {
          tenantId: tenant.id,
          slug: formSlug,
          status: 'PUBLISHED',
        },
      });

      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Only allow public access to forms that do not require authentication
      if (form.requireAuth) {
        return reply
          .status(403)
          .send({ error: 'This form requires authentication' });
      }

      // Resolve layout with field definitions
      const { sections, conditions } = await resolveFormForRendering(
        form,
        form.tenantId,
      );

      return reply.status(200).send({
        id: form.id,
        name: form.name,
        slug: form.slug,
        description: form.description,
        icon: form.icon,
        color: form.color,
        ticketType: form.ticketType,
        requireAuth: form.requireAuth,
        sections,
        conditions,
      });
    },
  );

  // ─── POST submit form anonymously ──────────────────────────────────────────

  fastify.post(
    '/api/v1/public/forms/:formId/submit',
    async (request, reply) => {
      const { formId } = request.params as { formId: string };
      const body = request.body as {
        submitterEmail: string;
        submitterFirstName: string;
        submitterLastName: string;
        values: Record<string, unknown>;
      };

      // Validate required identity fields
      if (!body.submitterEmail || !body.submitterFirstName || !body.submitterLastName) {
        return reply.status(400).send({
          error: 'submitterEmail, submitterFirstName, and submitterLastName are required',
        });
      }

      // Simple email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.submitterEmail)) {
        return reply.status(400).send({ error: 'Invalid email format' });
      }

      if (!body.values || typeof body.values !== 'object') {
        return reply.status(400).send({ error: 'values object is required' });
      }

      // Load published form
      const form = await prisma.customForm.findFirst({
        where: { id: formId, status: 'PUBLISHED' },
      });

      if (!form) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Only allow public submission for forms that do not require authentication
      if (form.requireAuth) {
        return reply
          .status(403)
          .send({ error: 'This form requires authentication' });
      }

      // Verify tenant is active
      const tenant = await prisma.tenant.findFirst({
        where: { id: form.tenantId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Form not found' });
      }

      // Find or create the submitter user
      const userId = await findOrCreateAnonymousUser(
        form.tenantId,
        body.submitterEmail,
        body.submitterFirstName,
        body.submitterLastName,
      );

      // Build ticket data from form values (validates fields, evaluates conditions)
      const { ticketData, errors } = await buildTicketDataFromForm(
        form,
        body.values,
        form.tenantId,
      );

      if (errors.length > 0) {
        return reply.status(400).send({ error: 'Validation failed', errors });
      }

      try {
        // Create ticket via service
        const ticket = await createTicket(
          form.tenantId,
          ticketData as any,
          userId,
        );

        // Create submission record
        const submission = await prisma.customFormSubmission.create({
          data: {
            tenantId: form.tenantId,
            formId: form.id,
            formVersion: form.currentVersion,
            ticketId: ticket.id,
            submittedById: userId,
            valuesJson: body.values as any,
            layoutSnapshot: form.layoutJson as any,
            status: 'COMPLETED',
          },
        });

        return reply.status(201).send({
          submissionId: submission.id,
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
        });
      } catch (err) {
        // Record failed submission
        await prisma.customFormSubmission.create({
          data: {
            tenantId: form.tenantId,
            formId: form.id,
            formVersion: form.currentVersion,
            submittedById: userId,
            valuesJson: body.values as any,
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
}
