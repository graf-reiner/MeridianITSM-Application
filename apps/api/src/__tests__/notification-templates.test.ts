import { describe, it, expect } from 'vitest';
import {
  CHANNELS,
  isAdmin,
  validateCreate,
  validateContentShape,
  graphReferencesTemplate,
} from '../routes/v1/notification-templates/validation.js';

// ---------------------------------------------------------------------------
// Channel list
// ---------------------------------------------------------------------------

describe('NotificationTemplate channels', () => {
  it('exposes exactly EMAIL, TELEGRAM, SLACK, TEAMS, DISCORD', () => {
    expect([...CHANNELS].sort()).toEqual(['DISCORD', 'EMAIL', 'SLACK', 'TEAMS', 'TELEGRAM']);
  });
});

// ---------------------------------------------------------------------------
// Role gating
// ---------------------------------------------------------------------------

describe('isAdmin', () => {
  it('returns true for admin', () => {
    expect(isAdmin(['admin'])).toBe(true);
  });
  it('returns true for msp_admin', () => {
    expect(isAdmin(['msp_admin'])).toBe(true);
  });
  it('returns false for agent or end_user', () => {
    expect(isAdmin(['agent'])).toBe(false);
    expect(isAdmin(['end_user'])).toBe(false);
    expect(isAdmin([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateCreate — top-level body validation
// ---------------------------------------------------------------------------

describe('validateCreate', () => {
  it('rejects missing name', () => {
    const result = validateCreate({ channel: 'EMAIL', content: { subject: 's', htmlBody: 'b' } });
    expect(result).toEqual({ ok: false, error: 'name is required' });
  });

  it('rejects empty/whitespace name', () => {
    expect(validateCreate({ name: '   ', channel: 'EMAIL', content: {} })).toMatchObject({ ok: false });
  });

  it('rejects unknown channel', () => {
    const result = validateCreate({ name: 'T', channel: 'SMS', content: {} });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('channel must be one of') });
  });

  it('rejects missing content', () => {
    const result = validateCreate({ name: 'T', channel: 'EMAIL' });
    expect(result).toEqual({ ok: false, error: 'content is required' });
  });

  it('rejects non-array contexts', () => {
    const result = validateCreate({
      name: 'T',
      channel: 'TELEGRAM',
      content: { message: 'hi' },
      contexts: 'ticket' as unknown as string[],
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('contexts') });
  });

  it('accepts valid EMAIL create payload', () => {
    const result = validateCreate({
      name: 'New ticket alert',
      channel: 'EMAIL',
      content: { subject: 'Hi {{ticket.title}}', htmlBody: '<p>body</p>' },
      contexts: ['ticket'],
    });
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// validateContentShape — per-channel payload shape
// ---------------------------------------------------------------------------

describe('validateContentShape', () => {
  describe('EMAIL', () => {
    it('requires subject', () => {
      expect(validateContentShape('EMAIL', { htmlBody: 'b' })).toMatchObject({ ok: false, error: expect.stringContaining('subject') });
    });
    it('requires htmlBody', () => {
      expect(validateContentShape('EMAIL', { subject: 's' })).toMatchObject({ ok: false, error: expect.stringContaining('htmlBody') });
    });
    it('accepts optional textBody as string', () => {
      expect(validateContentShape('EMAIL', { subject: 's', htmlBody: 'b', textBody: 'alt' })).toEqual({ ok: true });
    });
    it('rejects non-string textBody', () => {
      expect(validateContentShape('EMAIL', { subject: 's', htmlBody: 'b', textBody: 123 })).toMatchObject({ ok: false });
    });
    it('allows missing textBody', () => {
      expect(validateContentShape('EMAIL', { subject: 's', htmlBody: 'b' })).toEqual({ ok: true });
    });
  });

  describe.each(['TELEGRAM', 'SLACK', 'DISCORD'] as const)('%s', (channel) => {
    it('requires message', () => {
      expect(validateContentShape(channel, {})).toMatchObject({ ok: false, error: expect.stringContaining('message') });
    });
    it('accepts a valid payload', () => {
      expect(validateContentShape(channel, { message: 'hello {{ticket.number}}' })).toEqual({ ok: true });
    });
    it('rejects empty message', () => {
      expect(validateContentShape(channel, { message: '' })).toMatchObject({ ok: false });
    });
  });

  describe('TEAMS', () => {
    it('requires title', () => {
      expect(validateContentShape('TEAMS', { body: 'b' })).toMatchObject({ ok: false, error: expect.stringContaining('title') });
    });
    it('requires body', () => {
      expect(validateContentShape('TEAMS', { title: 't' })).toMatchObject({ ok: false, error: expect.stringContaining('body') });
    });
    it('accepts a valid payload', () => {
      expect(validateContentShape('TEAMS', { title: 't', body: 'b' })).toEqual({ ok: true });
    });
  });
});

// ---------------------------------------------------------------------------
// graphReferencesTemplate — usage scan
// ---------------------------------------------------------------------------

describe('graphReferencesTemplate', () => {
  const TEMPLATE_ID = 'a1b2c3d4-aaaa-bbbb-cccc-000000000001';
  const OTHER_ID = '99999999-aaaa-bbbb-cccc-000000000999';

  it('returns true when templateId appears in a node config', () => {
    const graph = {
      nodes: [
        { id: 'n1', data: { config: { templateId: TEMPLATE_ID, recipients: ['assignee'] } } },
      ],
      edges: [],
    };
    expect(graphReferencesTemplate(graph, TEMPLATE_ID)).toBe(true);
  });

  it('returns false when templateId is not referenced', () => {
    const graph = {
      nodes: [
        { id: 'n1', data: { config: { templateId: OTHER_ID } } },
      ],
      edges: [],
    };
    expect(graphReferencesTemplate(graph, TEMPLATE_ID)).toBe(false);
  });

  it('returns false for empty/null graphs', () => {
    expect(graphReferencesTemplate(null, TEMPLATE_ID)).toBe(false);
    expect(graphReferencesTemplate(undefined, TEMPLATE_ID)).toBe(false);
    expect(graphReferencesTemplate({ nodes: [], edges: [] }, TEMPLATE_ID)).toBe(false);
  });

  it('returns false for non-object graphs', () => {
    expect(graphReferencesTemplate('string', TEMPLATE_ID)).toBe(false);
    expect(graphReferencesTemplate(42, TEMPLATE_ID)).toBe(false);
  });

  it('detects template nested deep in the graph', () => {
    const graph = {
      nodes: [
        { id: 'n1', data: { config: { subject: 'hi' } } },
        { id: 'n2', data: { config: { nested: { deeper: { templateId: TEMPLATE_ID } } } } },
      ],
    };
    expect(graphReferencesTemplate(graph, TEMPLATE_ID)).toBe(true);
  });
});
