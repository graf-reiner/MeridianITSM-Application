'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Icon from '@mdi/react';
import { mdiArrowLeft } from '@mdi/js';
import Link from 'next/link';

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
});

type CreateTicketForm = z.infer<typeof createTicketSchema>;

// ─── Create Ticket Page ───────────────────────────────────────────────────────

export default function NewTicketPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [queues, setQueues] = useState<SelectOption[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SelectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      type: 'INCIDENT',
      priority: 'MEDIUM',
    },
  });

  // Load dropdowns
  useEffect(() => {
    async function loadOptions() {
      const [catRes, queueRes, slaRes, userRes] = await Promise.all([
        fetch('/api/v1/settings/categories', { credentials: 'include' }),
        fetch('/api/v1/settings/queues', { credentials: 'include' }),
        fetch('/api/v1/sla', { credentials: 'include' }),
        fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' }),
      ]);
      if (catRes.ok) {
        const data = (await catRes.json()) as { categories: SelectOption[] };
        setCategories(data.categories ?? []);
      }
      if (queueRes.ok) {
        const data = (await queueRes.json()) as { queues: SelectOption[] };
        setQueues(data.queues ?? []);
      }
      if (slaRes.ok) {
        const data = (await slaRes.json()) as { policies: SelectOption[] };
        setSlaPolicies(data.policies ?? []);
      }
      if (userRes.ok) {
        const data = (await userRes.json()) as { users: UserOption[] };
        setUsers(data.users ?? []);
      }
    }
    void loadOptions();
  }, []);

  const onSubmit = async (values: CreateTicketForm) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        ...values,
        categoryId: values.categoryId || undefined,
        queueId: values.queueId || undefined,
        slaPolicyId: values.slaPolicyId || undefined,
        assignedToId: values.assignedToId || undefined,
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
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: '#fff',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 5,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  };

  const errorStyle = { color: '#dc2626', fontSize: 12, marginTop: 4 };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard/tickets" style={{ display: 'flex', alignItems: 'center', color: '#6b7280', textDecoration: 'none' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>New Ticket</h1>
      </div>

      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28 }}>
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
            <label style={labelStyle}>Description</label>
            <textarea
              {...register('description')}
              placeholder="Detailed description of the issue..."
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

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

          {/* Category & Queue row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select {...register('categoryId')} style={inputStyle}>
                <option value="">-- None --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Queue</label>
              <select {...register('queueId')} style={inputStyle}>
                <option value="">-- None --</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* SLA & Assignee row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>SLA Policy</label>
              <select {...register('slaPolicyId')} style={inputStyle}>
                <option value="">-- None --</option>
                {slaPolicies.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Assign To</label>
              <select {...register('assignedToId')} style={inputStyle}>
                <option value="">-- Unassigned --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>

          {submitError && (
            <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, color: '#dc2626', fontSize: 14 }}>
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
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: '#374151',
                textDecoration: 'none',
                backgroundColor: '#fff',
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
                backgroundColor: isSubmitting ? '#a5b4fc' : '#4f46e5',
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
