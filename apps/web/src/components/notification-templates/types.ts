export type TemplateChannel = 'EMAIL' | 'TELEGRAM' | 'SLACK' | 'TEAMS' | 'DISCORD';

export interface EmailContent {
  subject: string;
  htmlBody: string;
  textBody?: string | null;
}

export interface MessageContent {
  message: string;
}

export interface TeamsContent {
  title: string;
  body: string;
}

export type TemplateContent = EmailContent | MessageContent | TeamsContent;

export interface NotificationTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  channel: TemplateChannel;
  content: TemplateContent;
  contexts: string[];
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
}

export const AVAILABLE_CONTEXTS = [
  'ticket',
  'requester',
  'assignee',
  'tenant',
  'sla',
  'change',
  'comment',
  'cert',
  'now',
] as const;

export type ContextKey = (typeof AVAILABLE_CONTEXTS)[number];
