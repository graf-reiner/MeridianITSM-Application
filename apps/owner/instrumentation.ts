// Next.js calls register() once when a new server instance starts. We use it
// to load .env explicitly so server-only secrets (ENCRYPTION_KEY, JWT_SECRET,
// DATABASE_URL, OWNER_JWT_SECRET, REDIS_*, etc.) are available to API routes
// regardless of how PM2 launched the process.
//
// Without this hook, Next.js does NOT reliably surface .env vars to runtime
// production code unless they're already in the spawn environment — meaning
// `pm2 restart owner` after a reboot leaves encrypt() etc. broken with
// "ENCRYPTION_KEY must be a 64-character hex string".

export async function register(): Promise<void> {
  // Only run on the Node.js runtime (skip Edge runtime instances).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { default: dotenv } = await import('dotenv');
  const path = await import('node:path');

  // The Next.js process cwd is apps/owner (per ecosystem.config.cjs / pm2
  // start), so .env resolves there. Existing process.env values win over
  // .env contents (PM2 ecosystem env: takes precedence).
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });
}
