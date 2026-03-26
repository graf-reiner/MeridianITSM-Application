import type { FastifyInstance } from 'fastify';
import { loginWithTenantSchema } from '@meridian/types';
import { prisma } from '@meridian/db';
import { validateCredentials, getUserRoles, generateTokens, checkMfaRequired } from '../../services/auth.service.js';
import { AUTH_RATE_LIMIT } from '../../plugins/rate-limit.js';
import { logAuthEvent } from '../../lib/auth-audit.js';
import { checkBruteForce, recordFailedAttempt, clearFailedAttempts } from '../../lib/brute-force.js';

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

    const ip = request.ip;
    const ua = request.headers['user-agent'] ?? undefined;

    // Brute force protection — check before validating credentials
    const bruteCheck = checkBruteForce(email, tenant.id);
    if (bruteCheck.locked) {
      logAuthEvent({
        tenantId: tenant.id,
        eventType: 'ACCOUNT_LOCKED',
        ipAddress: ip,
        userAgent: ua,
        success: false,
        metadata: { email },
      });
      return reply.code(429).send({ error: 'Account temporarily locked. Try again later.' });
    }

    // Validate user credentials against the resolved tenant
    const user = await validateCredentials(email, password, tenant.id);

    if (!user) {
      recordFailedAttempt(email, tenant.id);
      logAuthEvent({
        tenantId: tenant.id,
        eventType: 'LOGIN_FAILURE',
        authMethod: 'credentials',
        ipAddress: ip,
        userAgent: ua,
        success: false,
        metadata: { email },
      });
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Clear brute force counters on success
    clearFailedAttempts(email, tenant.id);

    // Load user's roles
    const roles = await getUserRoles(user.id, tenant.id);

    // Check if MFA is required for this user
    const mfaRequired = await checkMfaRequired(user.id, tenant.id);

    // Generate token pair — mfaVerified is true only if MFA is NOT required
    const tokens = generateTokens(
      {
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
        roles,
      },
      app,
      { mfaVerified: !mfaRequired },
    );

    logAuthEvent({
      tenantId: tenant.id,
      userId: user.id,
      eventType: 'LOGIN_SUCCESS',
      authMethod: 'credentials',
      ipAddress: ip,
      userAgent: ua,
      success: true,
      metadata: { mfaRequired },
    });

    return reply.code(200).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      mfaRequired,
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
