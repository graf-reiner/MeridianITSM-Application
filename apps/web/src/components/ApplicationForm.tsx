'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiApplicationCog,
  mdiAlertCircle,
  mdiContentSave,
  mdiArrowLeft,
} from '@mdi/js';

// ─── Enum options (must match server createApp/updateApp accepted values) ─────

const TYPE_OPTIONS = ['WEB', 'DESKTOP', 'MOBILE', 'SERVICE', 'DATABASE', 'OTHER'] as const;
const STATUS_OPTIONS = [
  'ACTIVE',
  'IN_DEVELOPMENT',
  'INACTIVE',
  'DEPRECATED',
  'DECOMMISSIONED',
] as const;
const CRITICALITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const HOSTING_MODEL_OPTIONS = ['ON_PREMISE', 'CLOUD', 'SAAS', 'HYBRID'] as const;
const LIFECYCLE_OPTIONS = [
  'PLAN',
  'BUILD',
  'RUN',
  'IMPROVE',
  'RETIRE',
] as const;
const DATA_CLASSIFICATION_OPTIONS = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplicationFormValues {
  name: string;
  type: string;
  status: string;
  criticality: string;
  description: string;
  hostingModel: string;
  lifecycleStage: string;
  annualCost: string; // string in form state to handle empty input cleanly
  rpo: string;
  rto: string;
  strategicRating: string;
  authMethod: string;
  dataClassification: string;
  techStack: string; // comma-separated
  vendorContact: string;
  licenseInfo: string;
  supportNotes: string;
  specialNotes: string;
  osRequirements: string;
}

const EMPTY: ApplicationFormValues = {
  name: '',
  type: 'WEB',
  status: 'ACTIVE',
  criticality: 'MEDIUM',
  description: '',
  hostingModel: '',
  lifecycleStage: '',
  annualCost: '',
  rpo: '',
  rto: '',
  strategicRating: '',
  authMethod: '',
  dataClassification: '',
  techStack: '',
  vendorContact: '',
  licenseInfo: '',
  supportNotes: '',
  specialNotes: '',
  osRequirements: '',
};

interface ApplicationFormProps {
  mode: 'create' | 'edit';
  applicationId?: string;
  initial?: Partial<ApplicationFormValues>;
}

// ─── Styles (mirrors detail page inline-style conventions) ────────────────────

const sectionStyle: CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 12,
  marginBottom: 16,
  overflow: 'hidden',
};

const sectionHeaderStyle: CSSProperties = {
  padding: '12px 18px',
  borderBottom: '1px solid var(--border-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'var(--bg-secondary)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-secondary)',
  borderRadius: 7,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const requiredMark: CSSProperties = { color: 'var(--accent-danger)', marginLeft: 2 };

// ─── Section card ─────────────────────────────────────────────────────────────

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        {icon && <Icon path={icon} size={0.85} color="var(--accent-primary)" />}
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

// ─── Build the JSON body for the API call ────────────────────────────────────
//
// The server only accepts strings / numbers / arrays (see
// apps/api/src/routes/v1/applications/index.ts POST and PUT routes). Empty
// strings are dropped so optional selects that were left blank don't overwrite
// existing values or send invalid enum payloads on create.

function buildBody(v: ApplicationFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: v.name.trim(),
    type: v.type,
    status: v.status,
    criticality: v.criticality,
  };

  if (v.description.trim()) body.description = v.description.trim();
  if (v.hostingModel) body.hostingModel = v.hostingModel;
  if (v.lifecycleStage) body.lifecycleStage = v.lifecycleStage;
  if (v.authMethod.trim()) body.authMethod = v.authMethod.trim();
  if (v.dataClassification) body.dataClassification = v.dataClassification;
  if (v.vendorContact.trim()) body.vendorContact = v.vendorContact.trim();
  if (v.licenseInfo.trim()) body.licenseInfo = v.licenseInfo.trim();
  if (v.supportNotes.trim()) body.supportNotes = v.supportNotes.trim();
  if (v.specialNotes.trim()) body.specialNotes = v.specialNotes.trim();
  if (v.osRequirements.trim()) body.osRequirements = v.osRequirements.trim();

  // Numeric fields — only send if a valid number was entered.
  const annualCost = parseFloat(v.annualCost);
  if (!Number.isNaN(annualCost)) body.annualCost = annualCost;
  const rpo = parseInt(v.rpo, 10);
  if (!Number.isNaN(rpo)) body.rpo = rpo;
  const rto = parseInt(v.rto, 10);
  if (!Number.isNaN(rto)) body.rto = rto;
  const strategicRating = parseInt(v.strategicRating, 10);
  if (!Number.isNaN(strategicRating)) body.strategicRating = strategicRating;

  // Tech stack — comma-separated → trimmed array (only if non-empty).
  const techStack = v.techStack
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (techStack.length > 0) body.techStack = techStack;

  return body;
}

// ─── Main form ────────────────────────────────────────────────────────────────

