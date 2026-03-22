'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Icon from '@mdi/react';
import { mdiSwapHorizontal, mdiArrowLeft, mdiCheck, mdiAlertCircle } from '@mdi/js';

// ─── Schema ───────────────────────────────────────────────────────────────────

const changeSchema = z.object({
  type: z.enum(['STANDARD', 'NORMAL', 'EMERGENCY']),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  implementationPlan: z.string().optional(),
  backoutPlan: z.string().optional(),
  testingPlan: z.string().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
});

type ChangeFormData = z.infer<typeof changeSchema>;

// ─── New Change Page ──────────────────────────────────────────────────────────

export default function NewChangePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ChangeFormData>({
    resolver: zodResolver(changeSchema),
    defaultValues: {
      type: 'NORMAL',
      riskLevel: 'MEDIUM',
    },
  });

  const changeType = watch('type');

  // Per CONTEXT.md:
  // - EMERGENCY: no scheduling dates, no implementation plan required
  // - STANDARD: skip approval chain entirely (auto-approved)
  // - NORMAL: show all fields
  const isEmergency = changeType === 'EMERGENCY';
  const isStandard = changeType === 'STANDARD';
  const showScheduling = !isEmergency;
  const showImplementationPlan = !isEmergency;
  const showApprovalNote = isStandard;

  const onSubmit = async (data: ChangeFormData) => {
    setSubmitting(true);
    setServerError('');
    try {
      const payload: Record<string, unknown> = {
        type: data.type,
        title: data.title,
        description: data.description,
        riskLevel: data.riskLevel,
      };

      if (showImplementationPlan && data.implementationPlan) {
        payload.implementationPlan = data.implementationPlan;
      }
      if (!isEmergency && data.backoutPlan) {
        payload.backoutPlan = data.backoutPlan;
      }
      if (!isEmergency && data.testingPlan) {
        payload.testingPlan = data.testingPlan;
      }
      if (showScheduling && data.scheduledStart) {
        payload.scheduledStart = new Date(data.scheduledStart).toISOString();
      }
      if (showScheduling && data.scheduledEnd) {
        payload.scheduledEnd = new Date(data.scheduledEnd).toISOString();
      }

      const res = await fetch('/api/v1/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Submit failed: ${res.status}`);
      }

      const created = await res.json() as { id: string };
      router.push(`/dashboard/changes/${created.id}`);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const labelStyle = {
    display: 'block' as const,
    fontSize: 13,
    fontWeight: 500 as const,
    color: '#374151',
    marginBottom: 4,
  };

  const errorStyle = { fontSize: 12, color: '#dc2626', marginTop: 4 };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/dashboard/changes"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280', textDecoration: 'none', fontSize: 14, marginBottom: 12 }}
        >
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to Changes
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiSwapHorizontal} size={1} color="#4f46e5" />
          New Change Request
        </h1>
      </div>

      <form onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24 }}>

          {/* ── Change Type (controls field visibility) ────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Change Type *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['STANDARD', 'NORMAL', 'EMERGENCY'] as const).map((t) => {
                const isSelected = changeType === t;
                const isEmergencyOption = t === 'EMERGENCY';
                return (
                  <label
                    key={t}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '12px 8px',
                      border: `2px solid ${isSelected ? (isEmergencyOption ? '#dc2626' : '#4f46e5') : '#d1d5db'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? (isEmergencyOption ? '#fff1f2' : '#eef2ff') : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input type="radio" value={t} {...register('type')} style={{ display: 'none' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? (isEmergencyOption ? '#dc2626' : '#4f46e5') : '#374151' }}>
                      {t}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, textAlign: 'center' }}>
                      {t === 'STANDARD' && 'Auto-approved, low-risk'}
                      {t === 'NORMAL' && 'Full approval workflow'}
                      {t === 'EMERGENCY' && 'Urgent, no scheduling'}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* EMERGENCY banner */}
            {isEmergency && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', backgroundColor: '#fee2e2', borderRadius: 6, border: '1px solid #fca5a5' }}>
                <Icon path={mdiAlertCircle} size={0.9} color="#dc2626" />
                <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
                  Emergency changes skip scheduling and implementation plan — expedited approval path
                </span>
              </div>
            )}

            {/* STANDARD banner */}
            {showApprovalNote && (
              <div style={{ marginTop: 10, padding: '10px 14px', backgroundColor: '#d1fae5', borderRadius: 6, border: '1px solid #6ee7b7' }}>
                <span style={{ fontSize: 13, color: '#065f46', fontWeight: 500 }}>
                  Standard changes are pre-approved — no approval chain required
                </span>
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', margin: '20px 0' }} />

          {/* ── Core Fields ────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title *</label>
            <input
              type="text"
              placeholder="Brief description of the change"
              {...register('title')}
              style={{ ...inputStyle, borderColor: errors.title ? '#dc2626' : '#d1d5db' }}
            />
            {errors.title && <p style={errorStyle}>{errors.title.message}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description *</label>
            <textarea
              placeholder="Detailed description of what this change involves and why it is needed"
              rows={4}
              {...register('description')}
              style={{ ...inputStyle, resize: 'vertical', borderColor: errors.description ? '#dc2626' : '#d1d5db' }}
            />
            {errors.description && <p style={errorStyle}>{errors.description.message}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Risk Level *</label>
            <select
              {...register('riskLevel')}
              style={{ ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' }}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          {/* ── Scheduling (hidden for EMERGENCY) ─────────────────────────────── */}
          {showScheduling && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', margin: '20px 0' }} />
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#374151' }}>Schedule</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Scheduled Start</label>
                  <input
                    type="datetime-local"
                    {...register('scheduledStart')}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Scheduled End</label>
                  <input
                    type="datetime-local"
                    {...register('scheduledEnd')}
                    style={inputStyle}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Plans (hidden for EMERGENCY) ──────────────────────────────────── */}
          {showImplementationPlan && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', margin: '20px 0' }} />
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#374151' }}>Implementation Details</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Implementation Plan</label>
                <textarea
                  placeholder="Step-by-step implementation instructions"
                  rows={4}
                  {...register('implementationPlan')}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Backout Plan</label>
                  <textarea
                    placeholder="Steps to revert the change if something goes wrong"
                    rows={3}
                    {...register('backoutPlan')}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Testing Plan</label>
                  <textarea
                    placeholder="How will you verify the change was successful?"
                    rows={3}
                    {...register('testingPlan')}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────────────────────── */}
        {serverError && (
          <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
            {serverError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <Icon path={mdiCheck} size={0.8} color="currentColor" />
            {submitting ? 'Submitting...' : 'Submit Change'}
          </button>
          <Link
            href="/dashboard/changes"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 20px',
              backgroundColor: '#fff',
              color: '#374151',
              textDecoration: 'none',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
