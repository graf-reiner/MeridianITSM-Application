'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiCheckCircle, mdiChevronLeft, mdiAlertCircleOutline } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDefinition {
  id: string;
  fieldInstanceId: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  options: Array<{ label: string; value: string }> | null;
  defaultValue: unknown;
}

interface LayoutSection {
  id: string;
  title: string;
  description: string | null;
  fieldInstanceIds: string[];
}

interface Condition {
  targetFieldId: string;
  parentFieldId: string;
  operator: string;
  value: unknown;
  action: string;
}

interface FormData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  resolvedFields: FieldDefinition[];
  layoutJson: { sections: LayoutSection[] };
  conditionsJson: Condition[];
}

interface SubmitResponse {
  ticketId: string;
  ticketNumber: string;
}

// ─── Condition Evaluation ─────────────────────────────────────────────────────

function evaluateConditions(
  conditions: Condition[],
  values: Record<string, unknown>,
): Set<string> {
  const hiddenFields = new Set<string>();
  for (const cond of conditions) {
    const parentValue = values[cond.parentFieldId];
    let met = false;
    switch (cond.operator) {
      case 'equals':
        met = parentValue === cond.value;
        break;
      case 'not_equals':
        met = parentValue !== cond.value;
        break;
      case 'contains':
        met = typeof parentValue === 'string' && parentValue.includes(String(cond.value));
        break;
      case 'in':
        met = Array.isArray(cond.value) && (cond.value as unknown[]).includes(parentValue);
        break;
      case 'is_not_empty':
        met = parentValue != null && parentValue !== '';
        break;
      case 'is_empty':
        met = parentValue == null || parentValue === '';
        break;
    }
    if (cond.action === 'show' && !met) hiddenFields.add(cond.targetFieldId);
    if (cond.action === 'hide' && met) hiddenFields.add(cond.targetFieldId);
  }
  return hiddenFields;
}

// ─── Shared Styles ────────────────────────────────────────────────────────────

