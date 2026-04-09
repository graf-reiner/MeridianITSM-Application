import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { validateCredentials, getUserRoles, generateTokens } from '../../services/auth.service.js';
import { AUTH_RATE_LIMIT } from '../../plugins/rate-limit.js';

/**
 * POST /api/auth/form-login
 * HTML form-based login that sets a cookie and redirects.
 * Used when the Next.js dev server proxy is unreliable (e.g., non-localhost access).
 */
export async function formLoginRoute(app: FastifyInstance): Promise<void> {
  // Register formbody parser for application/x-www-form-urlencoded
  app.register(import('@fastify/formbody'));

  app.post('/api/auth/form-login', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = request.body as {
      email?: string;
      password?: string;
      tenantSlug?: string;
      callbackUrl?: string;
      webOrigin?: string;
    };

    const email = body.email ?? '';
    const password = body.password ?? '';
    const tenantSlug = body.tenantSlug ?? 'msp-default';
    const callbackUrl = body.callbackUrl ?? '/dashboard/tickets';
    const webOrigin = body.webOrigin ?? '';

    // Build redirect base from the webOrigin (the Next.js app URL)
    const errorRedirect = (msg: string) => {
      const url = `${webOrigin}/login?error=${encodeURIComponent(msg)}`;
      return reply.redirect(url);
    };

    if (!email || !password) {
      return errorRedirect('Email and password are required');
    }

    const tenant = await prisma.tenant.findFirst({
      where: { slug: tenantSlug, status: 'ACTIVE' },
    });

    if (!tenant) {
      return errorRedirect('Invalid credentials');
    }

    const user = await validateCredentials(email, password, tenant.id);
    if (!user) {
      return errorRedirect('Invalid credentials');
    }

    const roles = await getUserRoles(user.id, tenant.id);
    const tokens = generateTokens(
      { userId: user.id, tenantId: tenant.id, email: user.email, roles },
      app,
    );

    // Redirect to a callback page on the web app that sets the cookie client-side
    // This avoids cross-origin cookie issues between port 4000 and port 3000
    const redirectUrl = `${webOrigin}/login/callback?token=${encodeURIComponent(tokens.accessToken)}&next=${encodeURIComponent(callbackUrl)}`;
    return reply.redirect(redirectUrl);
  });
}
