import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { encrypt, decrypt, getFreshAccessToken, getOAuthCredentials } from '@meridian/core';
import { requirePermission } from '../../../plugins/rbac.js';
import { testSmtpConnection, testImapConnection } from '../../../services/email.service.js';
import { oauthRoutes } from './oauth.js';
import { testRoundtripRoutes } from './test-roundtrip.js';
import { emailActivityRoutes } from './activity.js';

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
    { preHandler: [requirePermission('settings.read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      const accounts = await prisma.emailAccount.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });

      // Mask encrypted password fields — return boolean presence instead
      const sanitized = accounts.map(({ smtpPasswordEnc, imapPasswordEnc, oauthAccessTokenEnc, oauthRefreshTokenEnc, ...rest }) => ({
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
    { preHandler: [requirePermission('settings.update')] },
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
      if (body.pollInterval !== undefined && (body.pollInterval < 1 || body.pollInterval > 1440)) {
        return reply.status(400).send({ error: 'pollInterval must be between 1 and 1440 minutes' });
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
    { preHandler: [requirePermission('settings.update')] },
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

      // Guard: OAuth accounts can only update a subset of fields. Only block
      // when a connection-level field is being CHANGED — the edit modal
      // pre-populates and re-sends every field including the OAuth-managed
      // ones, so a strict presence check would reject every save. Compare
      // each blocked field's incoming value against the existing record and
      // only error if they differ.
      if (existing.authProvider !== 'MANUAL') {
        const allowed = new Set(['name', 'pollInterval', 'defaultQueueId', 'defaultCategoryId', 'isActive', 'emailToTicket']);
        const bodyRec = body as Record<string, unknown>;
        const existingRec = existing as unknown as Record<string, unknown>;
        const changed: string[] = [];
        for (const key of Object.keys(bodyRec)) {
          if (allowed.has(key)) continue;
          if (bodyRec[key] === undefined) continue;
          // smtp/imapPassword aren't on the existing record (only smtpPasswordEnc)
          // — any non-empty password attempt is a real change.
          if (key === 'smtpPassword' || key === 'imapPassword') {
            if (bodyRec[key] !== '' && bodyRec[key] !== null) changed.push(key);
            continue;
          }
          if (bodyRec[key] !== existingRec[key]) changed.push(key);
        }
        if (changed.length > 0) {
          return reply.status(400).send({ error: `Cannot modify ${changed.join(', ')} on OAuth accounts. Use reconnect instead.` });
        }
      }

      if (body.pollInterval !== undefined && (body.pollInterval < 1 || body.pollInterval > 1440)) {
        return reply.status(400).send({ error: 'pollInterval must be between 1 and 1440 minutes' });
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
    { preHandler: [requirePermission('settings.update')] },
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

  // POST /api/v1/email-accounts/test-smtp — Test SMTP connection + optional send
  // Supports either inline credentials or accountId to use stored credentials
  fastify.post(
    '/api/v1/email-accounts/test-smtp',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const body = request.body as {
        accountId?: string;
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        secure?: boolean;
        sendTo?: string;
        fromAddress?: string;
      };

      let config: { host: string; port: number; user: string; password: string; secure: boolean };
      let oauthSmtpAuth: { type: 'OAuth2'; user: string; accessToken: string } | null = null;
      let sendTo = body.sendTo;
      let fromAddress = body.fromAddress;

      if (body.accountId) {
        const account = await prisma.emailAccount.findFirst({
          where: { id: body.accountId, tenantId: user.tenantId },
        });
        if (!account) return reply.status(404).send({ error: 'Email account not found' });
        if (!account.smtpHost) return reply.status(400).send({ error: 'Account has no SMTP configuration' });

        // OAuth account — use xoauth2 auth
        if (account.authProvider !== 'MANUAL' && account.oauthAccessTokenEnc && account.oauthRefreshTokenEnc && account.oauthTokenExpiresAt) {
          const provider = account.authProvider.toLowerCase() as 'google' | 'microsoft';
          const creds = await getOAuthCredentials(prisma, provider);
          if (!creds) {
            return reply.status(500).send({ error: `OAuth credentials not configured for ${provider}` });
          }

          const tokenResult = await getFreshAccessToken(
            provider,
            account.oauthAccessTokenEnc,
            account.oauthRefreshTokenEnc,
            account.oauthTokenExpiresAt,
            creds.clientId,
            creds.clientSecret,
          );

          // Persist refreshed token if needed
          if (tokenResult.refreshed) {
            await prisma.emailAccount.update({
              where: { id: account.id },
              data: {
                oauthAccessTokenEnc: encrypt(tokenResult.accessToken),
                oauthTokenExpiresAt: tokenResult.newExpiresAt,
              },
            });
          }

          oauthSmtpAuth = { type: 'OAuth2', user: account.emailAddress, accessToken: tokenResult.accessToken };
          config = {
            host: account.smtpHost,
            port: body.port ?? account.smtpPort ?? 587,
            user: account.smtpUser ?? account.emailAddress,
            password: '', // not used for OAuth
            secure: body.secure ?? account.smtpSecure,
          };
        } else {
          let smtpPassword = '';
          if (account.smtpPasswordEnc) {
            try { smtpPassword = decrypt(account.smtpPasswordEnc); } catch { smtpPassword = ''; }
          }
          config = {
            host: account.smtpHost,
            port: body.port ?? account.smtpPort ?? 587,
            user: account.smtpUser ?? '',
            password: smtpPassword,
            secure: body.secure ?? account.smtpSecure,
          };
        }
        if (!fromAddress) fromAddress = account.emailAddress;
      } else {
        if (!body.host) return reply.status(400).send({ error: 'host is required' });
        config = {
          host: body.host,
          port: body.port ?? 587,
          user: body.user ?? '',
          password: body.password ?? '',
          secure: body.secure ?? false,
        };
      }

      // For OAuth accounts, use the dedicated xoauth2 test path
      if (oauthSmtpAuth) {
        const nodemailer = await import('nodemailer');
        try {
          const transport = nodemailer.default.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            auth: oauthSmtpAuth,
          });
          await transport.verify();
          transport.close();
          return reply.status(200).send({
            success: true,
            steps: [
              { step: 'Resolving host', status: 'ok', detail: `${config.host}:${config.port}` },
              { step: 'OAuth2 authentication', status: 'ok', detail: `User: ${oauthSmtpAuth.user}` },
              { step: 'SMTP handshake', status: 'ok', detail: 'Server responded' },
            ],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(200).send({
            success: false,
            error: msg,
            steps: [
              { step: 'Resolving host', status: 'ok', detail: `${config.host}:${config.port}` },
              { step: 'OAuth2 authentication', status: 'failed', detail: msg },
            ],
          });
        }
      }

      const result = await testSmtpConnection(config, sendTo, fromAddress);
      return reply.status(200).send(result);
    },
  );

  // POST /api/v1/email-accounts/test-imap — Test IMAP connection
  // Supports either inline credentials or accountId to use stored credentials
  fastify.post(
    '/api/v1/email-accounts/test-imap',
    { preHandler: [requirePermission('settings.update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const body = request.body as {
        accountId?: string;
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        secure?: boolean;
      };

      let config: { host: string; port: number; user: string; password: string; secure: boolean };
      let oauthImapAuth: { user: string; accessToken: string } | null = null;

      if (body.accountId) {
        const account = await prisma.emailAccount.findFirst({
          where: { id: body.accountId, tenantId: user.tenantId },
        });
        if (!account) return reply.status(404).send({ error: 'Email account not found' });
        if (!account.imapHost) return reply.status(400).send({ error: 'Account has no IMAP configuration' });

        // OAuth account — use xoauth2 auth
        if (account.authProvider !== 'MANUAL' && account.oauthAccessTokenEnc && account.oauthRefreshTokenEnc && account.oauthTokenExpiresAt) {
          const provider = account.authProvider.toLowerCase() as 'google' | 'microsoft';
          const creds = await getOAuthCredentials(prisma, provider);
          if (!creds) {
            return reply.status(500).send({ error: `OAuth credentials not configured for ${provider}` });
          }

          const tokenResult = await getFreshAccessToken(
            provider,
            account.oauthAccessTokenEnc,
            account.oauthRefreshTokenEnc,
            account.oauthTokenExpiresAt,
            creds.clientId,
            creds.clientSecret,
          );

          // Persist refreshed token if needed
          if (tokenResult.refreshed) {
            await prisma.emailAccount.update({
              where: { id: account.id },
              data: {
                oauthAccessTokenEnc: encrypt(tokenResult.accessToken),
                oauthTokenExpiresAt: tokenResult.newExpiresAt,
              },
            });
          }

          oauthImapAuth = { user: account.emailAddress, accessToken: tokenResult.accessToken };
          config = {
            host: account.imapHost,
            port: body.port ?? account.imapPort ?? 993,
            user: account.imapUser ?? account.emailAddress,
            password: '', // not used for OAuth
            secure: body.secure ?? account.imapSecure,
          };
        } else {
          let imapPassword = '';
          if (account.imapPasswordEnc) {
            try { imapPassword = decrypt(account.imapPasswordEnc); } catch { imapPassword = ''; }
          }
          config = {
            host: account.imapHost,
            port: body.port ?? account.imapPort ?? 993,
            user: account.imapUser ?? '',
            password: imapPassword,
            secure: body.secure ?? account.imapSecure,
          };
        }
      } else {
        if (!body.host) return reply.status(400).send({ error: 'host is required' });
        config = {
          host: body.host,
          port: body.port ?? 993,
          user: body.user ?? '',
          password: body.password ?? '',
          secure: body.secure ?? false,
        };
      }

      // For OAuth accounts, use the dedicated xoauth2 test path
      if (oauthImapAuth) {
        const { ImapFlow } = await import('imapflow');
        const client = new ImapFlow({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: oauthImapAuth,
          logger: false,
          tls: { rejectUnauthorized: false },
          greetingTimeout: 10000,
          socketTimeout: 10000,
        });

        try {
          await client.connect();
          const mailboxes = await client.list();
          await client.logout();
          return reply.status(200).send({
            success: true,
            steps: [
              { step: 'Resolving host', status: 'ok', detail: `${config.host}:${config.port}` },
              { step: 'OAuth2 authentication', status: 'ok', detail: `User: ${oauthImapAuth.user}` },
              { step: 'IMAP connection', status: 'ok', detail: 'Connected to server' },
              { step: 'List mailboxes', status: 'ok', detail: `Found ${mailboxes.length} mailbox(es)` },
            ],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return reply.status(200).send({
            success: false,
            error: msg,
            steps: [
              { step: 'Resolving host', status: 'ok', detail: `${config.host}:${config.port}` },
              { step: 'OAuth2 authentication', status: 'failed', detail: msg },
            ],
          });
        }
      }

      const result = await testImapConnection(config);
      return reply.status(200).send(result);
    },
  );

  // Register OAuth sub-routes
  await oauthRoutes(fastify);
  // Register end-to-end test + activity log sub-routes
  await testRoundtripRoutes(fastify);
  await emailActivityRoutes(fastify);
}
