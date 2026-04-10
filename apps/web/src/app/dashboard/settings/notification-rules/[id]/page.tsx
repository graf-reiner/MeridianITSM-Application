'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiBellAlert,
  mdiPlus,
  mdiClose,
  mdiTrashCan,
} from '@mdi/js';
import RichTextField from '@/components/RichTextField';
import { VariableRichEditor } from '@/components/variable-picker';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGERS = [
  'TICKET_CREATED',
  'TICKET_ASSIGNED',
  'TICKET_COMMENTED',
  'TICKET_RESOLVED',
  'TICKET_UPDATED',
  'SLA_WARNING',
  'SLA_BREACH',
  'CHANGE_CREATED',
  'CHANGE_APPROVED',
  'CHANGE_UPDATED',
  'CAB_INVITATION',
  'MENTION',
  'SYSTEM',
] as const;

const TRIGGER_HELP: Record<string, string> = {
  TICKET_CREATED: 'Fires when a new ticket is created',
  TICKET_ASSIGNED: 'Fires when a ticket is assigned or reassigned',
  TICKET_COMMENTED: 'Fires when a comment is added to a ticket',
  TICKET_RESOLVED: 'Fires when a ticket is resolved',
  TICKET_UPDATED: 'Fires when any ticket field is updated',
  SLA_WARNING: 'Fires when an SLA target is approaching its deadline',
  SLA_BREACH: 'Fires when an SLA target has been breached',
  CHANGE_CREATED: 'Fires when a new change request is created',
  CHANGE_APPROVED: 'Fires when a change request is approved',
  CHANGE_UPDATED: 'Fires when a change request is updated',
  CAB_INVITATION: 'Fires when a CAB meeting invitation is sent',
  MENTION: 'Fires when a user is @mentioned',
  SYSTEM: 'System-level notifications',
};

const CONDITION_FIELDS = [
  'priority', 'queue', 'category', 'assignedGroup', 'type', 'status',
  'source', 'requestedBy', 'assignedTo', 'slaStatus', 'customFields',
] as const;

const OPERATORS = [
  'equals', 'not_equals', 'in', 'not_in', 'contains',
  'greater_than', 'less_than', 'between', 'is_true', 'is_false',
] as const;

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TYPES = ['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE'];
const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED', 'CANCELLED'];

const ACTION_TYPES = [
  'in_app', 'email', 'slack', 'teams', 'webhook', 'sms', 'push', 'escalate', 'update_field', 'webhook_wait',
] as const;

const UPDATE_FIELD_OPTIONS = ['priority', 'status', 'category', 'queue', 'assignedGroup', 'assignedTo'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  conditions: Condition[];
}

interface ActionConfig {
  type: string;
  recipientMode?: string;
  dynamicRecipients?: string[];
  specificUserIds?: string[];
  specificAddresses?: string;
  templateName?: string;
  alertChannelId?: string;
  messageTemplate?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookHeaders?: { key: string; value: string }[];
  phoneNumbers?: string;
  targetQueueId?: string;
  targetGroupId?: string;
  targetUserId?: string;
  fieldName?: string;
  fieldValue?: string;
  responseMapping?: string;
}

interface DropdownOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface AlertChannel {
  id: string;
  name: string;
  channelType: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 7,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const sectionStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 10,
  padding: 20,
  marginBottom: 20,
};

const smallBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 7,
  fontSize: 13,
  cursor: 'pointer',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
};

// ─── Condition Row ────────────────────────────────────────────────────────────

