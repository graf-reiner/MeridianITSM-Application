import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { registerCors } from './plugins/cors.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { redis } from './lib/redis.js';
import { authPreHandler } from './plugins/auth.js';
import { tenantPreHandler } from './plugins/tenant.js';
import { planGatePreHandler } from './plugins/plan-gate.js';
import { blockImpersonationWrites } from './middleware/impersonation-guard.js';
import { apiKeyPreHandler } from './plugins/api-key.js';
import { healthRoutes } from './routes/health/index.js';
import { authRoutes } from './routes/auth/index.js';
import { billingRoutes, authenticatedBillingRoutes } from './routes/billing/index.js';
import { v1Routes } from './routes/v1/index.js';
import { externalRoutes } from './routes/external/index.js';
import { agentRoutes } from './routes/v1/agents/index.js';
import { publicFormRoutes } from './routes/public/custom-forms.js';
import { inboundWebhookPublicRoutes } from './routes/public/inbound-webhooks.js';
import { publicBrandingRoutes } from './routes/public/branding.js';
import { botDiscordRoutes } from './routes/public/bot-discord.js';
import { botTelegramRoutes } from './routes/public/bot-telegram.js';

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 /* 10 MB — supports base64 image pastes in rich text */ });

  // Layer 1: CORS — must be first for preflight requests
  await registerCors(app);

  // Layer 2: Swagger / OpenAPI docs
  await registerSwagger(app);

  // Layer 3: JWT plugin — registers signing/verification; does NOT enforce on all routes
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production-jwt-secret-32chars',
  });

  // Layer 4: Cookie support (for form-based login)
  await app.register(fastifyCookie);

  // Note: @fastify/multipart is registered per-plugin-scope where needed
  // (apps/api/src/routes/v1/tickets/index.ts, settings/branding.ts) so JSON
  // routes aren't affected and there are no duplicate-content-type-parser
  // conflicts.

  // Layer 5: Rate limiting with Redis backing
  await registerRateLimit(app);

  // Public routes — no authentication required
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(billingRoutes); // Stripe webhooks use signature verification, not JWT
  await app.register(publicFormRoutes); // Anonymous custom form viewing + submission
  await app.register(inboundWebhookPublicRoutes); // Anonymous inbound webhooks (token-in-URL auth)
  await app.register(publicBrandingRoutes); // Anonymous tenant logo for the login page
  await app.register(botDiscordRoutes); // Discord bot interaction webhook
  await app.register(botTelegramRoutes); // Telegram bot update webhook

  // Protected routes — JWT auth + tenant injection + plan gate + impersonation write-block
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', authPreHandler);
    protectedApp.addHook('preHandler', tenantPreHandler);
    protectedApp.addHook('preHandler', planGatePreHandler);
    protectedApp.addHook('preHandler', blockImpersonationWrites);

    await protectedApp.register(v1Routes);
    await protectedApp.register(authenticatedBillingRoutes);
  });

  // API key routes — separate scope for agent/external endpoints
  await app.register(async (externalApp) => {
    externalApp.addHook('preHandler', apiKeyPreHandler);

    await externalApp.register(externalRoutes);
  });

  // Agent routes — separate scope using AgentKey auth (not ApiKey or JWT).
  // Enrollment uses token-based auth; heartbeat/inventory/cmdb-sync use AgentKey header.
  // Each route handler calls resolveAgent() to authenticate.
  await app.register(agentRoutes);

  // Graceful shutdown: close Redis on app close
  app.addHook('onClose', async () => {
    await redis.quit();
  });

  return app;
}
