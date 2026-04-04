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
      where: { slug: tenantSlug },
      include: { subscription: { select: { status: true } } },
    });

    if (!tenant) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Block suspended tenants with a clear message
    if (tenant.status === 'SUSPENDED') {
      return reply.code(403).send({ error: 'Your account has been suspended. Please contact support.' });
    }

    // Block tenants whose trial has expired and have no active subscription
    if (
      tenant.subscription?.status === 'TRIALING' &&
      tenant.trialEndsAt &&
      new Date(tenant.trialEndsAt) < new Date()
    ) {
      return reply.code(403).send({ error: 'Your trial has expired. Please subscribe to continue using the service.' });
    }

    // Only allow ACTIVE tenants beyond this point
    if (tenant.status !== 'ACTIVE') {
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

    // Extract trusted device cookie from request headers
    const cookieHeader = request.headers.cookie ?? '';
    const trustToken = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('meridian_mfa_trust='))
      ?.split('=')[1];

    // Check if MFA is required for this user (skip if trusted device)
    console.log(`[auth] Login for ${email}: trustToken=${trustToken ? 'present (' + trustToken.substring(0, 8) + '...)' : 'MISSING'}, cookieHeader=${cookieHeader ? 'has cookies' : 'EMPTY'}`);
    const mfaRequired = await checkMfaRequired(user.id, tenant.id, trustToken);

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
