import type { FastifyInstance } from 'fastify';
import { refreshTokenSchema } from '@meridian/types';
import { generateTokens } from '../../services/auth.service.js';

/**
 * POST /api/auth/refresh
 * Accepts a refresh token and returns a new access + refresh token pair.
 */
export async function refreshRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/refresh', async (request, reply) => {
    const parseResult = refreshTokenSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: parseResult.error.issues,
      });
    }

    const { refreshToken } = parseResult.data;

    let payload: {
      userId: string;
      tenantId: string;
      email: string;
      roles: string[];
      type: string;
      mfaVerified?: boolean;
    };

    try {
      payload = app.jwt.verify<{
        userId: string;
        tenantId: string;
        email: string;
        roles: string[];
        type: string;
        mfaVerified?: boolean;
      }>(refreshToken);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }

    if (payload.type !== 'refresh') {
      return reply.code(401).send({ error: 'Invalid token type' });
    }

    const tokens = generateTokens(
      {
        userId: payload.userId,
        tenantId: payload.tenantId,
        email: payload.email,
        roles: payload.roles,
      },
      app,
      { mfaVerified: payload.mfaVerified === true },
    );

    return reply.code(200).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: payload.userId,
        email: payload.email,
        roles: payload.roles,
      },
    });
  });
}
