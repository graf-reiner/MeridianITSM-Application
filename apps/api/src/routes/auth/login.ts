import type { FastifyInstance } from 'fastify';
import { loginWithTenantSchema } from '@meridian/types';
import { prisma } from '@meridian/db';
import { validateCredentials, getUserRoles, generateTokens } from '../../services/auth.service.js';
import { AUTH_RATE_LIMIT } from '../../plugins/rate-limit.js';

/**
 * POST /api/auth/login
 * Authenticates a user with email + password + tenantSlug.
 * Returns JWT access and refresh tokens on success.
 */
export async function loginRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parseResult = loginWithTenantSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: parseResult.error.issues,
      });
    }

    const { email, password, tenantSlug } = parseResult.data;

    // Resolve tenant by slug — tenant is a global model (not tenant-scoped)
    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: 'ACTIVE' },
    });

    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Validate user credentials against the resolved tenant
    const user = await validateCredentials(email, password, tenant.id);

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Load user's roles
    const roles = await getUserRoles(user.id, tenant.id);

    // Generate token pair
    const tokens = generateTokens(
      {
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
        roles,
      },
      app,
    );

    return reply.code(200).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      },
    });
  });
}
