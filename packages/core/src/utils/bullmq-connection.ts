// ─── Shared BullMQ Connection Helper ─────────────────────────────────────────
// Single source of truth for the host/port options BullMQ needs to talk to
// Redis. Use this everywhere a Queue or Worker is constructed outside the
// dedicated worker app — apps/worker has its own ioredis instance for direct
// Redis calls but re-exports this helper for queue construction.
//
// maxRetriesPerRequest: null and enableReadyCheck: false are required by BullMQ.

export interface BullMQConnection {
  host: string;
  port: number;
  maxRetriesPerRequest: null;
  enableReadyCheck: false;
}

function parseRedisUrl(): { host: string; port: number } {
  const raw = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const url = new URL(raw);
    return {
      host: url.hostname || 'localhost',
      port: Number(url.port) || 6379,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const { host, port } = parseRedisUrl();

export const bullmqConnection: BullMQConnection = {
  host,
  port,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};
