'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiFormTextbox,
  mdiPlus,
  mdiPencil,
  mdiArchive,
  mdiClose,
  mdiTrashCan,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType =
  | 'text' | 'textarea' | 'richtext' | 'number'
  | 'select' | 'multiselect' | 'radio' | 'checkbox'
  | 'date' | 'datetime' | 'email' | 'phone' | 'url'
  | 'file' | 'user_picker' | 'group_picker' | 'hidden';

type FieldStatus = 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';

interface FieldOption {
  label: string;
  value: string;
}

interface ValidationConfig {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  fieldType: FieldType;
  description: string | null;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  readOnly: boolean;
  options: FieldOption[] | null;
  validationConfig: ValidationConfig | null;
  status: FieldStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const FIELD_TYPES: FieldType[] = [
  'text', 'textarea', 'richtext', 'number',
  'select', 'multiselect', 'radio', 'checkbox',
  'date', 'datetime', 'email', 'phone', 'url',
  'file', 'user_picker', 'group_picker', 'hidden',
];

const OPTION_TYPES: FieldType[] = ['select', 'multiselect', 'radio'];
const TEXT_VALIDATION_TYPES: FieldType[] = ['text', 'textarea', 'email', 'phone', 'url'];

function generateKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, '')
    .replace(/[\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle = { display: 'block' as const, marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' };
const thStyle = { padding: '10px 14px', textAlign: 'left' as const, fontWeight: 600, color: 'var(--text-secondary)' };
const tdStyle = { padding: '10px 14px' };

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FieldStatus }) {
  const colors: Record<FieldStatus, { bg: string; color: string }> = {
    ACTIVE: { bg: 'var(--badge-green-bg, #dcfce7)', color: '#16a34a' },
    DEPRECATED: { bg: 'var(--badge-yellow-bg, #fef9c3)', color: '#ca8a04' },
    ARCHIVED: { bg: 'var(--bg-tertiary, #f3f4f6)', color: 'var(--text-muted, #9ca3af)' },
  };
  const c = colors[status] ?? colors.ACTIVE;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

function TypeBadge({ fieldType }: { fieldType: FieldType }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: 'var(--bg-tertiary, #f3f4f6)', color: 'var(--text-secondary)' }}>
      {fieldType}
    </span>
  );
}

// ─── Success Banner ───────────────────────────────────────────────────────────

function SuccessBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{ padding: '10px 16px', marginBottom: 16, backgroundColor: 'var(--badge-green-bg, #dcfce7)', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 2 }}>
        <Icon path={mdiClose} size={0.7} color="currentColor" />
      </button>
    </div>
  );
}

// ─── Field Definition Modal ───────────────────────────────────────────────────

