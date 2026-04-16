export type TemplateChannel = 'EMAIL' | 'TELEGRAM' | 'SLACK' | 'TEAMS' | 'DISCORD';

export const CHANNELS: TemplateChannel[] = ['EMAIL', 'TELEGRAM', 'SLACK', 'TEAMS', 'DISCORD'];

export function isAdmin(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('msp_admin');
}

export function validateCreate(body: {
  name?: string;
  channel?: string;
  content?: Record<string, unknown>;
  contexts?: string[];
}): { ok: true } | { ok: false; error: string } {
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return { ok: false, error: 'name is required' };
  }
  if (!body.channel || !CHANNELS.includes(body.channel as TemplateChannel)) {
    return { ok: false, error: `channel must be one of ${CHANNELS.join(', ')}` };
  }
  if (!body.content || typeof body.content !== 'object') {
    return { ok: false, error: 'content is required' };
  }
  if (body.contexts !== undefined && !Array.isArray(body.contexts)) {
    return { ok: false, error: 'contexts must be an array of strings' };
  }
  return validateContentShape(body.channel as TemplateChannel, body.content);
}

export function validateContentShape(
  channel: TemplateChannel,
  content: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  switch (channel) {
    case 'EMAIL':
      if (!isStr(content.subject)) return { ok: false, error: 'EMAIL template requires content.subject' };
      if (!isStr(content.htmlBody)) return { ok: false, error: 'EMAIL template requires content.htmlBody' };
      if (content.textBody !== undefined && content.textBody !== null && typeof content.textBody !== 'string') {
        return { ok: false, error: 'EMAIL content.textBody must be a string if provided' };
      }
      return { ok: true };
    case 'TELEGRAM':
    case 'SLACK':
    case 'DISCORD':
      if (!isStr(content.message)) {
        return { ok: false, error: `${channel} template requires content.message` };
      }
      return { ok: true };
    case 'TEAMS':
      if (!isStr(content.title)) return { ok: false, error: 'TEAMS template requires content.title' };
      if (!isStr(content.body)) return { ok: false, error: 'TEAMS template requires content.body' };
      return { ok: true };
  }
}

export function graphReferencesTemplate(graph: unknown, templateId: string): boolean {
  if (graph === null || graph === undefined) return false;
  if (typeof graph !== 'object') return false;
  return JSON.stringify(graph).includes(templateId);
}
