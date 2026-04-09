import type { FastifyInstance } from 'fastify';
import { loginRoute } from './login.js';
import { formLoginRoute } from './form-login.js';
import { refreshRoute } from './refresh.js';
import { passwordResetRoutes } from './password-reset.js';
import { signupRoute } from './signup.js';
import { ssoOidcRoutes } from './sso-oidc.js';

/**
 * Auth routes plugin — no JWT authentication required.
 * Rate limiting is applied to login and password-reset endpoints via route config.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login — rate limited via route config (5 requests per 15 minutes)
  await app.register(loginRoute);

  // Form-based login for non-localhost browser access
  await app.register(formLoginRoute);

  // Refresh token — standard API rate limiting
  await app.register(refreshRoute);

  // Password reset — rate limited via route config (5 requests per 15 minutes)
  await app.register(passwordResetRoutes);

  // Self-service signup — public, rate limited, creates tenant + trial subscription
  await app.register(signupRoute);

  // SSO OIDC — authorize redirect, callback handler, connection listing
  await app.register(ssoOidcRoutes);
}
