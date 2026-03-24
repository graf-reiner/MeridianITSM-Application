import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { encrypt } from '@meridian/core';
import { requirePermission } from '../../../plugins/rbac.js';
import { testSmtpConnection, testImapConnection } from '../../../services/email.service.js';

/**
 * Email Account Management Routes (EMAL-01 to EMAL-06)
 *
 * GET    /api/v1/email-accounts            — List email accounts (credentials masked)
 * POST   /api/v1/email-accounts            — Create email account (encrypts passwords)
 * PATCH  /api/v1/email-accounts/:id        — Update email account
 * DELETE /api/v1/email-accounts/:id        — Delete email account
 * POST   /api/v1/email-accounts/test-smtp  — Test SMTP connection
 * POST   /api/v1/email-accounts/test-imap  — Test IMAP connection
 */
export async function emailAccountRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/email-accounts — List email accounts
  fastify.get(
    '/api/v1/email-accounts',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const accounts = await prisma.emailAccount.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });

      // Mask encrypted password fields — return boolean presence instead
      const sanitized = accounts.map(({ smtpPasswordEnc, imapPasswordEnc, ...rest }) => ({
        ...rest,
        hasSmtpPassword: smtpPasswordEnc !== null && smtpPasswordEnc !== '',
        hasImapPassword: imapPasswordEnc !== null && imapPasswordEnc !== '',
      }));

      return reply.status(200).send(sanitized);
    },
  );

  // POST /api/v1/email-accounts — Create email account
  fastify.post(
    '/api/v1/email-accounts',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const body = request.body as {
        name: string;
        emailAddress: string;
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPassword?: string;
        smtpSecure?: boolean;
        imapHost?: string;
        imapPort?: number;
        imapUser?: string;
        imapPassword?: string;
        imapSecure?: boolean;
        pollInterval?: number;
        isActive?: boolean;
        emailToTicket?: boolean;
        defaultQueueId?: string;
        defaultCategoryId?: string;
      };

      if (!body.name) {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (!body.emailAddress) {
        return reply.status(400).send({ error: 'emailAddress is required' });
      }

      const account = await prisma.emailAccount.create({
        data: {
          tenantId,
          name: body.name,
          emailAddress: body.emailAddress,
          smtpHost: body.smtpHost,
          smtpPort: body.smtpPort,
          smtpUser: body.smtpUser,
          smtpPasswordEnc: body.smtpPassword ? encrypt(body.smtpPassword) : null,
          smtpSecure: body.smtpSecure ?? true,
          imapHost: body.imapHost,
          imapPort: body.imapPort,
          imapUser: body.imapUser,
          imapPasswordEnc: body.imapPassword ? encrypt(body.imapPassword) : null,
          imapSecure: body.imapSecure ?? true,
          pollInterval: body.pollInterval ?? 5,
          isActive: body.isActive ?? true,
          emailToTicket: body.emailToTicket ?? true,
          defaultQueueId: body.defaultQueueId,
          defaultCategoryId: body.defaultCategoryId,
        },
      });

      const { smtpPasswordEnc, imapPasswordEnc, ...rest } = account;

      return reply.status(201).send({
        ...rest,
        hasSmtpPassword: smtpPasswordEnc !== null && smtpPasswordEnc !== '',
        hasImapPassword: imapPasswordEnc !== null && imapPasswordEnc !== '',
      });
    },
  );

  // PATCH /api/v1/email-accounts/:id — Update email account
  fastify.patch(
    '/api/v1/email-accounts/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        emailAddress?: string;
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPassword?: string;
        smtpSecure?: boolean;
        imapHost?: string;
        imapPort?: number;
        imapUser?: string;
        imapPassword?: string;
        imapSecure?: boolean;
        pollInterval?: number;
        isActive?: boolean;
        emailToTicket?: boolean;
        defaultQueueId?: string;
        defaultCategoryId?: string;
      };

      const existing = await prisma.emailAccount.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Email account not found' });
      }

      // Only encrypt password if a new one is provided; leave existing encrypted value otherwise
      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData['name'] = body.name;
      if (body.emailAddress !== undefined) updateData['emailAddress'] = body.emailAddress;
      if (body.smtpHost !== undefined) updateData['smtpHost'] = body.smtpHost;
      if (body.smtpPort !== undefined) updateData['smtpPort'] = body.smtpPort;
      if (body.smtpUser !== undefined) updateData['smtpUser'] = body.smtpUser;
      if (body.smtpPassword !== undefined) updateData['smtpPasswordEnc'] = encrypt(body.smtpPassword);
      if (body.smtpSecure !== undefined) updateData['smtpSecure'] = body.smtpSecure;
      if (body.imapHost !== undefined) updateData['imapHost'] = body.imapHost;
      if (body.imapPort !== undefined) updateData['imapPort'] = body.imapPort;
      if (body.imapUser !== undefined) updateData['imapUser'] = body.imapUser;
      if (body.imapPassword !== undefined) updateData['imapPasswordEnc'] = encrypt(body.imapPassword);
      if (body.imapSecure !== undefined) updateData['imapSecure'] = body.imapSecure;
      if (body.pollInterval !== undefined) updateData['pollInterval'] = body.pollInterval;
      if (body.isActive !== undefined) updateData['isActive'] = body.isActive;
      if (body.emailToTicket !== undefined) updateData['emailToTicket'] = body.emailToTicket;
      if (body.defaultQueueId !== undefined) updateData['defaultQueueId'] = body.defaultQueueId;
      if (body.defaultCategoryId !== undefined) updateData['defaultCategoryId'] = body.defaultCategoryId;

      const updated = await prisma.emailAccount.update({
        where: { id },
        data: updateData,
      });

      const { smtpPasswordEnc, imapPasswordEnc, ...rest } = updated;

      return reply.status(200).send({
        ...rest,
        hasSmtpPassword: smtpPasswordEnc !== null && smtpPasswordEnc !== '',
        hasImapPassword: imapPasswordEnc !== null && imapPasswordEnc !== '',
      });
    },
  );

  // DELETE /api/v1/email-accounts/:id — Delete email account
  fastify.delete(
    '/api/v1/email-accounts/:id',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;
      const { id } = request.params as { id: string };

      const existing = await prisma.emailAccount.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Email account not found' });
      }

      await prisma.emailAccount.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // POST /api/v1/email-accounts/test-smtp — Test SMTP connection
  fastify.post(
    '/api/v1/email-accounts/test-smtp',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const body = request.body as {
        host: string;
        port: number;
        user: string;
        password: string;
        secure: boolean;
      };

      if (!body.host) {
        return reply.status(400).send({ error: 'host is required' });
      }

      const result = await testSmtpConnection(body);
      return reply.status(200).send(result);
    },
  );

  // POST /api/v1/email-accounts/test-imap — Test IMAP connection
  fastify.post(
    '/api/v1/email-accounts/test-imap',
    { preHandler: [requirePermission('settings:write')] },
    async (request, reply) => {
      const body = request.body as {
        host: string;
        port: number;
        user: string;
        password: string;
        secure: boolean;
      };

      if (!body.host) {
        return reply.status(400).send({ error: 'host is required' });
      }

      const result = await testImapConnection(body);
      return reply.status(200).send(result);
    },
  );
}
