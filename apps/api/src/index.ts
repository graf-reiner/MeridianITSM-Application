import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from the api package directory (not CWD which may be monorepo root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
import { buildApp } from './server.js';
import { startEmailPolling } from './workers/email-poll.worker.js';

const start = async () => {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 4000);

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`MeridianITSM API server listening on port ${port}`);

  // Start background workers
  await startEmailPolling();
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