function ConditionRow({
  condition,
  queues,
  categories,
  groups,
  onChange,
  onRemove,
}: {
  condition: Condition;
  queues: DropdownOption[];
  categories: DropdownOption[];
  groups: DropdownOption[];
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const isSelectField = ['priority', 'type', 'status', 'queue', 'category', 'assignedGroup'].includes(condition.field);
  const isBoolOp = ['is_true', 'is_false'].includes(condition.operator);

  const getValueOptions = (): { value: string; label: string }[] => {
    switch (condition.field) {
      case 'priority': return PRIORITIES.map((p) => ({ value: p, label: p }));
      case 'type': return TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }));
      case 'status': return STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }));
      case 'queue': return queues.map((q) => ({ value: q.id, label: q.name }));
      case 'category': return categories.map((c) => ({ value: c.id, label: c.name }));
      case 'assignedGroup': return groups.map((g) => ({ value: g.id, label: g.name }));
      default: return [];
    }
  };

  const valueOptions = getValueOptions();

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value, value: '' })}
        style={{ ...inputStyle, width: 160, flex: 'none' }}
      >
        <option value="">-- Field --</option>
        {CONDITION_FIELDS.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        style={{ ...inputStyle, width: 140, flex: 'none' }}
      >
        <option value="">-- Operator --</option>
        {OPERATORS.map((o) => (
          <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
        ))}
      </select>
      {isBoolOp ? (
        <div style={{ flex: 1, padding: '8px 10px', color: 'var(--text-placeholder)', fontSize: 13 }}>(no value needed)</div>
      ) : isSelectField && valueOptions.length > 0 && !['in', 'not_in'].includes(condition.operator) ? (
        <select
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          style={{ ...inputStyle, flex: 1 }}
        >
          <option value="">-- Select --</option>
          {valueOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={['in', 'not_in'].includes(condition.operator) ? 'Comma-separated values' : 'Value'}
          style={{ ...inputStyle, flex: 1 }}
        />
      )}
      <button onClick={onRemove} style={{ ...smallBtnStyle, padding: '6px 8px', border: '1px solid #fecaca', color: 'var(--accent-danger)', flex: 'none' }}>
        <Icon path={mdiClose} size={0.65} color="currentColor" />
      </button>
    </div>
  );
}

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({
  action,
  index,
  queues,
  groups,
  users,
  alerts,
  onChange,
  onRemove,
}: {
  action: ActionConfig;
  index: number;
  queues: DropdownOption[];
  groups: DropdownOption[];
  users: UserOption[];
  alerts: AlertChannel[];
  onChange: (a: ActionConfig) => void;
  onRemove: () => void;
}) {
  const update = (partial: Partial<ActionConfig>) => onChange({ ...action, ...partial });
  const dynamicOptions = ['assignee', 'requester', 'group_members'];
  const slackChannels = alerts.filter((a) => a.channelType === 'SLACK');
  const teamsChannels = alerts.filter((a) => a.channelType === 'TEAMS');

  const renderRecipientConfig = () => (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Recipient Mode</label>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="radio"
              name={`recipient-mode-${index}`}
              checked={action.recipientMode !== 'specific'}
              onChange={() => update({ recipientMode: 'dynamic' })}
            />
            Dynamic
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="radio"
              name={`recipient-mode-${index}`}
              checked={action.recipientMode === 'specific'}
              onChange={() => update({ recipientMode: 'specific' })}
            />
            Specific
          </label>
        </div>
      </div>
      {action.recipientMode !== 'specific' ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {dynamicOptions.map((opt) => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={action.dynamicRecipients?.includes(opt) ?? false}
                onChange={(e) => {
                  const current = action.dynamicRecipients ?? [];
                  update({
                    dynamicRecipients: e.target.checked
                      ? [...current, opt]
                      : current.filter((r) => r !== opt),
                  });
                }}
              />
              {opt.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Users</label>
          <select
            multiple
            value={action.specificUserIds ?? []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (o) => o.value);
              update({ specificUserIds: selected });
            }}
            style={{ ...inputStyle, height: 80 }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-placeholder)' }}>Hold Ctrl/Cmd to select multiple</p>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 16, marginBottom: 12, position: 'relative' }}>
      <button
        onClick={onRemove}
        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
      >
        <Icon path={mdiClose} size={0.75} color="#dc2626" />
      </button>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Action Type</label>
        <select value={action.type} onChange={(e) => update({ type: e.target.value })} style={{ ...inputStyle, maxWidth: 300 }}>
          <option value="">-- Select Type --</option>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* in_app / push */}
      {(action.type === 'in_app' || action.type === 'push') && renderRecipientConfig()}

      {/* email */}
      {action.type === 'email' && (
        <>
          {renderRecipientConfig()}
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Additional Email Addresses (comma-separated)</label>
            <input
              type="text"
              value={action.specificAddresses ?? ''}
              onChange={(e) => update({ specificAddresses: e.target.value })}
              placeholder="user@example.com, another@example.com"
              style={inputStyle}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Template Name</label>
            <input
              type="text"
              value={action.templateName ?? ''}
              onChange={(e) => update({ templateName: e.target.value })}
              placeholder="e.g. ticket_created"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* slack */}
      {action.type === 'slack' && (
        <>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Slack Channel</label>
            <select
              value={action.alertChannelId ?? ''}
              onChange={(e) => update({ alertChannelId: e.target.value })}
              style={{ ...inputStyle, maxWidth: 400 }}
            >
              <option value="">-- Select Channel --</option>
              {slackChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Message Template</label>
            <VariableRichEditor
              value={action.messageTemplate ?? ''}
              onChange={(val) => update({ messageTemplate: val })}
              context={['ticket', 'requester', 'assignee', 'tenant', 'now']}
              placeholder="Type / to insert a variable"
              minHeight={100}
            />
          </div>
        </>
      )}

      {/* teams */}
      {action.type === 'teams' && (
        <>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Teams Channel</label>
            <select
              value={action.alertChannelId ?? ''}
              onChange={(e) => update({ alertChannelId: e.target.value })}
              style={{ ...inputStyle, maxWidth: 400 }}
            >
              <option value="">-- Select Channel --</option>
              {teamsChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Message Template</label>
            <VariableRichEditor
              value={action.messageTemplate ?? ''}
              onChange={(val) => update({ messageTemplate: val })}
              context={['ticket', 'requester', 'assignee', 'tenant', 'now']}
              placeholder="Type / to insert a variable"
              minHeight={100}
            />
          </div>
        </>
      )}

      {/* webhook / webhook_wait */}
      {(action.type === 'webhook' || action.type === 'webhook_wait') && (
        <>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Webhook URL</label>
            <input
              type="url"
              value={action.webhookUrl ?? ''}
              onChange={(e) => update({ webhookUrl: e.target.value })}
              placeholder="https://example.com/webhook"
              style={inputStyle}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Secret</label>
            <input
              type="text"
              value={action.webhookSecret ?? ''}
              onChange={(e) => update({ webhookSecret: e.target.value })}
              placeholder="Optional signing secret"
              style={inputStyle}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Headers</label>
            {(action.webhookHeaders ?? []).map((h, hi) => (
              <div key={hi} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input
                  type="text"
                  value={h.key}
                  onChange={(e) => {
                    const headers = [...(action.webhookHeaders ?? [])];
                    headers[hi] = { ...headers[hi], key: e.target.value };
                    update({ webhookHeaders: headers });
                  }}
                  placeholder="Header name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="text"
                  value={h.value}
                  onChange={(e) => {
                    const headers = [...(action.webhookHeaders ?? [])];
                    headers[hi] = { ...headers[hi], value: e.target.value };
                    update({ webhookHeaders: headers });
                  }}
                  placeholder="Header value"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => {
                    const headers = (action.webhookHeaders ?? []).filter((_, idx) => idx !== hi);
                    update({ webhookHeaders: headers });
                  }}
                  style={{ ...smallBtnStyle, padding: '6px 8px', border: '1px solid #fecaca', color: 'var(--accent-danger)' }}
                >
                  <Icon path={mdiClose} size={0.6} color="currentColor" />
                </button>
              </div>
            ))}
            <button
              onClick={() => update({ webhookHeaders: [...(action.webhookHeaders ?? []), { key: '', value: '' }] })}
              style={smallBtnStyle}
            >
              + Add Header
            </button>
          </div>
          {action.type === 'webhook_wait' && (
            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Response Mapping (JSON)</label>
              <RichTextField
                value={action.responseMapping ?? ''}
                onChange={(val) => update({ responseMapping: val })}
                placeholder='{"fieldName": "$.response.field"}'
                minHeight={80}
                compact
              />
            </div>
          )}
        </>
      )}

      {/* sms */}
      {action.type === 'sms' && (
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Phone Numbers (comma-separated)</label>
          <input
            type="text"
            value={action.phoneNumbers ?? ''}
            onChange={(e) => update({ phoneNumbers: e.target.value })}
            placeholder="+1234567890, +0987654321"
            style={inputStyle}
          />
        </div>
      )}

      {/* escalate */}
      {action.type === 'escalate' && (
        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Target Queue</label>
            <select value={action.targetQueueId ?? ''} onChange={(e) => update({ targetQueueId: e.target.value })} style={inputStyle}>
              <option value="">-- None --</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>{q.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Target Group</label>
            <select value={action.targetGroupId ?? ''} onChange={(e) => update({ targetGroupId: e.target.value })} style={inputStyle}>
              <option value="">-- None --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Target User</label>
            <select value={action.targetUserId ?? ''} onChange={(e) => update({ targetUserId: e.target.value })} style={inputStyle}>
              <option value="">-- None --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* update_field */}
      {action.type === 'update_field' && (
        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Field</label>
            <select value={action.fieldName ?? ''} onChange={(e) => update({ fieldName: e.target.value })} style={inputStyle}>
              <option value="">-- Select --</option>
              {UPDATE_FIELD_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Value</label>
            <input
              type="text"
              value={action.fieldValue ?? ''}
              onChange={(e) => update({ fieldValue: e.target.value })}
              placeholder="New value"
              style={inputStyle}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rule Editor Page ─────────────────────────────────────────────────────────

export default function NotificationRuleEditorPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const ruleId = params.id as string;
  const isNew = ruleId === 'new';

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<string>('TICKET_CREATED');
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(100);
  const [stopAfterMatch, setStopAfterMatch] = useState(false);
  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>([]);
  const [actions, setActions] = useState<ActionConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);

  // Fetch existing rule
  const { data: ruleData, error: ruleError, isLoading: ruleLoading } = useQuery({
    queryKey: ['notification-rule', ruleId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/notification-rules/${ruleId}`, { credentials: 'include' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Failed to load rule (${res.status}): ${text}`);
      }
      return res.json() as Promise<Record<string, unknown>>;
    },
    enabled: !isNew,
    retry: false,
  });

  // Fetch supporting data
  const { data: queuesData } = useQuery<DropdownOption[]>({
    queryKey: ['settings-queues-opts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const { data: groupsData } = useQuery<DropdownOption[]>({
    queryKey: ['settings-groups-opts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/groups', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.groups ?? [];
    },
  });

  const { data: categoriesData } = useQuery<DropdownOption[]>({
    queryKey: ['settings-categories-opts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? [];
    },
  });

  const { data: usersData } = useQuery<UserOption[]>({
    queryKey: ['settings-users-opts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      const list = json.data ?? json.users ?? (Array.isArray(json) ? json : []);
      return list as UserOption[];
    },
  });

  const { data: alertsData } = useQuery<AlertChannel[]>({
    queryKey: ['settings-alerts-opts'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/alerts', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.channels ?? json.alerts ?? [];
    },
  });

  const queues = queuesData ?? [];
  const groups = groupsData ?? [];
  const categories = categoriesData ?? [];
  const users = usersData ?? [];
  const alerts = alertsData ?? [];

  // Populate form from fetched rule
  useEffect(() => {
    if (!isNew && ruleData && !loaded) {
      const r = ruleData;
      setName((r.name as string) ?? '');
      setDescription((r.description as string) ?? '');
      setTrigger((r.trigger as string) ?? 'TICKET_CREATED');
      setIsActive((r.isActive as boolean) ?? true);
      setPriority((r.priority as number) ?? 100);
      setStopAfterMatch((r.stopAfterMatch as boolean) ?? false);
      setConditionGroups((r.conditionGroups as ConditionGroup[]) ?? []);
      setActions((r.actions as ActionConfig[]) ?? []);
      setLoaded(true);
    }
  }, [isNew, ruleData, loaded]);

  // ─── Condition Group Handlers ─────────────────────────────────────────────

  const addConditionGroup = useCallback(() => {
    setConditionGroups((prev) => [...prev, { conditions: [{ field: '', operator: '', value: '' }] }]);
  }, []);

  const removeConditionGroup = useCallback((gi: number) => {
    setConditionGroups((prev) => prev.filter((_, i) => i !== gi));
  }, []);

  const addCondition = useCallback((gi: number) => {
    setConditionGroups((prev) => {
      const next = [...prev];
      next[gi] = { ...next[gi], conditions: [...next[gi].conditions, { field: '', operator: '', value: '' }] };
      return next;
    });
  }, []);

  const updateCondition = useCallback((gi: number, ci: number, c: Condition) => {
    setConditionGroups((prev) => {
      const next = [...prev];
      const conditions = [...next[gi].conditions];
      conditions[ci] = c;
      next[gi] = { ...next[gi], conditions };
      return next;
    });
  }, []);

  const removeCondition = useCallback((gi: number, ci: number) => {
    setConditionGroups((prev) => {
      const next = [...prev];
      next[gi] = { ...next[gi], conditions: next[gi].conditions.filter((_, i) => i !== ci) };
      return next;
    });
  }, []);

  // ─── Action Handlers ──────────────────────────────────────────────────────

  const addAction = useCallback(() => {
    setActions((prev) => [...prev, { type: '', recipientMode: 'dynamic', dynamicRecipients: [] }]);
  }, []);

  const updateAction = useCallback((ai: number, a: ActionConfig) => {
    setActions((prev) => { const next = [...prev]; next[ai] = a; return next; });
  }, []);

  const removeAction = useCallback((ai: number) => {
    setActions((prev) => prev.filter((_, i) => i !== ai));
  }, []);

  // ─── Save / Delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        trigger,
        isActive,
        priority,
        stopAfterMatch,
        conditionGroups,
        actions,
      };
      const url = isNew
        ? '/api/v1/settings/notification-rules'
        : `/api/v1/settings/notification-rules/${ruleId}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save rule');
      }
      void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
      router.push('/dashboard/settings/notification-rules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete rule "${name}"?`)) return;
    await fetch(`/api/v1/settings/notification-rules/${ruleId}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
    router.push('/dashboard/settings/notification-rules');
  };

  if (!isNew && !loaded) {
    if (ruleError) {
      return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 40 }}>
          <div style={{ padding: '12px 16px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--accent-danger)', fontSize: 14 }}>
            Failed to load rule: {ruleError.message}
          </div>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href="/dashboard/settings/notification-rules" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 14 }}>
              &larr; Back to Notification Rules
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading rule...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Link
          href="/dashboard/settings/notification-rules"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiBellAlert} size={1} color="#d97706" />
          {isNew ? 'New Notification Rule' : 'Edit Notification Rule'}
        </h1>
      </div>

      {/* Basic Info */}
      <div style={sectionStyle}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="rule-name" style={labelStyle}>Name *</label>
          <input id="rule-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} placeholder="e.g. Notify assignee on ticket creation" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="rule-desc" style={labelStyle}>Description</label>
          <RichTextField value={description} onChange={setDescription} placeholder="Optional description of this rule" minHeight={60} compact />
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <span style={labelStyle}>Active</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--border-secondary)', position: 'relative', transition: 'background-color 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: isActive ? 20 : 2,
                width: 18, height: 18, borderRadius: 9, backgroundColor: 'var(--bg-primary)',
                transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              }} />
            </button>
          </label>
          <div>
            <label htmlFor="rule-priority" style={labelStyle}>Priority</label>
            <input id="rule-priority" type="number" min={1} value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 100)} style={{ ...inputStyle, width: 80 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={stopAfterMatch} onChange={(e) => setStopAfterMatch(e.target.checked)} />
            Stop processing after match
          </label>
        </div>
      </div>

      {/* Trigger */}
      <div style={sectionStyle}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Trigger</h2>
        <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={{ ...inputStyle, maxWidth: 350 }}>
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {TRIGGER_HELP[trigger] && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{TRIGGER_HELP[trigger]}</p>
        )}
      </div>

      {/* Conditions */}
      <div style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Conditions</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          Match ANY group (OR). All conditions within a group must match (AND).
        </p>

        {conditionGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <div style={{ textAlign: 'center', margin: '8px 0' }}>
                <span style={{ padding: '2px 12px', borderRadius: 9999, backgroundColor: 'var(--badge-blue-bg)', color: '#1e40af', fontSize: 12, fontWeight: 600 }}>
                  OR
                </span>
              </div>
            )}
            <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 16, marginBottom: 8, position: 'relative' }}>
              <button
                onClick={() => removeConditionGroup(gi)}
                style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <Icon path={mdiClose} size={0.75} color="#dc2626" />
              </button>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
                Group {gi + 1} (AND)
              </div>
              {group.conditions.map((cond, ci) => (
                <ConditionRow
                  key={ci}
                  condition={cond}
                  queues={queues}
                  categories={categories}
                  groups={groups}
                  onChange={(c) => updateCondition(gi, ci, c)}
                  onRemove={() => removeCondition(gi, ci)}
                />
              ))}
              <button onClick={() => addCondition(gi)} style={smallBtnStyle}>
                <Icon path={mdiPlus} size={0.6} color="currentColor" />
                Add Condition
              </button>
            </div>
          </div>
        ))}

        <button onClick={addConditionGroup} style={{ ...smallBtnStyle, marginTop: 4 }}>
          <Icon path={mdiPlus} size={0.6} color="currentColor" />
          Add Condition Group
        </button>
      </div>

      {/* Actions */}
      <div style={sectionStyle}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Actions</h2>

        {actions.map((action, ai) => (
          <ActionCard
            key={ai}
            action={action}
            index={ai}
            queues={queues}
            groups={groups}
            users={users}
            alerts={alerts}
            onChange={(a) => updateAction(ai, a)}
            onRemove={() => removeAction(ai)}
          />
        ))}

        <button onClick={addAction} style={smallBtnStyle}>
          <Icon path={mdiPlus} size={0.6} color="currentColor" />
          Add Action
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 16, color: 'var(--accent-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          {!isNew && (
            <button
              onClick={() => void handleDelete()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                border: '1px solid #fecaca',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--accent-danger)',
              }}
            >
              <Icon path={mdiTrashCan} size={0.75} color="currentColor" />
              Delete Rule
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/dashboard/settings/notification-rules"
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Cancel
          </Link>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            style={{
              padding: '8px 20px',
              backgroundColor: saving ? '#a5b4fc' : 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : isNew ? 'Create Rule' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
