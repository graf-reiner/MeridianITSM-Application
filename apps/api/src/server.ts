import Fastify from 'fastify';

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
