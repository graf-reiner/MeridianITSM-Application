import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { serialize } from '../../../lib/serialize';

const QUEUE_NAMES = {
  SLA_MONITOR: 'sla-monitor',
  EMAIL_NOTIFICATION: 'email-notification',
  EMAIL_POLLING: 'email-polling',
  CMDB_RECONCILIATION: 'cmdb-reconciliation',
  STRIPE_WEBHOOK: 'stripe-webhook',
  TRIAL_EXPIRY: 'trial-expiry',
  USAGE_SNAPSHOT: 'usage-snapshot',
} as const;

function getBullmqConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
  };
}

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = getBullmqConnection();
  const queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> = [];

  let redisStatus: 'connected' | 'disconnected' = 'disconnected';

  for (const [, queueName] of Object.entries(QUEUE_NAMES)) {
    const queue = new Queue(queueName, { connection });
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      queues.push({
        name: queueName,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
      redisStatus = 'connected';
    } catch {
      queues.push({
        name: queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    } finally {
      await queue.close();
    }
  }

  return NextResponse.json(serialize({ queues, redisStatus }));
}

export async function POST(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as { message?: string; expiresInMinutes?: number };
  const { message, expiresInMinutes = 60 } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Store maintenance broadcast in Redis with TTL
  try {
    const { Redis } = await import('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
    });

    const ttlSeconds = Math.max(1, expiresInMinutes) * 60;
    const payload = JSON.stringify({
      message: message.trim(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    });

    await redis.set('maintenance:broadcast', payload, 'EX', ttlSeconds);
    await redis.quit();

    return NextResponse.json({ success: true, message: message.trim(), expiresInMinutes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to set maintenance broadcast';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
