import type { FastifyInstance } from 'fastify';
import { passwordResetRequestSchema, passwordResetSchema } from '@meridian/types';
import { prisma } from '@meridian/db';
import {
  createPasswordResetToken,
  resetPassword,
} from '../../services/auth.service.js';
import { AUTH_RATE_LIMIT } from '../../plugins/rate-limit.js';

/**
 * Password reset routes.
 * POST /api/auth/password-reset/request — request a reset token
 * POST /api/auth/password-reset/reset — use token to set new password
 */
export async function passwordResetRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Request a password reset.
   * Always returns 200 to avoid leaking whether an email exists.
   * If user exists, creates a reset token and logs it (email sending wired in Phase 3).
   */
  app.post('/api/auth/password-reset/request', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parseResult = passwordResetRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: parseResult.error.issues,
      });
    }

    const { email } = parseResult.data;

    // Look up the user — we need tenantId but don't have it here.
    // In practice the client would pass tenantSlug; for now we find the first matching active user.
    // This is acceptable for Phase 1 since this endpoint is called from the login page
    // which knows the tenant context.
    const user = await prisma.user.findFirst({
      where: { email, status: 'ACTIVE' },
      include: { tenant: true },
    });

    if (user && user.tenant.status === 'ACTIVE') {
      try {
        const rawToken = await createPasswordResetToken(user.id, user.tenantId);
        // Phase 3: Send email with reset link
        // For now, log the token for dev testing
        console.log(`[DEV] Password reset token for ${email}: ${rawToken}`);
        console.log(`[DEV] Reset URL: http://localhost:3000/auth/reset-password?token=${rawToken}`);
      } catch (err) {
        // Don't expose errors to client — always return 200
        console.error('Failed to create password reset token:', err);
      }
    }

    // Always return 200 — don't leak whether email exists
    return reply.code(200).send({
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  });

  /**
   * Reset password using a valid token.
   * Returns 200 on success, 400 on invalid/expired token.
   */
  app.post('/api/auth/password-reset/reset', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parseResult = passwordResetSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: parseResult.error.issues,
      });
    }

    const { token, password } = parseResult.data;

    const success = await resetPassword(token, password);

    if (!success) {
      return reply.code(400).send({
        error: 'Invalid or expired password reset token',
      });
    }

    return reply.code(200).send({ message: 'Password reset successful' });
  });
}
