import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'MeridianITSM API',
        description: 'Multi-tenant ITSM platform REST API',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:4000',
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
          },
        },
      },
    },
  });
}
