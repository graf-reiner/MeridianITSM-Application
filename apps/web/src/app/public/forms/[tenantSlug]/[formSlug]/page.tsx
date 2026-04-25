'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import Icon from '@mdi/react';
import { mdiCheckCircle, mdiAlertCircleOutline } from '@mdi/js';

// Reuse all types and helpers from the UUID-based page — copied inline to avoid
// cross-route imports (Next.js app router routes are not importable).

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

function evaluateConditions(
  conditions: Condition[],
  values: Record<string, unknown>,
): Set<string> {
  const hidden = new Set<string>();
  for (const c of conditions) {
    const parentVal = values[c.parentFieldId];
    let match = false;
    switch (c.operator) {
      case 'equals': match = parentVal === c.value; break;
      case 'not_equals': match = parentVal !== c.value; break;
      case 'contains': match = typeof parentVal === 'string' && typeof c.value === 'string' && parentVal.includes(c.value); break;
      case 'is_empty': match = !parentVal || parentVal === ''; break;
      case 'is_not_empty': match = !!parentVal && parentVal !== ''; break;
      default: match = false;
    }
    if (c.action === 'show' && !match) hidden.add(c.targetFieldId);
    if (c.action === 'hide' && match) hidden.add(c.targetFieldId);
  }
  return hidden;
}

/**
 * Slug-based public form page: /public/forms/{tenantSlug}/{formSlug}
 * User-friendly URL that persists in the browser address bar.
 */