export default function ApplicationForm({
  mode,
  applicationId,
  initial,
}: ApplicationFormProps) {
  const router = useRouter();
  const qc = useQueryClient();

  const [values, setValues] = useState<ApplicationFormValues>(() => ({
    ...EMPTY,
    ...initial,
  }));
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof ApplicationFormValues>(
    key: K,
    value: ApplicationFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url =
        mode === 'create'
          ? '/api/v1/applications'
          : `/api/v1/applications/${applicationId}`;
      const method = mode === 'create' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error ??
            (res.status === 403
              ? 'You do not have permission to modify applications.'
              : `Request failed with status ${res.status}`),
        );
      }
      return (await res.json()) as { id: string };
    },
    onSuccess: async (data) => {
      const targetId = mode === 'create' ? data.id : applicationId!;
      await qc.invalidateQueries({ queryKey: ['application', targetId] });
      await qc.invalidateQueries({ queryKey: ['applications'] });
      router.push(`/dashboard/applications/${targetId}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError('Name is required');
      return;
    }
    mutation.mutate(buildBody(values));
  };

  const cancelHref =
    mode === 'edit' && applicationId
      ? `/dashboard/applications/${applicationId}`
      : '/dashboard/applications';

  const saving = mutation.isPending;

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <Icon path={mdiApplicationCog} size={1.1} color="var(--accent-primary)" />
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            flex: 1,
          }}
        >
          {mode === 'create' ? 'New Application' : 'Edit Application'}
        </h1>
      </div>

      {/* Identity & classification */}
      <FormSection title="Identity & Classification" icon={mdiApplicationCog}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>
              Name<span style={requiredMark}>*</span>
            </label>
            <input
              type="text"
              value={values.name}
              onChange={(e) => setField('name', e.target.value)}
              required
              autoFocus
              style={inputStyle}
              placeholder="e.g. Customer Portal"
            />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select
              value={values.type}
              onChange={(e) => setField('type', e.target.value)}
              style={inputStyle}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={values.status}
              onChange={(e) => setField('status', e.target.value)}
              style={inputStyle}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Criticality</label>
            <select
              value={values.criticality}
              onChange={(e) => setField('criticality', e.target.value)}
              style={inputStyle}
            >
              {CRITICALITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={values.description}
              onChange={(e) => setField('description', e.target.value)}
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              placeholder="What does this application do?"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Tech Stack</label>
            <input
              type="text"
              value={values.techStack}
              onChange={(e) => setField('techStack', e.target.value)}
              style={inputStyle}
              placeholder="Comma-separated, e.g. React, Node.js, PostgreSQL"
            />
          </div>
        </div>
      </FormSection>

      {/* Operational */}
      <FormSection title="Operational">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Hosting Model</label>
            <select
              value={values.hostingModel}
              onChange={(e) => setField('hostingModel', e.target.value)}
              style={inputStyle}
            >
              <option value="">—</option>
              {HOSTING_MODEL_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Lifecycle Stage</label>
            <select
              value={values.lifecycleStage}
              onChange={(e) => setField('lifecycleStage', e.target.value)}
              style={inputStyle}
            >
              <option value="">—</option>
              {LIFECYCLE_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Annual Cost (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.annualCost}
              onChange={(e) => setField('annualCost', e.target.value)}
              style={inputStyle}
              placeholder="e.g. 12000"
            />
          </div>
          <div>
            <label style={labelStyle}>RPO (minutes)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={values.rpo}
              onChange={(e) => setField('rpo', e.target.value)}
              style={inputStyle}
              placeholder="Recovery point objective"
            />
          </div>
          <div>
            <label style={labelStyle}>RTO (minutes)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={values.rto}
              onChange={(e) => setField('rto', e.target.value)}
              style={inputStyle}
              placeholder="Recovery time objective"
            />
          </div>
          <div>
            <label style={labelStyle}>Strategic Rating (1–5)</label>
            <input
              type="number"
              min="1"
              max="5"
              step="1"
              value={values.strategicRating}
              onChange={(e) => setField('strategicRating', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </FormSection>

      {/* Security & support */}
      <FormSection title="Security & Support">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Auth Method</label>
            <input
              type="text"
              value={values.authMethod}
              onChange={(e) => setField('authMethod', e.target.value)}
              style={inputStyle}
              placeholder="e.g. SAML, OIDC, LDAP"
            />
          </div>
          <div>
            <label style={labelStyle}>Data Classification</label>
            <select
              value={values.dataClassification}
              onChange={(e) => setField('dataClassification', e.target.value)}
              style={inputStyle}
            >
              <option value="">—</option>
              {DATA_CLASSIFICATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Vendor Contact</label>
            <input
              type="text"
              value={values.vendorContact}
              onChange={(e) => setField('vendorContact', e.target.value)}
              style={inputStyle}
              placeholder="support@vendor.com / +1 555 0100"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>OS Requirements</label>
            <input
              type="text"
              value={values.osRequirements}
              onChange={(e) => setField('osRequirements', e.target.value)}
              style={inputStyle}
              placeholder="e.g. Windows Server 2019+"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>License Info</label>
            <textarea
              value={values.licenseInfo}
              onChange={(e) => setField('licenseInfo', e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              placeholder="License type, key, seat count, renewal date…"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Support Notes (runbook narrative)</label>
            <textarea
              value={values.supportNotes}
              onChange={(e) => setField('supportNotes', e.target.value)}
              style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
              placeholder="Operational notes, runbook steps, common troubleshooting…"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Special Notes</label>
            <textarea
              value={values.specialNotes}
              onChange={(e) => setField('specialNotes', e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              placeholder='Quirks like "Requires Java 11" or "Only supports Windows 10+"'
            />
          </div>
        </div>
      </FormSection>

      {/* Error display */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--badge-red-bg-subtle)',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: 'var(--accent-danger)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Icon path={mdiAlertCircle} size={0.8} color="currentColor" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          marginBottom: 40,
        }}
      >
        <Link
          href={cancelHref}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 16px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 8,
            fontSize: 13,
            textDecoration: 'none',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          <Icon path={mdiArrowLeft} size={0.75} color="currentColor" />
          Cancel
        </Link>
        <button
          type="submit"
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            backgroundColor: saving ? '#a5b4fc' : 'var(--accent-primary)',
            color: 'var(--bg-primary)',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          <Icon path={mdiContentSave} size={0.8} color="currentColor" />
          {saving
            ? mode === 'create'
              ? 'Creating…'
              : 'Saving…'
            : mode === 'create'
              ? 'Create Application'
              : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
