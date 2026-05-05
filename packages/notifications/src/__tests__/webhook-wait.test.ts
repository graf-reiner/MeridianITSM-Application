import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma + redis (the node imports prisma lazily for response mapping)
vi.mock('@meridian/db', () => ({
  prisma: {
    ticket: {
      findUnique: vi.fn(async () => ({ customFields: {} })),
      update: vi.fn(async () => ({})),
    },
    ticketActivity: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('../redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));

// Side-effect import — registers all built-in nodes including action_webhook_wait
await import('../workflows/nodes/index.js');
const { getNodeDefinition } = await import('../workflows/node-registry.js');

const def = getNodeDefinition('action_webhook_wait');
if (!def?.execute) throw new Error('action_webhook_wait node not registered');

const baseContext = {
  tenantId: 't1',
  workflowId: 'wf-1',
  workflowName: 'Test',
  executionId: 'ex-1',
  isSimulation: false,
  recursionDepth: 1,
  variables: {},
  eventContext: {
    ticket: { id: 'tk1', priority: 'HIGH' },
    actorId: 'u1',
    trigger: 'TICKET_CREATED',
  } as any,
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('action_webhook_wait — port routing', () => {
  it('returns nextPort=success on a 2xx JSON response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await def.execute!(
      { url: 'https://example.com/hook' },
      baseContext,
    );

    expect(result.success).toBe(true);
    expect(result.nextPort).toBe('success');
    expect((result.output as any)?.httpStatus).toBe(200);
  });

  it('returns nextPort=failure on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const result = await def.execute!(
      { url: 'https://example.com/hook' },
      baseContext,
    );

    expect(result.success).toBe(false);
    expect(result.nextPort).toBe('failure');
    expect((result.output as any)?.httpStatus).toBe(500);
  });

  it('returns nextPort=timeout when fetch is aborted', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('abort'), { name: 'AbortError' }));

    const result = await def.execute!(
      { url: 'https://example.com/hook', timeoutMs: 100 },
      baseContext,
    );

    expect(result.success).toBe(false);
    expect(result.nextPort).toBe('timeout');
  });

  it('returns nextPort=invalid_response when body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>not json</html>', { status: 200 }));

    const result = await def.execute!(
      { url: 'https://example.com/hook' },
      baseContext,
    );

    expect(result.success).toBe(false);
    expect(result.nextPort).toBe('invalid_response');
  });

  it('skips real network call in simulation mode', async () => {
    const result = await def.execute!(
      { url: 'https://example.com/hook' },
      { ...baseContext, isSimulation: true },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.nextPort).toBe('success');
    expect((result.output as any)?.simulated).toBe(true);
  });

  it('templates the URL using the event context', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await def.execute!(
      { url: 'https://example.com/{{ticket.id}}' },
      baseContext,
    );

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/tk1', expect.any(Object));
  });

  it('signs payload with HMAC-SHA256 when secret is provided', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await def.execute!(
      { url: 'https://example.com/hook', secret: 'shh' },
      baseContext,
    );

    const callArg = fetchMock.mock.calls[0][1];
    expect(callArg.headers['X-Meridian-Signature']).toMatch(/^sha256=[a-f0-9]+$/);
  });
});
