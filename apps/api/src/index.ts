import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env BEFORE any other imports (ESM hoists static imports above module code)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Dynamic imports AFTER dotenv so DATABASE_URL and ENCRYPTION_KEY are available
const { buildApp } = await import('./server.js');
const { startEmailPolling } = await import('./workers/email-poll.worker.js');
const { startSlaMonitoring } = await import('./workers/sla-monitor.worker.js');
const { startAutoClose } = await import('./workers/auto-close.worker.js');
const { startRecurringTickets } = await import('./workers/recurring-ticket.worker.js');

const start = async () => {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 4000);

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`MeridianITSM API server listening on port ${port}`);

  // Start background workers
  await startEmailPolling();
  await startSlaMonitoring();
  await startAutoClose();
  await startRecurringTickets();
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
