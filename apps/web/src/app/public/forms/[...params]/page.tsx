'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import Icon from '@mdi/react';
import { mdiCheckCircle, mdiAlertCircleOutline } from '@mdi/js';
import { formatTicketNumber } from '@meridian/core';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResolvedField {
  instanceId: string;
  fieldDefinitionId: string;
  key: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
  optionsJson: Array<{ label: string; value: string }> | null;
  validationConfig: Record<string, unknown> | null;
}

interface ResolvedSection {
  id: string;
  title: string;
  description: string | null;
  fields: ResolvedField[];
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
  sections: ResolvedSection[];
  conditions: Condition[];
}

interface SubmitResponse {
  submissionId: string;
  ticketId: string;
  ticketNumber: number;
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
  color: 'var(--text-primary)',
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
  field: ResolvedField;
  control: ReturnType<typeof useForm>['control'];
  errors: Record<string, { message?: string }>;
}) {
  const error = errors[field.instanceId];
  const hasError = !!error;

  return (
    <div style={{ marginBottom: 18 }}>
      {field.fieldType !== 'hidden' && (
        <label htmlFor={field.instanceId} style={labelStyle}>
          {field.label}
          {field.isRequired && <span style={{ color: 'var(--accent-danger)' }}> *</span>}
        </label>
      )}

      <Controller
        name={field.instanceId}
        control={control}
        rules={field.isRequired ? { required: `${field.label} is required` } : undefined}
        defaultValue={field.fieldType === 'multiselect' ? [] : ''}
        render={({ field: rhfField }) => {
          switch (field.fieldType) {
            case 'text':
            case 'email':
            case 'phone':
            case 'url':
              return (
                <input
                  id={field.instanceId}
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
                  id={field.instanceId}
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
                  id={field.instanceId}
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
                  id={field.instanceId}
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(hasError)}
                >
                  <option value="">{field.placeholder ?? 'Select an option...'}</option>
                  {(field.optionsJson ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              );

            case 'multiselect':
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(field.optionsJson ?? []).map((opt) => {
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
                  {(field.optionsJson ?? []).map((opt) => (
                    <label
                      key={opt.value}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}
                    >
                      <input
                        type="radio"
                        name={field.instanceId}
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
                  id={field.instanceId}
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
                  id={field.instanceId}
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
                  id={field.instanceId}
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
                  id={field.instanceId}
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

// ─── Public Form Page ─────────────────────────────────────────────────────────

export default function PublicFormPage() {
  const rawParams = useParams();
  // Catch-all route: params.params is an array
  // Single segment = UUID: /public/forms/{formId}
  // Two segments = slug: /public/forms/{tenantSlug}/{formSlug}
  const segments = rawParams.params as string[];
  const isSlugRoute = segments.length >= 2;
  const formIdOrNull = segments.length === 1 ? segments[0] : null;
  const tenantSlug = isSlugRoute ? segments[0] : null;
  const formSlug = isSlugRoute ? segments[1] : null;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [resolvedFormId, setResolvedFormId] = useState<string | null>(formIdOrNull);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadForm() {
      try {
        // Build fetch URL based on route pattern
        const fetchUrl = isSlugRoute
          ? `/api/v1/public/forms/by-slug/${encodeURIComponent(tenantSlug!)}/${encodeURIComponent(formSlug!)}`
          : `/api/v1/public/forms/${formIdOrNull}`;

        const res = await fetch(fetchUrl);
        if (res.status === 403) {
          setLoadError('This form is not available. Please contact the organization.');
          return;
        }
        if (!res.ok) throw new Error('Failed to load form');
        const data = await res.json();
        setFormData(data);
        setResolvedFormId(data.id); // Store form ID for submission
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load form',
        );
      } finally {
        setIsLoading(false);
      }
    }
    void loadForm();
  }, [isSlugRoute, tenantSlug, formSlug, formIdOrNull]);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ mode: 'onSubmit' });

  const allValues = watch();

  const conditions = formData?.conditions ?? [];
  const hiddenFields = useMemo(
    () => evaluateConditions(conditions, allValues),
    [conditions, allValues],
  );

  const onSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!formData) return;
      setSubmitError(null);
      setSubmitting(true);

      // Extract identity fields
      const submitterFirstName = (values.__sys_firstName as string) || '';
      const submitterLastName = (values.__sys_lastName as string) || '';
      const submitterEmail = (values.__sys_email as string) || '';

      // Strip hidden field values and identity fields
      const cleanValues: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values)) {
        if (key.startsWith('__sys_')) continue;
        if (!hiddenFields.has(key)) {
          cleanValues[key] = val;
        }
      }

      try {
        const res = await fetch(`/api/v1/public/forms/${resolvedFormId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submitterFirstName,
            submitterLastName,
            submitterEmail,
            values: cleanValues,
          }),
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
    [formData, hiddenFields, resolvedFormId],
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
          {loadError || 'This form could not be loaded. It may have been unpublished or does not exist.'}
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
            Your request has been submitted. Your reference number is <strong>{formatTicketNumber(result.ticketNumber)}</strong>.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  // ── Form Render ────────────────────────────────────────────────────────────

  const sections = formData.sections ?? [];

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
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
        {/* ── Your Information (Identity Section) ──────────────────────────── */}
        <div
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Your Information
          </h2>

          {/* First Name */}
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="__sys_firstName" style={labelStyle}>
              First Name
              <span style={{ color: 'var(--accent-danger)' }}> *</span>
            </label>
            <Controller
              name="__sys_firstName"
              control={control}
              rules={{ required: 'First Name is required' }}
              defaultValue=""
              render={({ field: rhfField }) => (
                <input
                  id="__sys_firstName"
                  type="text"
                  placeholder="Enter your first name"
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(!!(errors as Record<string, { message?: string }>).__sys_firstName)}
                />
              )}
            />
            {(errors as Record<string, { message?: string }>).__sys_firstName?.message && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
                {(errors as Record<string, { message?: string }>).__sys_firstName.message}
              </p>
            )}
          </div>

          {/* Last Name */}
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="__sys_lastName" style={labelStyle}>
              Last Name
              <span style={{ color: 'var(--accent-danger)' }}> *</span>
            </label>
            <Controller
              name="__sys_lastName"
              control={control}
              rules={{ required: 'Last Name is required' }}
              defaultValue=""
              render={({ field: rhfField }) => (
                <input
                  id="__sys_lastName"
                  type="text"
                  placeholder="Enter your last name"
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(!!(errors as Record<string, { message?: string }>).__sys_lastName)}
                />
              )}
            />
            {(errors as Record<string, { message?: string }>).__sys_lastName?.message && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
                {(errors as Record<string, { message?: string }>).__sys_lastName.message}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div style={{ marginBottom: 0 }}>
            <label htmlFor="__sys_email" style={labelStyle}>
              Email Address
              <span style={{ color: 'var(--accent-danger)' }}> *</span>
            </label>
            <Controller
              name="__sys_email"
              control={control}
              rules={{
                required: 'Email Address is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Please enter a valid email address',
                },
              }}
              defaultValue=""
              render={({ field: rhfField }) => (
                <input
                  id="__sys_email"
                  type="email"
                  placeholder="Enter your email address"
                  value={(rhfField.value as string) ?? ''}
                  onChange={rhfField.onChange}
                  onBlur={rhfField.onBlur}
                  style={inputStyle(!!(errors as Record<string, { message?: string }>).__sys_email)}
                />
              )}
            />
            {(errors as Record<string, { message?: string }>).__sys_email?.message && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
                {(errors as Record<string, { message?: string }>).__sys_email.message}
              </p>
            )}
          </div>
        </div>

        {/* ── Form Sections ────────────────────────────────────────────────── */}
        {sections.map((section) => {
          const sectionFields = (section.fields ?? [])
            .filter((f) => !hiddenFields.has(f.instanceId));

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
                  key={field.instanceId}
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