export default function SlugPublicFormPage() {
  const params = useParams();
  const tenantSlug = params.tenantSlug as string;
  const formSlug = params.formSlug as string;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch form via slug-based API
  useEffect(() => {
    async function loadForm() {
      try {
        const res = await fetch(
          `/api/v1/public/forms/by-slug/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(formSlug)}`,
        );
        if (res.status === 403) {
          setLoadError('This form is not available. Please contact the organization.');
          return;
        }
        if (!res.ok) throw new Error('Failed to load form');
        const data = await res.json();
        setFormData(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load form');
      } finally {
        setIsLoading(false);
      }
    }
    void loadForm();
  }, [tenantSlug, formSlug]);

  const { control, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {} as Record<string, unknown>,
  });

  const watchedValues = watch();
  const hiddenFields = useMemo(
    () => (formData ? evaluateConditions(formData.conditions, watchedValues) : new Set<string>()),
    [formData, watchedValues],
  );

  const onSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!formData) return;
      setSubmitError(null);
      setSubmitting(true);

      const submitterFirstName = (values.__sys_firstName as string) || '';
      const submitterLastName = (values.__sys_lastName as string) || '';
      const submitterEmail = (values.__sys_email as string) || '';

      const cleanValues: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values)) {
        if (key.startsWith('__sys_')) continue;
        if (!hiddenFields.has(key)) cleanValues[key] = val;
      }

      try {
        // Submit uses form ID (from the loaded data)
        const res = await fetch(`/api/v1/public/forms/${formData.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submitterFirstName, submitterLastName, submitterEmail, values: cleanValues }),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errData.error ?? `Submission failed (${res.status})`);
        }

        const data = (await res.json()) as SubmitResponse;
        setResult(data);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit form');
      } finally {
        setSubmitting(false);
      }
    },
    [formData, hiddenFields],
  );

  // ── Loading / Error states ──

  if (isLoading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Loading form...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0ea5e9', marginBottom: 24 }}>MeridianITSM</h1>
        <div style={{ padding: '14px 20px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 14 }}>
          {loadError}
        </div>
      </div>
    );
  }

  if (!formData) return null;

  // ── Success state ──

  if (result) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <Icon path={mdiCheckCircle} size={2.5} color="#16a34a" />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '16px 0 8px' }}>
          Submitted Successfully
        </h2>
        <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 8px' }}>
          Your request has been created.
        </p>
        <p style={{ fontSize: 14, color: '#94a3b8' }}>
          Ticket #{String(result.ticketNumber).padStart(5, '0')}
        </p>
        <button
          onClick={() => { setResult(null); setSubmitError(null); }}
          style={{
            marginTop: 20, padding: '10px 20px', borderRadius: 8,
            border: '1px solid #e2e8f0', backgroundColor: '#fff',
            color: '#334155', fontSize: 14, cursor: 'pointer',
          }}
        >
          Submit Another
        </button>
      </div>
    );
  }

  // ── Form rendering ──

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 32 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0ea5e9', marginBottom: 24 }}>MeridianITSM</h1>

      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>{formData.name}</h2>
        {formData.description && (
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>{formData.description}</p>
        )}

        {submitError && (
          <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={mdiAlertCircleOutline} size={0.65} color="#dc2626" />
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Identity fields for anonymous submission */}
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#64748b' }}>Your Information</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>First Name *</label>
                <Controller name="__sys_firstName" control={control} rules={{ required: 'Required' }} render={({ field }) => (
                  <input {...field} value={(field.value as string) ?? ''} style={inputStyle} />
                )} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Last Name *</label>
                <Controller name="__sys_lastName" control={control} rules={{ required: 'Required' }} render={({ field }) => (
                  <input {...field} value={(field.value as string) ?? ''} style={inputStyle} />
                )} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Email *</label>
              <Controller name="__sys_email" control={control} rules={{ required: 'Required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } }} render={({ field }) => (
                <input {...field} type="email" value={(field.value as string) ?? ''} style={inputStyle} />
              )} />
            </div>
          </div>

          {/* Dynamic form sections */}
          {formData.sections.map((section) => (
            <div key={section.id} style={{ marginBottom: 20 }}>
              {section.title && (
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                  {section.title}
                </h3>
              )}
              {section.fields.map((field) => {
                if (hiddenFields.has(field.instanceId)) return null;
                return (
                  <div key={field.instanceId} style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 4 }}>
                      {field.label}{field.isRequired ? ' *' : ''}
                    </label>
                    <Controller
                      name={field.instanceId}
                      control={control}
                      rules={field.isRequired ? { required: `${field.label} is required` } : undefined}
                      render={({ field: f }) => {
                        const val = (f.value as string) ?? '';
                        if (field.fieldType === 'textarea' || field.fieldType === 'richtext') {
                          return <textarea {...f} value={val} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder={field.placeholder ?? ''} />;
                        }
                        if (field.fieldType === 'select' && field.optionsJson) {
                          return (
                            <select {...f} value={val} style={inputStyle}>
                              <option value="">Select...</option>
                              {field.optionsJson.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          );
                        }
                        if (field.fieldType === 'radio' && field.optionsJson) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {field.optionsJson.map((o) => (
                                <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                                  <input type="radio" name={field.instanceId} value={o.value} checked={val === o.value} onChange={() => f.onChange(o.value)} />
                                  {o.label}
                                </label>
                              ))}
                            </div>
                          );
                        }
                        if (field.fieldType === 'checkbox') {
                          return (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!f.value} onChange={(e) => f.onChange(e.target.checked)} />
                              <span style={{ fontSize: 14 }}>{field.placeholder || field.label}</span>
                            </label>
                          );
                        }
                        if (field.fieldType === 'date') {
                          return <input {...f} type="date" value={val} style={inputStyle} />;
                        }
                        if (field.fieldType === 'email') {
                          return <input {...f} type="email" value={val} placeholder={field.placeholder ?? ''} style={inputStyle} />;
                        }
                        if (field.fieldType === 'number') {
                          return <input {...f} type="number" value={val} placeholder={field.placeholder ?? ''} style={inputStyle} />;
                        }
                        return <input {...f} type="text" value={val} placeholder={field.placeholder ?? ''} style={inputStyle} />;
                      }}
                    />
                    {field.helpText && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>{field.helpText}</p>}
                    {errors[field.instanceId] && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>
                        {(errors[field.instanceId]?.message as string) ?? 'Required'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 8,
              border: 'none', backgroundColor: '#2563eb', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
