import 'dotenv/config';
import { buildApp } from './server.js';

const start = async () => {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 4000);

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`MeridianITSM API server listening on port ${port}`);
};

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received — shutting down gracefully');
  process.exit(0);
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
