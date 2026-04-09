'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiFileDocumentEdit } from '@mdi/js';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import RichTextField from '@/components/RichTextField';
import ClassifySuggestions from '@/components/ClassifySuggestions';

// ITIL Impact x Urgency → Priority Matrix
const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  CRITICAL: { CRITICAL: 'CRITICAL', HIGH: 'CRITICAL', MEDIUM: 'HIGH',   LOW: 'MEDIUM' },
  HIGH:     { CRITICAL: 'CRITICAL', HIGH: 'HIGH',     MEDIUM: 'HIGH',   LOW: 'MEDIUM' },
  MEDIUM:   { CRITICAL: 'HIGH',     HIGH: 'HIGH',     MEDIUM: 'MEDIUM', LOW: 'LOW' },
  LOW:      { CRITICAL: 'MEDIUM',   HIGH: 'MEDIUM',   MEDIUM: 'LOW',    LOW: 'LOW' },
};

interface TicketTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  ticketType: string;
  isDefault: boolean;
  defaultPriority: string | null;
  defaultCategoryId: string | null;
  defaultQueueId: string | null;
  defaultAssigneeId: string | null;
  defaultGroupId: string | null;
  defaultSlaId: string | null;
  titleTemplate: string | null;
  descriptionTemplate: string | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface GroupOption {
  id: string;
  name: string;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  type: z.enum(['INCIDENT', 'SERVICE_REQUEST', 'PROBLEM', 'CHANGE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  categoryId: z.string().optional(),
  queueId: z.string().optional(),
  slaPolicyId: z.string().optional(),
  assignedToId: z.string().optional(),
  assignedGroupId: z.string().optional(),
  impact: z.string().optional(),
  urgency: z.string().optional(),
});

type CreateTicketForm = z.infer<typeof createTicketSchema>;

// ─── Create Ticket Page ───────────────────────────────────────────────────────

export default function NewTicketPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [queues, setQueues] = useState<SelectOption[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SelectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Load required fields per ticket type
  const { data: requiredFieldsConfig } = useQuery<Record<string, string[]>>({
    queryKey: ['required-fields-config'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/required-fields', { credentials: 'include' });
      if (!res.ok) return {};
      return res.json() as Promise<Record<string, string[]>>;
    },
  });

  // Load templates
  const { data: templates = [] } = useQuery<TicketTemplate[]>({
    queryKey: ['ticket-templates-active'],
    queryFn: async () => {
      const res = await fetch('/api/v1/ticket-templates', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json() as Promise<TicketTemplate[]>;
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      type: 'INCIDENT',
      priority: 'MEDIUM',
    },
  });

  // Get required fields for current ticket type
  const currentType = watch('type');
  const requiredFields = requiredFieldsConfig?.[currentType] ?? [];

  // Load dropdowns
  useEffect(() => {
    async function loadOptions() {
      const [catRes, queueRes, slaRes, userRes, groupRes] = await Promise.all([
        fetch('/api/v1/settings/categories', { credentials: 'include' }),
        fetch('/api/v1/settings/queues', { credentials: 'include' }),
        fetch('/api/v1/sla', { credentials: 'include' }),
        fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' }),
        fetch('/api/v1/settings/groups', { credentials: 'include' }),
      ]);
      if (catRes.ok) {
        const json = await catRes.json();
        setCategories(Array.isArray(json) ? json : json.categories ?? []);
      }
      if (queueRes.ok) {
        const json = await queueRes.json();
        setQueues(Array.isArray(json) ? json : json.queues ?? []);
      }
      if (slaRes.ok) {
        const json = await slaRes.json();
        setSlaPolicies(Array.isArray(json) ? json : json.policies ?? []);
      }
      if (userRes.ok) {
        const json = await userRes.json();
        const list = Array.isArray(json) ? json : json.data ?? json.users ?? [];
        setUsers(list);
      }
      if (groupRes.ok) {
        const json = await groupRes.json();
        setGroups(Array.isArray(json) ? json : json.groups ?? []);
      }
    }
    void loadOptions();
  }, []);

  const onSubmit = async (values: CreateTicketForm) => {
    setIsSubmitting(true);
    setSubmitError(null);

    // Validate required fields per ticket type
    const missing: string[] = [];
    for (const field of requiredFields) {
      const val = (values as Record<string, unknown>)[field];
      if (!val || (typeof val === 'string' && !val.trim())) {
        missing.push(field.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').trim());
      }
    }
    if (missing.length > 0) {
      setSubmitError(`Required fields missing: ${missing.join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    try {
      const body = {
        ...values,
        categoryId: values.categoryId || undefined,
        queueId: values.queueId || undefined,
        slaPolicyId: values.slaPolicyId || undefined,
        assignedToId: values.assignedToId || undefined,
        assignedGroupId: values.assignedGroupId || undefined,
      };
      const res = await fetch('/api/v1/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create ticket');
      }
      const created = (await res.json()) as { ticket?: { id: string }; id?: string };
      const ticketId = created.ticket?.id ?? (created as { id?: string }).id;
      if (ticketId) {
        router.push(`/dashboard/tickets/${ticketId}`);
      } else {
        router.push('/dashboard/tickets');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: 'var(--bg-primary)',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 5,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  };

  const errorStyle = { color: 'var(--accent-danger)', fontSize: 12, marginTop: 4 };

  const applyTemplate = (template: TicketTemplate) => {
    setSelectedTemplateId(template.id);
    if (template.ticketType) setValue('type', template.ticketType as any);
    if (template.defaultPriority) setValue('priority', template.defaultPriority as any);
    if (template.defaultCategoryId) setValue('categoryId', template.defaultCategoryId);
    if (template.defaultQueueId) setValue('queueId', template.defaultQueueId);
    if (template.defaultSlaId) setValue('slaPolicyId', template.defaultSlaId);
    if (template.defaultAssigneeId) setValue('assignedToId', template.defaultAssigneeId);
    if (template.defaultGroupId) setValue('assignedGroupId', template.defaultGroupId);
    if (template.titleTemplate) setValue('title', template.titleTemplate);
    if (template.descriptionTemplate) setValue('description', template.descriptionTemplate);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard/tickets" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>New Ticket</h1>
      </div>

      {/* Template picker */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Choose a template or start from scratch:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            <button
              onClick={() => setSelectedTemplateId(null)}
              style={{
                padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: selectedTemplateId === null ? '2px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                backgroundColor: selectedTemplateId === null ? 'var(--badge-blue-bg)' : 'var(--bg-primary)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Blank Ticket</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Start from scratch</div>
            </button>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                style={{
                  padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: selectedTemplateId === t.id ? `2px solid ${t.color || 'var(--accent-primary)'}` : '1px solid var(--border-secondary)',
                  backgroundColor: selectedTemplateId === t.id ? 'var(--badge-blue-bg)' : 'var(--bg-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon path={mdiFileDocumentEdit} size={0.7} color={t.color || 'var(--accent-primary)'} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                </div>
                {t.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 28 }}>
        <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}>

          {/* Title */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Title *</label>
            <input
              {...register('title')}
              type="text"
              placeholder="Brief description of the issue"
              style={inputStyle}
            />
            {errors.title && <p style={errorStyle}>{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Description{requiredFields.includes('description') ? ' *' : ''}</label>
            <RichTextField
              value={watch('description') ?? ''}
              onChange={(html) => setValue('description', html, { shouldValidate: true })}
              placeholder="Detailed description of the issue..."
              minHeight={120}
            />
          </div>

          {/* AI Classification Suggestions */}
          <ClassifySuggestions
            title={watch('title') ?? ''}
            description={watch('description') ?? ''}
            onApply={(field, value) => setValue(field as keyof CreateTicketForm, value, { shouldValidate: true })}
          />

          {/* Type & Priority row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Type *</label>
              <select {...register('type')} style={inputStyle}>
                <option value="INCIDENT">Incident</option>
                <option value="SERVICE_REQUEST">Service Request</option>
                <option value="PROBLEM">Problem</option>
                <option value="CHANGE">Change</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority *</label>
              <select {...register('priority')} style={inputStyle}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          {/* Impact & Urgency row — shown for INCIDENT type or when required */}
          {(currentType === 'INCIDENT' || requiredFields.includes('impact') || requiredFields.includes('urgency')) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Impact{requiredFields.includes('impact') ? ' *' : ''}</label>
                <select {...register('impact')} onChange={(e) => {
                  const impact = e.target.value;
                  setValue('impact', impact);
                  const urg = watch('urgency');
                  if (impact && urg && PRIORITY_MATRIX[impact]?.[urg]) {
                    setValue('priority', PRIORITY_MATRIX[impact][urg] as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL');
                  }
                }} style={inputStyle}>
                  <option value="">-- Select --</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Urgency{requiredFields.includes('urgency') ? ' *' : ''}</label>
                <select {...register('urgency')} onChange={(e) => {
                  const urgency = e.target.value;
                  setValue('urgency', urgency);
                  const imp = watch('impact');
                  if (imp && urgency && PRIORITY_MATRIX[imp]?.[urgency]) {
                    setValue('priority', PRIORITY_MATRIX[imp][urgency] as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL');
                  }
                }} style={inputStyle}>
                  <option value="">-- Select --</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            {(() => {
              const imp = watch('impact');
              const urg = watch('urgency');
              const calc = imp && urg ? PRIORITY_MATRIX[imp]?.[urg] : null;
              if (!calc) return null;
              return (
                <div style={{ marginTop: -10, marginBottom: 18, padding: '6px 12px', borderRadius: 6, backgroundColor: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-muted)' }}>
                  Calculated priority from Impact x Urgency matrix: <strong style={{ color: 'var(--text-primary)' }}>{calc}</strong>
                </div>
              );
            })()}
          )}

          {/* Category & Queue row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Category{requiredFields.includes('categoryId') ? ' *' : ''}</label>
              <select {...register('categoryId')} style={inputStyle}>
                <option value="">-- None --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Queue{requiredFields.includes('queueId') ? ' *' : ''}</label>
              <select {...register('queueId')} style={inputStyle}>
                <option value="">-- None --</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* SLA Policy row */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>SLA Policy</label>
            <select {...register('slaPolicyId')} style={inputStyle}>
              <option value="">-- None --</option>
              {slaPolicies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Assign To & Assigned Group row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>Assign To</label>
              <select {...register('assignedToId')} style={inputStyle}>
                <option value="">-- Unassigned --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Assigned Group</label>
              <select {...register('assignedGroupId')} style={inputStyle}>
                <option value="">-- None --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {submitError && (
            <div style={{ padding: '10px 14px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid var(--badge-red-bg-strong)', borderRadius: 8, marginBottom: 16, color: 'var(--accent-danger)', fontSize: 14 }}>
              {submitError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Link
              href="/dashboard/tickets"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 20px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                backgroundColor: 'var(--bg-primary)',
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                backgroundColor: isSubmitting ? 'var(--badge-indigo-bg)' : 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