function FieldDefinitionModal({
  field,
  onClose,
  onSaved,
}: {
  field: FieldDefinition | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!field;

  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState(field?.key ?? '');
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(isEdit);
  const [fieldType, setFieldType] = useState<FieldType>(field?.fieldType ?? 'text');
  const [description, setDescription] = useState(field?.description ?? '');
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? '');
  const [helpText, setHelpText] = useState(field?.helpText ?? '');
  const [required, setRequired] = useState(field?.required ?? false);
  const [readOnly, setReadOnly] = useState(field?.readOnly ?? false);
  const [options, setOptions] = useState<FieldOption[]>((field as any)?.optionsJson ?? (field as any)?.options ?? [{ label: '', value: '' }]);
  const [validationConfig, setValidationConfig] = useState<ValidationConfig>(field?.validationConfig ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showOptions = OPTION_TYPES.includes(fieldType);
  const showTextValidation = TEXT_VALIDATION_TYPES.includes(fieldType);
  const showNumberValidation = fieldType === 'number';

  // Auto-generate key from label
  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!keyManuallyEdited) {
      setKey(generateKey(val));
    }
  };

  const handleKeyChange = (val: string) => {
    setKeyManuallyEdited(true);
    setKey(val.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  };

  const handleAddOption = () => {
    setOptions([...options, { label: '', value: '' }]);
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, field: 'label' | 'value', val: string) => {
    const updated = [...options];
    updated[index] = { ...updated[index], [field]: val };
    setOptions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!label.trim()) { setError('Label is required.'); return; }
    if (!key.trim()) { setError('Key is required.'); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) { setError('Key must start with a letter and contain only lowercase letters, numbers, and underscores.'); return; }

    if (showOptions) {
      const validOptions = options.filter(o => o.label.trim() && o.value.trim());
      if (validOptions.length === 0) { setError('At least one option with label and value is required.'); return; }
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        label: label.trim(),
        fieldType,
        description: description.trim() || null,
        placeholder: placeholder.trim() || null,
        helpText: helpText.trim() || null,
        required,
        readOnly,
      };

      if (!isEdit) {
        body.key = key.trim();
      }

      if (showOptions) {
        body.optionsJson = options.filter(o => o.label.trim() && o.value.trim());
      } else {
        body.optionsJson = null;
      }

      if (showTextValidation || showNumberValidation) {
        const vc: ValidationConfig = {};
        if (showTextValidation) {
          if (validationConfig.minLength != null && validationConfig.minLength > 0) vc.minLength = validationConfig.minLength;
          if (validationConfig.maxLength != null && validationConfig.maxLength > 0) vc.maxLength = validationConfig.maxLength;
        }
        if (showNumberValidation) {
          if (validationConfig.min != null) vc.min = validationConfig.min;
          if (validationConfig.max != null) vc.max = validationConfig.max;
        }
        body.validationConfig = Object.keys(vc).length > 0 ? vc : null;
      } else {
        body.validationConfig = null;
      }

      const url = isEdit ? `/api/v1/field-definitions/${field.id}` : '/api/v1/field-definitions';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Failed to ${isEdit ? 'update' : 'create'} field definition`);
      }

      onSaved(isEdit ? `Field "${label.trim()}" updated successfully.` : `Field "${label.trim()}" created successfully.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 600, overflow: 'auto', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit Field Definition' : 'Create Field Definition'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Label */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fd-label" style={labelStyle}>Label *</label>
            <input id="fd-label" type="text" value={label} onChange={(e) => handleLabelChange(e.target.value)} required style={inputStyle} placeholder="e.g. Asset Tag Number" />
          </div>

          {/* Key */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fd-key" style={labelStyle}>Key *</label>
            <input
              id="fd-key"
              type="text"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              required
              readOnly={isEdit}
              style={{
                ...inputStyle,
                fontFamily: 'monospace',
                fontSize: 13,
                backgroundColor: isEdit ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                cursor: isEdit ? 'not-allowed' : 'text',
              }}
              placeholder="auto_generated_from_label"
            />
            {!isEdit && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
                Auto-generated from label. Used as the field identifier in forms and API.
              </span>
            )}
          </div>

          {/* Field Type */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fd-type" style={labelStyle}>Field Type *</label>
            <select id="fd-type" value={fieldType} onChange={(e) => setFieldType(e.target.value as FieldType)} style={inputStyle}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fd-desc" style={labelStyle}>Description</label>
            <textarea id="fd-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Internal description of this field" />
          </div>

          {/* Placeholder */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fd-placeholder" style={labelStyle}>Placeholder</label>
            <input id="fd-placeholder" type="text" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} style={inputStyle} placeholder="Placeholder text shown in the input" />
          </div>

          {/* Help Text */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fd-help" style={labelStyle}>Help Text</label>
            <input id="fd-help" type="text" value={helpText} onChange={(e) => setHelpText(e.target.value)} style={inputStyle} placeholder="Hint shown below the field" />
          </div>

          {/* Toggles row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)' }} />
              Required
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)' }} />
              Read Only
            </label>
          </div>

          {/* Options (for select/multiselect/radio) */}
          {showOptions && (
            <div style={{ marginBottom: 20, padding: 16, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Options *</label>
              {options.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => handleOptionChange(idx, 'label', e.target.value)}
                    placeholder="Label"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="text"
                    value={opt.value}
                    onChange={(e) => handleOptionChange(idx, 'value', e.target.value)}
                    placeholder="Value"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    disabled={options.length <= 1}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '6px 8px', border: '1px solid #fecaca', borderRadius: 6,
                      cursor: options.length <= 1 ? 'not-allowed' : 'pointer',
                      backgroundColor: 'var(--bg-primary)', color: options.length <= 1 ? 'var(--text-muted)' : '#dc2626',
                      opacity: options.length <= 1 ? 0.4 : 1,
                    }}
                  >
                    <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddOption}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', marginTop: 4 }}
              >
                <Icon path={mdiPlus} size={0.6} color="currentColor" />
                Add Option
              </button>
            </div>
          )}

          {/* Text Validation Config */}
          {showTextValidation && (
            <div style={{ marginBottom: 20, padding: 16, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Validation</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="fd-minlen" style={{ ...labelStyle, fontSize: 12 }}>Min Length</label>
                  <input
                    id="fd-minlen"
                    type="number"
                    min={0}
                    value={validationConfig.minLength ?? ''}
                    onChange={(e) => setValidationConfig({ ...validationConfig, minLength: e.target.value ? Number(e.target.value) : undefined })}
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="fd-maxlen" style={{ ...labelStyle, fontSize: 12 }}>Max Length</label>
                  <input
                    id="fd-maxlen"
                    type="number"
                    min={0}
                    value={validationConfig.maxLength ?? ''}
                    onChange={(e) => setValidationConfig({ ...validationConfig, maxLength: e.target.value ? Number(e.target.value) : undefined })}
                    style={inputStyle}
                    placeholder="No limit"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Number Validation Config */}
          {showNumberValidation && (
            <div style={{ marginBottom: 20, padding: 16, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Validation</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="fd-min" style={{ ...labelStyle, fontSize: 12 }}>Min Value</label>
                  <input
                    id="fd-min"
                    type="number"
                    value={validationConfig.min ?? ''}
                    onChange={(e) => setValidationConfig({ ...validationConfig, min: e.target.value ? Number(e.target.value) : undefined })}
                    style={inputStyle}
                    placeholder="No min"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="fd-max" style={{ ...labelStyle, fontSize: 12 }}>Max Value</label>
                  <input
                    id="fd-max"
                    type="number"
                    value={validationConfig.max ?? ''}
                    onChange={(e) => setValidationConfig({ ...validationConfig, max: e.target.value ? Number(e.target.value) : undefined })}
                    style={inputStyle}
                    placeholder="No max"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Field Library Page ───────────────────────────────────────────────────────

export default function FieldLibrarySettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editField, setEditField] = useState<FieldDefinition | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<FieldDefinition[]>({
    queryKey: ['settings-field-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/v1/field-definitions', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load field definitions');
      const json = await res.json();
      return Array.isArray(json) ? json : json.fieldDefinitions ?? json.data ?? [];
    },
  });

  const handleArchive = async (field: FieldDefinition) => {
    if (!window.confirm(`Archive field "${field.label}"? It will no longer be available for new forms.`)) return;
    try {
      const res = await fetch(`/api/v1/field-definitions/${field.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to archive field');
      }
      setSuccessMsg(`Field "${field.label}" archived.`);
      void qc.invalidateQueries({ queryKey: ['settings-field-definitions'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive field');
    }
  };

  const handleSaved = useCallback((msg: string) => {
    setSuccessMsg(msg);
    void qc.invalidateQueries({ queryKey: ['settings-field-definitions'] });
  }, [qc]);

  const dismissSuccess = useCallback(() => setSuccessMsg(null), []);

  const fields = data ?? [];

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiFormTextbox} size={1} color="#6366f1" />
          Field Library
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditField(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Create Field
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <p style={{ margin: '0 0 20px 0', fontSize: 14, color: 'var(--text-muted)', paddingLeft: 34 }}>
        Reusable field definitions for custom forms
      </p>

      {/* Success Banner */}
      {successMsg && <SuccessBanner message={successMsg} onDismiss={dismissSuccess} />}

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading field definitions...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={thStyle}>Key</th>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Version</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 13, color: 'var(--text-secondary)' }}>{field.key}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{field.label}</td>
                  <td style={tdStyle}><TypeBadge fieldType={field.fieldType} /></td>
                  <td style={tdStyle}><StatusBadge status={field.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 13 }}>v{field.version}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditField(field); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      {field.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => void handleArchive(field)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                        >
                          <Icon path={mdiArchive} size={0.65} color="currentColor" />
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {fields.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                    No field definitions found. Create your first field to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <FieldDefinitionModal
          field={editField}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
