// PM2 Ecosystem Configuration — MeridianITSM
// Usage:
//   pm2 start ecosystem.config.cjs          # Start all services
//   pm2 restart all                          # Restart all
//   pm2 stop all                             # Stop all
//   pm2 logs                                 # Tail all logs
//   pm2 logs worker                          # Tail worker logs
//   pm2 monit                                # Real-time dashboard
//   pm2 save                                 # Save current process list
//   pm2 startup                              # Auto-start on boot (run the command it outputs)
//
// After code changes:
//   pm2 restart web                          # After pnpm --filter web build
//   pm2 restart api                          # API uses tsx, just restart
//   pnpm --filter worker build && pm2 restart worker   # Worker uses built JS

const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    // ─── Web (Next.js) ──────────────────────────────────────────────────
    {
      name: 'web',
      cwd: path.join(ROOT, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 0.0.0.0 --port 3000',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      error_file: path.join(ROOT, 'logs/web-error.log'),
      out_file: path.join(ROOT, 'logs/web-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '512M',
    },

    // ─── API (Fastify) ──────────────────────────────────────────────────
    {
      name: 'api',
      cwd: path.join(ROOT, 'apps/api'),
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'src/index.ts',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      error_file: path.join(ROOT, 'logs/api-error.log'),
      out_file: path.join(ROOT, 'logs/api-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '512M',
    },

    // ─── Worker (BullMQ background jobs) ────────────────────────────────
    // Handles: email polling, email notifications, SLA monitoring,
    // push notifications, CMDB reconciliation, webhooks, etc.
    {
      name: 'worker',
      cwd: path.join(ROOT, 'apps/worker'),
      script: 'dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      error_file: path.join(ROOT, 'logs/worker-error.log'),
      out_file: path.join(ROOT, 'logs/worker-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '512M',
      kill_timeout: 10000,
    },
  ],
};