const inputStyle = (hasError: boolean) => ({
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${hasError ? 'var(--accent-danger)' : 'var(--border-secondary)'}`,
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
  backgroundColor: 'var(--bg-primary)',
});

const labelStyle = {
  display: 'block' as const,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

// ─── Field Renderer ───────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  control,
  errors,
}: {
  field: FieldDefinition;
  control: ReturnType<typeof useForm>['control'];
  errors: Record<string, { message?: string }>;
}) {
  const error = errors[field.fieldInstanceId];
  const hasError = !!error;

  return (
    <div style={{ marginBottom: 18 }}>
      {field.fieldType !== 'hidden' && (
        <label htmlFor={field.fieldInstanceId} style={labelStyle}>
          {field.label}
          {field.required && <span style={{ color: 'var(--accent-danger)' }}> *</span>}
        </label>
      )}

      <Controller
        name={field.fieldInstanceId}
        control={control}
        rules={field.required ? { required: `${field.label} is required` } : undefined}
        defaultValue={field.defaultValue ?? (field.fieldType === 'multiselect' ? [] : '')}
        render={({ field: rhfField }) => {
          switch (field.fieldType) {
            case 'text':
            case 'email':
            case 'phone':
            case 'url':
              return (
                <input
                  id={field.fieldInstanceId}
                  type={field.fieldType === 'phone' ? 'tel' : field.fieldType}
                  placeholder={field.placeholder ?? ''}
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                />
              );

            case 'textarea':
            case 'richtext':
              return (
                <textarea
                  id={field.fieldInstanceId}
                  placeholder={field.placeholder ?? ''}
                  rows={4}
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={{ ...inputStyle(hasError), resize: 'vertical' }}
                />
              );

            case 'number':
              return (
                <input
                  id={field.fieldInstanceId}
                  type="number"
                  placeholder={field.placeholder ?? ''}
                  value={(rhfField.value as string) ?? ''}
                  onChange={(e) => rhfField.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                />
              );

            case 'select':
            case 'user_picker':
            case 'group_picker':
              return (
                <select
                  id={field.fieldInstanceId}
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                >
                  <option value="">{field.placeholder ?? 'Select an option...'}</option>
                  {(field.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              );

            case 'multiselect':
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(field.options ?? []).map((opt) => {
                    const checked = Array.isArray(rhfField.value) && (rhfField.value as string[]).includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const current = (Array.isArray(rhfField.value) ? rhfField.value : []) as string[];
                            if (checked) {
                              rhfField.onChange(current.filter((v) => v !== opt.value));
                            } else {
                              rhfField.onChange([...current, opt.value]);
                            }
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              );

            case 'radio':
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(field.options ?? []).map((opt) => (
                    <label
                      key={opt.value}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name={field.fieldInstanceId}
                        value={opt.value}
                        checked={rhfField.value === opt.value}
                        onChange={() => rhfField.onChange(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              );

            case 'checkbox':
              return (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!rhfField.value}
                    onChange={(e) => rhfField.onChange(e.target.checked)}
                  />
                  {field.placeholder ?? field.label}
                </label>
              );

            case 'date':
              return (
                <input
                  id={field.fieldInstanceId}
                  type="date"
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                />
              );

            case 'datetime':
              return (
                <input
                  id={field.fieldInstanceId}
                  type="datetime-local"
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                />
              );

            case 'hidden':
              return (
                <input
                  type="hidden"
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                />
              );

            case 'file':
              return (
                <input
                  id={field.fieldInstanceId}
                  type="file"
                  onChange={(e) => rhfField.onChange(e.target.files)}
                  onBlur={rhfField.onBlur}
                  style={{
                    ...inputStyle(hasError),
                    padding: '8px 12px',
                  }}
                />
              );

            default:
              return (
                <input
                  id={field.fieldInstanceId}
                  type="text"
                  placeholder={field.placeholder ?? ''}
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                />
              );
          }
        }}
      />

      {field.helpText && field.fieldType !== 'hidden' && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          {field.helpText}
        </p>
      )}

      {error?.message && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
          {error.message}
        </p>
      )}
    </div>
  );
}

// ─── Form Renderer Page ───────────────────────────────────────────────────────

export default function FormSubmitPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadForm() {
      try {
        const res = await fetch(`/api/v1/custom-forms/published/${slug}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load form');
        const data = await res.json();
        setFormData(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err : new Error('Failed to load form'));
      } finally {
        setIsLoading(false);
      }
    }
    void loadForm();
  }, [slug]);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ mode: 'onSubmit' });

  const allValues = watch();

  const conditions = formData?.conditionsJson ?? [];
  const hiddenFields = useMemo(
    () => evaluateConditions(conditions, allValues),
    [conditions, allValues],
  );

  const fieldMap = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    for (const f of formData?.resolvedFields ?? []) {
      map.set(f.fieldInstanceId, f);
    }
    return map;
  }, [formData?.resolvedFields]);

  const onSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!formData) return;
      setSubmitError(null);
      setSubmitting(true);

      // Strip hidden field values
      const cleanValues: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values)) {
        if (!hiddenFields.has(key)) {
          cleanValues[key] = val;
        }
      }

      try {
        const res = await fetch(`/api/v1/custom-forms/published/${slug}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ values: cleanValues }),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(errData.error ?? errData.message ?? `Submission failed (${res.status})`);
        }

        const data = (await res.json()) as SubmitResponse;
        setResult(data);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit form');
      } finally {
        setSubmitting(false);
      }
    },
    [formData, hiddenFields, slug],
  );

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading form...</p>
      </div>
    );
  }

  if (loadError || !formData) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <Link
          href="/portal/forms"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--text-muted)',
            fontSize: 13,
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          <Icon path={mdiChevronLeft} size={0.8} color="currentColor" />
          Back to forms
        </Link>
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--badge-red-bg)',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            fontSize: 13,
            color: '#991b1b',
          }}
        >
          This form could not be loaded. It may have been unpublished or does not exist.
        </div>
      </div>
    );
  }

  // ── Success State ──────────────────────────────────────────────────────────

  if (result) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <Icon path={mdiCheckCircle} size={2.5} color="#22c55e" />
          <h2
            style={{
              margin: '16px 0 8px',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Request Submitted Successfully
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Your ticket number is <strong>{result.ticketNumber}</strong>
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href={`/portal/tickets/${result.ticketId}`}
              style={{
                padding: '10px 24px',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              View Ticket
            </Link>
            <Link
              href="/portal/forms"
              style={{
                padding: '10px 24px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
                backgroundColor: 'var(--bg-primary)',
              }}
            >
              Submit Another Form
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form Render ────────────────────────────────────────────────────────────

  const sections = formData.layoutJson?.sections ?? [];

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* ── Back Link ──────────────────────────────────────────────────────── */}
      <Link
        href="/portal/forms"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--text-muted)',
          fontSize: 13,
          textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        <Icon path={mdiChevronLeft} size={0.8} color="currentColor" />
        Back to forms
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {formData.name}
        </h1>
        {formData.description && (
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {formData.description}
          </p>
        )}
      </div>

      {/* ── Submit Error ───────────────────────────────────────────────────── */}
      {submitError && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--badge-red-bg)',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiAlertCircleOutline} size={0.7} color="#991b1b" />
          {submitError}
        </div>
      )}

      {/* ── Form ───────────────────────────────────────────────────────────── */}
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        {sections.map((section) => {
          // Get the fields for this section, filtering out hidden conditional fields
          const sectionFields = section.fieldInstanceIds
            .map((fid) => fieldMap.get(fid))
            .filter((f): f is FieldDefinition => f != null && !hiddenFields.has(f.fieldInstanceId));

          if (sectionFields.length === 0) return null;

          return (
            <div
              key={section.id}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 12,
                padding: 24,
                marginBottom: 20,
              }}
            >
              {section.title && (
                <h2
                  style={{
                    margin: '0 0 4px',
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {section.title}
                </h2>
              )}
              {section.description && (
                <p
                  style={{
                    margin: '0 0 16px',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    lineHeight: 1.5,
                  }}
                >
                  {section.description}
                </p>
              )}
              {!section.description && section.title && <div style={{ marginBottom: 16 }} />}

              {sectionFields.map((field) => (
                <FieldRenderer
                  key={field.fieldInstanceId}
                  field={field}
                  control={control}
                  errors={errors as Record<string, { message?: string }>}
                />
              ))}
            </div>
          );
        })}

        {/* ── Submit Button ────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            padding: '12px 28px',
            backgroundColor: submitting ? '#a5b4fc' : 'var(--accent-primary)',
            color: 'var(--bg-primary)',
            border: 'none',
            borderRadius: 8,
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: 15,
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}
