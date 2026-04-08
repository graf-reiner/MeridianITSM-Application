'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiContentSave,
  mdiEye,
  mdiPublish,
  mdiPublishOff,
  mdiPlus,
  mdiClose,
  mdiChevronUp,
  mdiChevronDown,
  mdiTrashCan,
  mdiDragVertical,
  mdiFormSelect,
  mdiAlertCircleOutline,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldType =
  | 'text' | 'textarea' | 'richtext' | 'number'
  | 'select' | 'multiselect' | 'radio' | 'checkbox'
  | 'date' | 'datetime' | 'email' | 'phone' | 'url'
  | 'file' | 'user_picker' | 'group_picker' | 'hidden';

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
  options: { label: string; value: string }[] | null;
  status: string;
}

interface FieldInstance {
  instanceId: string;
  fieldDefinitionId: string;
  key: string;
  label: string;
  fieldType: FieldType;
  labelOverride: string | null;
  placeholderOverride: string | null;
  helpTextOverride: string | null;
  requiredOverride: boolean | null;
}

interface FormSection {
  id: string;
  title: string;
  description: string;
  fields: FieldInstance[];
  collapsed: boolean;
}

interface FieldMapping {
  title: string | null;
  description: string | null;
  priority: string | null;
  category: string | null;
  type: string | null;
  titleTemplate: string;
  descriptionTemplate: string;
}

type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'in' | 'is_not_empty' | 'is_empty';
type ConditionAction = 'show' | 'hide';

interface FormCondition {
  id: string;
  parentFieldInstanceId: string;
  operator: ConditionOperator;
  value: string;
  action: ConditionAction;
  targetFieldInstanceId: string;
}

interface FormSettings {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  ticketType: 'SERVICE_REQUEST' | 'INCIDENT' | 'PROBLEM';
  defaultPriority: string;
  defaultQueueId: string;
  defaultCategoryId: string;
  defaultSlaId: string;
  defaultTags: string;
  showInPortal: boolean;
  requireAuth: boolean;
}

interface CustomFormData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: 'DRAFT' | 'PUBLISHED';
  ticketType: string;
  defaultPriority: string | null;
  defaultQueueId: string | null;
  defaultCategoryId: string | null;
  defaultSlaId: string | null;
  defaultTags: string[] | null;
  showInPortal: boolean;
  requireAuth: boolean;
  layoutJson: FormSection[] | null;
  mappingJson: FieldMapping | null;
  conditionsJson: FormCondition[] | null;
}

interface SelectOption {
  id: string;
  name: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' };
const btnOutline: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' };
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', backgroundColor: 'var(--accent-primary)', color: '#fff' };
const cardStyle: React.CSSProperties = { backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, marginBottom: 12 };

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'DRAFT' | 'PUBLISHED' }) {
  const styles: Record<string, { bg: string; color: string }> = {
    DRAFT: { bg: 'var(--badge-yellow-bg, #fef9c3)', color: '#ca8a04' },
    PUBLISHED: { bg: 'var(--badge-green-bg, #dcfce7)', color: '#16a34a' },
  };
  const c = styles[status] ?? styles.DRAFT;
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

function TypeBadge({ fieldType }: { fieldType: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, backgroundColor: 'var(--bg-tertiary, #f3f4f6)', color: 'var(--text-muted)' }}>
      {fieldType}
    </span>
  );
}

// ─── Success / Error Banners ──────────────────────────────────────────────────

function SuccessBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div style={{ padding: '10px 16px', marginBottom: 12, backgroundColor: 'var(--badge-green-bg, #dcfce7)', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 2 }}>
        <Icon path={mdiClose} size={0.7} color="currentColor" />
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ padding: '10px 16px', marginBottom: 12, backgroundColor: 'var(--badge-red-bg-subtle, #fef2f2)', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon path={mdiAlertCircleOutline} size={0.8} color="currentColor" />
      <span>{message}</span>
    </div>
  );
}

// ─── Field Picker Modal ──────────────────────────────────────────────────────

function FieldPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (field: FieldDefinition) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<FieldDefinition[]>({
    queryKey: ['field-definitions-picker'],
    queryFn: async () => {
      const res = await fetch('/api/v1/field-definitions', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load field definitions');
      const json = await res.json();
      const arr = Array.isArray(json) ? json : json.fieldDefinitions ?? json.data ?? [];
      return arr.filter((f: FieldDefinition) => f.status === 'ACTIVE');
    },
  });

  const fields = data ?? [];
  const filtered = search
    ? fields.filter(f => f.label.toLowerCase().includes(search.toLowerCase()) || f.key.toLowerCase().includes(search.toLowerCase()))
    : fields;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 520, overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Add Field from Library</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
          <input
            type="text"
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Field list */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading fields...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              {search ? 'No fields match your search.' : 'No active fields in the library. Create fields in the Field Library first.'}
            </div>
          ) : (
            filtered.map((field) => (
              <button
                key={field.id}
                onClick={() => { onSelect(field); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 20px',
                  border: 'none', borderBottom: '1px solid var(--border-secondary)', cursor: 'pointer',
                  backgroundColor: 'var(--bg-primary)', textAlign: 'left', color: 'var(--text-primary)',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-secondary)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-primary)'; }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{field.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{field.key}</div>
                </div>
                <TypeBadge fieldType={field.fieldType} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ───────────────────────────────────────────────────────────

function PreviewModal({
  sections,
  formName,
  onClose,
}: {
  sections: FormSection[];
  formName: string;
  onClose: () => void;
}) {
  const renderFieldPreview = (field: FieldInstance) => {
    const label = field.labelOverride || field.label;
    const placeholder = field.placeholderOverride || '';
    const helpText = field.helpTextOverride || '';
    const isRequired = field.requiredOverride ?? false;

    return (
      <div key={field.instanceId} style={{ marginBottom: 16 }}>
        <label style={labelStyle}>
          {label}{isRequired && <span style={{ color: '#dc2626' }}> *</span>}
        </label>
        {(field.fieldType === 'text' || field.fieldType === 'email' || field.fieldType === 'phone' || field.fieldType === 'url') && (
          <input type="text" disabled placeholder={placeholder || label} style={{ ...inputStyle, opacity: 0.7 }} />
        )}
        {field.fieldType === 'textarea' && (
          <textarea disabled placeholder={placeholder || label} rows={3} style={{ ...inputStyle, resize: 'vertical', opacity: 0.7 }} />
        )}
        {field.fieldType === 'richtext' && (
          <div style={{ ...inputStyle, minHeight: 80, opacity: 0.7, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>Rich text editor</div>
        )}
        {field.fieldType === 'number' && (
          <input type="number" disabled placeholder={placeholder || '0'} style={{ ...inputStyle, opacity: 0.7 }} />
        )}
        {(field.fieldType === 'select' || field.fieldType === 'multiselect') && (
          <select disabled style={{ ...inputStyle, opacity: 0.7 }}><option>{placeholder || `Select ${label}...`}</option></select>
        )}
        {field.fieldType === 'radio' && (
          <div style={{ opacity: 0.7, display: 'flex', gap: 16, paddingTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-primary)' }}><input type="radio" disabled /> Option 1</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-primary)' }}><input type="radio" disabled /> Option 2</label>
          </div>
        )}
        {field.fieldType === 'checkbox' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-primary)', opacity: 0.7, paddingTop: 4 }}>
            <input type="checkbox" disabled style={{ width: 16, height: 16 }} />
            {label}
          </label>
        )}
        {(field.fieldType === 'date' || field.fieldType === 'datetime') && (
          <input type={field.fieldType === 'datetime' ? 'datetime-local' : 'date'} disabled style={{ ...inputStyle, opacity: 0.7 }} />
        )}
        {field.fieldType === 'file' && (
          <input type="file" disabled style={{ ...inputStyle, opacity: 0.7, padding: '6px 10px' }} />
        )}
        {(field.fieldType === 'user_picker' || field.fieldType === 'group_picker') && (
          <select disabled style={{ ...inputStyle, opacity: 0.7 }}><option>Select {field.fieldType === 'user_picker' ? 'user' : 'group'}...</option></select>
        )}
        {field.fieldType === 'hidden' && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Hidden field (not visible to users)</div>
        )}
        {helpText && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{helpText}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 640, overflow: 'auto', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Preview: {formName}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>

        {/* Preview content */}
        <div style={{ padding: 24 }}>
          {sections.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No sections to preview.</div>
          ) : (
            sections.map((section) => (
              <div key={section.id} style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{section.title}</h3>
                {section.description && (
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>{section.description}</p>
                )}
                {section.fields.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>No fields in this section.</div>
                ) : (
                  section.fields.map(renderFieldPreview)
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form Canvas Section ─────────────────────────────────────────────────────

function CanvasSection({
  section,
  sectionIndex,
  selectedFieldId,
  onSelectField,
  onUpdateTitle,
  onUpdateDescription,
  onToggleCollapse,
  onRemoveSection,
  onAddField,
  onRemoveField,
  onMoveField,
}: {
  section: FormSection;
  sectionIndex: number;
  selectedFieldId: string | null;
  onSelectField: (instanceId: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateDescription: (id: string, desc: string) => void;
  onToggleCollapse: (id: string) => void;
  onRemoveSection: (id: string) => void;
  onAddField: (sectionId: string) => void;
  onRemoveField: (sectionId: string, instanceId: string) => void;
  onMoveField: (sectionId: string, instanceId: string, direction: 'up' | 'down') => void;
}) {
  return (
    <div style={cardStyle}>
      {/* Section header */}
      <div style={{ padding: '12px 16px', borderBottom: section.collapsed ? 'none' : '1px solid var(--border-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onToggleCollapse(section.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
          title={section.collapsed ? 'Expand section' : 'Collapse section'}
        >
          <Icon path={section.collapsed ? mdiChevronDown : mdiChevronUp} size={0.8} color="currentColor" />
        </button>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdateTitle(section.id, e.target.value)}
            placeholder="Section Title"
            style={{ border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', backgroundColor: 'transparent', width: '100%', padding: 0 }}
          />
          <input
            type="text"
            value={section.description}
            onChange={(e) => onUpdateDescription(section.id, e.target.value)}
            placeholder="Section description (optional)"
            style={{ border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-muted)', backgroundColor: 'transparent', width: '100%', padding: 0, marginTop: 2 }}
          />
        </div>
        <button
          onClick={() => onRemoveSection(section.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}
          title="Remove section"
        >
          <Icon path={mdiTrashCan} size={0.7} color="currentColor" />
        </button>
      </div>

      {/* Fields */}
      {!section.collapsed && (
        <div style={{ padding: '8px 16px 12px' }}>
          {section.fields.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No fields in this section. Click "Add Field" below.
            </div>
          ) : (
            section.fields.map((field, fieldIndex) => (
              <div
                key={field.instanceId}
                onClick={() => onSelectField(field.instanceId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 4,
                  borderRadius: 6, cursor: 'pointer',
                  border: selectedFieldId === field.instanceId ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
                  backgroundColor: selectedFieldId === field.instanceId ? 'rgba(99,102,241,0.05)' : 'var(--bg-secondary)',
                }}
              >
                <Icon path={mdiDragVertical} size={0.7} color="var(--text-muted)" />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {field.labelOverride || field.label}
                  </span>
                  <TypeBadge fieldType={field.fieldType} />
                  {field.requiredOverride && <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 4 }}>*</span>}
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveField(section.id, field.instanceId, 'up'); }}
                    disabled={fieldIndex === 0}
                    style={{ background: 'none', border: 'none', cursor: fieldIndex === 0 ? 'not-allowed' : 'pointer', color: fieldIndex === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', padding: 2, opacity: fieldIndex === 0 ? 0.3 : 1, display: 'flex' }}
                    title="Move up"
                  >
                    <Icon path={mdiChevronUp} size={0.7} color="currentColor" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveField(section.id, field.instanceId, 'down'); }}
                    disabled={fieldIndex === section.fields.length - 1}
                    style={{ background: 'none', border: 'none', cursor: fieldIndex === section.fields.length - 1 ? 'not-allowed' : 'pointer', color: fieldIndex === section.fields.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)', padding: 2, opacity: fieldIndex === section.fields.length - 1 ? 0.3 : 1, display: 'flex' }}
                    title="Move down"
                  >
                    <Icon path={mdiChevronDown} size={0.7} color="currentColor" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveField(section.id, field.instanceId); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2, display: 'flex' }}
                    title="Remove field"
                  >
                    <Icon path={mdiClose} size={0.65} color="currentColor" />
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            onClick={() => onAddField(section.id)}
            style={{ ...btnOutline, marginTop: 8, fontSize: 12, padding: '6px 12px' }}
          >
            <Icon path={mdiPlus} size={0.6} color="currentColor" />
            Add Field
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Config Panel Tabs ───────────────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 0', border: 'none', borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
        cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)', backgroundColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}

// ─── Fields Config Tab ───────────────────────────────────────────────────────

function FieldsConfigTab({
  selectedField,
  onUpdateField,
}: {
  selectedField: FieldInstance | null;
  onUpdateField: (instanceId: string, updates: Partial<FieldInstance>) => void;
}) {
  if (!selectedField) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Select a field in the canvas to configure it.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Field definition info */}
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Field Definition</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{selectedField.label}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{selectedField.key}</span>
          <TypeBadge fieldType={selectedField.fieldType} />
        </div>
      </div>

      {/* Label Override */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Label Override</label>
        <input
          type="text"
          value={selectedField.labelOverride ?? ''}
          onChange={(e) => onUpdateField(selectedField.instanceId, { labelOverride: e.target.value || null })}
          placeholder={selectedField.label}
          style={inputStyle}
        />
      </div>

      {/* Placeholder Override */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Placeholder Override</label>
        <input
          type="text"
          value={selectedField.placeholderOverride ?? ''}
          onChange={(e) => onUpdateField(selectedField.instanceId, { placeholderOverride: e.target.value || null })}
          placeholder="Override placeholder text"
          style={inputStyle}
        />
      </div>

      {/* Help Text Override */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Help Text Override</label>
        <input
          type="text"
          value={selectedField.helpTextOverride ?? ''}
          onChange={(e) => onUpdateField(selectedField.instanceId, { helpTextOverride: e.target.value || null })}
          placeholder="Override help text"
          style={inputStyle}
        />
      </div>

      {/* Required Override */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
        <input
          type="checkbox"
          checked={selectedField.requiredOverride ?? false}
          onChange={(e) => onUpdateField(selectedField.instanceId, { requiredOverride: e.target.checked })}
          style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)' }}
        />
        Required
      </label>
    </div>
  );
}

// ─── Mapping Config Tab ──────────────────────────────────────────────────────

function MappingConfigTab({
  mapping,
  allFields,
  onUpdateMapping,
}: {
  mapping: FieldMapping;
  allFields: FieldInstance[];
  onUpdateMapping: (updates: Partial<FieldMapping>) => void;
}) {
  const selectFields = allFields.filter(f => ['select', 'multiselect', 'radio'].includes(f.fieldType));

  const renderMappingSelect = (label: string, field: keyof FieldMapping, restrictToSelect?: boolean) => {
    const options = restrictToSelect ? selectFields : allFields;
    const value = mapping[field] as string | null;
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{label}</label>
        <select
          value={value ?? ''}
          onChange={(e) => onUpdateMapping({ [field]: e.target.value || null })}
          style={inputStyle}
        >
          <option value="">-- Not mapped --</option>
          {options.map((f) => (
            <option key={f.instanceId} value={f.instanceId}>{f.labelOverride || f.label} ({f.key})</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Map form fields to ticket fields. Unmapped fields will be stored in ticket custom fields.
      </div>

      {renderMappingSelect('Title', 'title')}
      {renderMappingSelect('Description', 'description')}
      {renderMappingSelect('Priority', 'priority', true)}
      {renderMappingSelect('Category', 'category', true)}
      {renderMappingSelect('Type', 'type', true)}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Title Template</label>
        <input
          type="text"
          value={mapping.titleTemplate}
          onChange={(e) => onUpdateMapping({ titleTemplate: e.target.value })}
          placeholder="e.g. {{field_key}} request"
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
          Use {'{{field_key}}'} to insert field values
        </span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Description Template</label>
        <textarea
          value={mapping.descriptionTemplate}
          onChange={(e) => onUpdateMapping({ descriptionTemplate: e.target.value })}
          placeholder={'Submitted from {{form_name}}\\n{{submission_summary}}'}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

// ─── Conditions Config Tab ───────────────────────────────────────────────────

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'in (comma-separated)' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'is_empty', label: 'is empty' },
];

function ConditionsConfigTab({
  conditions,
  allFields,
  onUpdateConditions,
}: {
  conditions: FormCondition[];
  allFields: FieldInstance[];
  onUpdateConditions: (conditions: FormCondition[]) => void;
}) {
  const hideValueOperators: ConditionOperator[] = ['is_not_empty', 'is_empty'];

  const addCondition = () => {
    const newCondition: FormCondition = {
      id: crypto.randomUUID(),
      parentFieldInstanceId: allFields[0]?.instanceId ?? '',
      operator: 'equals',
      value: '',
      action: 'show',
      targetFieldInstanceId: allFields[0]?.instanceId ?? '',
    };
    onUpdateConditions([...conditions, newCondition]);
  };

  const updateCondition = (id: string, updates: Partial<FormCondition>) => {
    onUpdateConditions(conditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCondition = (id: string) => {
    onUpdateConditions(conditions.filter(c => c.id !== id));
  };

  return (
    <div style={{ padding: 16 }}>
      {conditions.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No conditions configured. Add conditions to show/hide fields based on user input.
        </div>
      ) : (
        conditions.map((cond) => (
          <div key={cond.id} style={{ marginBottom: 12, padding: 12, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>When</span>
              <select
                value={cond.parentFieldInstanceId}
                onChange={(e) => updateCondition(cond.id, { parentFieldInstanceId: e.target.value })}
                style={{ ...inputStyle, width: 'auto', flex: 1, fontSize: 12, padding: '4px 6px' }}
              >
                <option value="">-- Select field --</option>
                {allFields.map(f => (
                  <option key={f.instanceId} value={f.instanceId}>{f.labelOverride || f.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
              <select
                value={cond.operator}
                onChange={(e) => updateCondition(cond.id, { operator: e.target.value as ConditionOperator })}
                style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '4px 6px' }}
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {!hideValueOperators.includes(cond.operator) && (
                <input
                  type="text"
                  value={cond.value}
                  onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                  placeholder={cond.operator === 'in' ? 'val1, val2, val3' : 'value'}
                  style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '4px 6px' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <select
                value={cond.action}
                onChange={(e) => updateCondition(cond.id, { action: e.target.value as ConditionAction })}
                style={{ ...inputStyle, width: 'auto', fontSize: 12, padding: '4px 6px' }}
              >
                <option value="show">Show</option>
                <option value="hide">Hide</option>
              </select>
              <select
                value={cond.targetFieldInstanceId}
                onChange={(e) => updateCondition(cond.id, { targetFieldInstanceId: e.target.value })}
                style={{ ...inputStyle, width: 'auto', flex: 1, fontSize: 12, padding: '4px 6px' }}
              >
                <option value="">-- Target field --</option>
                {allFields.map(f => (
                  <option key={f.instanceId} value={f.instanceId}>{f.labelOverride || f.label}</option>
                ))}
              </select>
              <button
                onClick={() => removeCondition(cond.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, display: 'flex' }}
                title="Remove condition"
              >
                <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
              </button>
            </div>
          </div>
        ))
      )}

      <button onClick={addCondition} style={{ ...btnOutline, fontSize: 12, padding: '6px 12px', marginTop: 4 }}>
        <Icon path={mdiPlus} size={0.6} color="currentColor" />
        Add Condition
      </button>
    </div>
  );
}

// ─── Settings Config Tab ─────────────────────────────────────────────────────

function SettingsConfigTab({
  settings,
  onUpdateSettings,
}: {
  settings: FormSettings;
  onUpdateSettings: (updates: Partial<FormSettings>) => void;
}) {
  // Fetch queues, categories, SLAs
  const { data: queues } = useQuery<SelectOption[]>({
    queryKey: ['settings-queues'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? json.data ?? [];
    },
  });

  const { data: categories } = useQuery<SelectOption[]>({
    queryKey: ['settings-categories'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? json.data ?? [];
    },
  });

  const { data: slas } = useQuery<SelectOption[]>({
    queryKey: ['settings-slas'],
    queryFn: async () => {
      const res = await fetch('/api/v1/sla', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.slas ?? json.data ?? [];
    },
  });

  return (
    <div style={{ padding: 16 }}>
      {/* Name */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Name</label>
        <input type="text" value={settings.name} onChange={(e) => onUpdateSettings({ name: e.target.value })} style={inputStyle} />
      </div>

      {/* Slug */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Slug</label>
        <input type="text" value={settings.slug} onChange={(e) => onUpdateSettings({ slug: e.target.value })} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }} />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Description</label>
        <textarea value={settings.description} onChange={(e) => onUpdateSettings({ description: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      {/* Icon */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Icon (MDI path)</label>
        <input type="text" value={settings.icon} onChange={(e) => onUpdateSettings({ icon: e.target.value })} placeholder="e.g. mdiFormSelect" style={inputStyle} />
      </div>

      {/* Color */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Color</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={settings.color || '#6366f1'} onChange={(e) => onUpdateSettings({ color: e.target.value })} style={{ width: 40, height: 34, border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
          <input type="text" value={settings.color} onChange={(e) => onUpdateSettings({ color: e.target.value })} placeholder="#6366f1" style={{ ...inputStyle, flex: 1 }} />
        </div>
      </div>

      {/* Ticket Type */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Ticket Type</label>
        <select value={settings.ticketType} onChange={(e) => onUpdateSettings({ ticketType: e.target.value as FormSettings['ticketType'] })} style={inputStyle}>
          <option value="SERVICE_REQUEST">Service Request</option>
          <option value="INCIDENT">Incident</option>
          <option value="PROBLEM">Problem</option>
        </select>
      </div>

      {/* Default Priority */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Default Priority</label>
        <select value={settings.defaultPriority} onChange={(e) => onUpdateSettings({ defaultPriority: e.target.value })} style={inputStyle}>
          <option value="">None (use system default)</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {/* Default Queue */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Default Queue</label>
        <select value={settings.defaultQueueId} onChange={(e) => onUpdateSettings({ defaultQueueId: e.target.value })} style={inputStyle}>
          <option value="">None</option>
          {(queues ?? []).map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
        </select>
      </div>

      {/* Default Category */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Default Category</label>
        <select value={settings.defaultCategoryId} onChange={(e) => onUpdateSettings({ defaultCategoryId: e.target.value })} style={inputStyle}>
          <option value="">None</option>
          {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Default SLA */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Default SLA</label>
        <select value={settings.defaultSlaId} onChange={(e) => onUpdateSettings({ defaultSlaId: e.target.value })} style={inputStyle}>
          <option value="">None</option>
          {(slas ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Default Tags */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Default Tags</label>
        <input type="text" value={settings.defaultTags} onChange={(e) => onUpdateSettings({ defaultTags: e.target.value })} placeholder="tag1, tag2, tag3" style={inputStyle} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>Comma-separated list of tags</span>
      </div>

      {/* Show in Portal */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={settings.showInPortal} onChange={(e) => onUpdateSettings({ showInPortal: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)' }} />
          Show in Portal
        </label>
      </div>

      {/* Require Auth */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={settings.requireAuth} onChange={(e) => onUpdateSettings({ requireAuth: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)' }} />
          Require Authentication
        </label>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CustomFormBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  // ── State ──
  const [sections, setSections] = useState<FormSection[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({
    title: null,
    description: null,
    priority: null,
    category: null,
    type: null,
    titleTemplate: '',
    descriptionTemplate: '',
  });
  const [conditions, setConditions] = useState<FormCondition[]>([]);
  const [settings, setSettings] = useState<FormSettings>({
    name: '',
    slug: '',
    description: '',
    icon: '',
    color: '#6366f1',
    ticketType: 'SERVICE_REQUEST',
    defaultPriority: '',
    defaultQueueId: '',
    defaultCategoryId: '',
    defaultSlaId: '',
    defaultTags: '',
    showInPortal: true,
    requireAuth: true,
  });
  const [formStatus, setFormStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [isDirty, setIsDirty] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fields' | 'mapping' | 'conditions' | 'settings'>('fields');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // ── Load form data ──
  const { data: formData, isLoading } = useQuery<CustomFormData>({
    queryKey: ['custom-form', formId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/custom-forms/${formId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load form');
      return res.json();
    },
    enabled: !!formId,
  });

  // Populate state from loaded data
  useEffect(() => {
    if (!formData || dataLoaded) return;

    const layout = formData.layoutJson ?? { sections: [] };
    const sectionList = Array.isArray(layout) ? layout : (layout.sections ?? []);
    setSections(sectionList.map((s: any) => ({ ...s, collapsed: false })));
    setMapping(formData.mappingJson ?? {
      title: null, description: null, priority: null, category: null, type: null,
      titleTemplate: '', descriptionTemplate: '',
    });
    setConditions(formData.conditionsJson ?? []);
    setSettings({
      name: formData.name ?? '',
      slug: formData.slug ?? '',
      description: formData.description ?? '',
      icon: formData.icon ?? '',
      color: formData.color ?? '#6366f1',
      ticketType: (formData.ticketType as FormSettings['ticketType']) ?? 'SERVICE_REQUEST',
      defaultPriority: formData.defaultPriority ?? '',
      defaultQueueId: formData.defaultQueueId ?? '',
      defaultCategoryId: formData.defaultCategoryId ?? '',
      defaultSlaId: formData.defaultSlaId ?? '',
      defaultTags: formData.defaultTags?.join(', ') ?? '',
      showInPortal: formData.showInPortal ?? true,
      requireAuth: formData.requireAuth ?? true,
    });
    setFormStatus(formData.status);
    setDataLoaded(true);
  }, [formData, dataLoaded]);

  // ── All fields flat list (for mapping/conditions) ──
  const allFields = useMemo(() => sections.flatMap(s => s.fields), [sections]);

  // ── Selected field object ──
  const selectedField = useMemo(() => {
    if (!selectedFieldId) return null;
    return allFields.find(f => f.instanceId === selectedFieldId) ?? null;
  }, [allFields, selectedFieldId]);

  // ── Mark dirty on changes ──
  const markDirty = useCallback(() => { setIsDirty(true); }, []);

  // ── Section operations ──
  const addSection = useCallback(() => {
    const newSection: FormSection = {
      id: crypto.randomUUID(),
      title: 'New Section',
      description: '',
      fields: [],
      collapsed: false,
    };
    setSections(prev => [...prev, newSection]);
    markDirty();
  }, [markDirty]);

  const updateSectionTitle = useCallback((id: string, title: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    markDirty();
  }, [markDirty]);

  const updateSectionDescription = useCallback((id: string, description: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, description } : s));
    markDirty();
  }, [markDirty]);

  const toggleSectionCollapse = useCallback((id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s));
  }, []);

  const removeSection = useCallback((id: string) => {
    if (!window.confirm('Remove this section and all its fields?')) return;
    setSections(prev => prev.filter(s => s.id !== id));
    markDirty();
  }, [markDirty]);

  // ── Field operations ──
  const addFieldToSection = useCallback((sectionId: string, fieldDef: FieldDefinition) => {
    const instance: FieldInstance = {
      instanceId: crypto.randomUUID(),
      fieldDefinitionId: fieldDef.id,
      key: fieldDef.key,
      label: fieldDef.label,
      fieldType: fieldDef.fieldType,
      labelOverride: null,
      placeholderOverride: null,
      helpTextOverride: null,
      requiredOverride: null,
    };
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, fields: [...s.fields, instance] } : s));
    markDirty();
  }, [markDirty]);

  const removeField = useCallback((sectionId: string, instanceId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, fields: s.fields.filter(f => f.instanceId !== instanceId) } : s));
    if (selectedFieldId === instanceId) setSelectedFieldId(null);
    markDirty();
  }, [selectedFieldId, markDirty]);

  const moveField = useCallback((sectionId: string, instanceId: string, direction: 'up' | 'down') => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      const idx = fields.findIndex(f => f.instanceId === instanceId);
      if (idx < 0) return s;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= fields.length) return s;
      [fields[idx], fields[swapIdx]] = [fields[swapIdx], fields[idx]];
      return { ...s, fields };
    }));
    markDirty();
  }, [markDirty]);

  const updateFieldInstance = useCallback((instanceId: string, updates: Partial<FieldInstance>) => {
    setSections(prev => prev.map(s => ({
      ...s,
      fields: s.fields.map(f => f.instanceId === instanceId ? { ...f, ...updates } : f),
    })));
    markDirty();
  }, [markDirty]);

  // ── Mapping operations ──
  const updateMapping = useCallback((updates: Partial<FieldMapping>) => {
    setMapping(prev => ({ ...prev, ...updates }));
    markDirty();
  }, [markDirty]);

  // ── Conditions operations ──
  const updateConditions = useCallback((newConditions: FormCondition[]) => {
    setConditions(newConditions);
    markDirty();
  }, [markDirty]);

  // ── Settings operations ──
  const updateSettings = useCallback((updates: Partial<FormSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    markDirty();
  }, [markDirty]);

  // ── Save draft ──
  const saveDraft = useCallback(async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      // Strip collapsed from sections for persistence, wrap in { sections }
      const layoutJson = { sections: sections.map(({ collapsed, ...rest }) => rest) };
      const tagsArray = settings.defaultTags
        ? settings.defaultTags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const body = {
        name: settings.name,
        slug: settings.slug,
        description: settings.description || null,
        icon: settings.icon || null,
        color: settings.color || null,
        ticketType: settings.ticketType,
        defaultPriority: settings.defaultPriority || null,
        defaultQueueId: settings.defaultQueueId || null,
        defaultCategoryId: settings.defaultCategoryId || null,
        defaultSlaId: settings.defaultSlaId || null,
        defaultTags: tagsArray.length > 0 ? tagsArray : null,
        showInPortal: settings.showInPortal,
        requireAuth: settings.requireAuth,
        layoutJson,
        mappingJson: mapping,
        conditionsJson: conditions,
      };

      const res = await fetch(`/api/v1/custom-forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to save form');
      }

      setIsDirty(false);
      setSuccessMsg('Form saved successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save form');
    } finally {
      setSaving(false);
    }
  }, [sections, mapping, conditions, settings, formId]);

  // ── Publish / Unpublish ──
  const togglePublish = useCallback(async () => {
    setPublishing(true);
    setErrorMsg(null);
    try {
      // Save first if dirty
      if (isDirty) {
        await saveDraft();
      }

      const action = formStatus === 'PUBLISHED' ? 'unpublish' : 'publish';
      const res = await fetch(`/api/v1/custom-forms/${formId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Failed to ${action} form`);
      }

      const newStatus = action === 'publish' ? 'PUBLISHED' : 'DRAFT';
      setFormStatus(newStatus as 'DRAFT' | 'PUBLISHED');
      setSuccessMsg(`Form ${action === 'publish' ? 'published' : 'unpublished'} successfully.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update form status');
    } finally {
      setPublishing(false);
    }
  }, [formStatus, isDirty, saveDraft, formId]);

  const dismissSuccess = useCallback(() => setSuccessMsg(null), []);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text-muted)' }}>
        Loading form builder...
      </div>
    );
  }

  if (!formData && !isLoading) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Form not found</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>The form you are looking for does not exist or has been deleted.</p>
        <Link href="/dashboard/settings/custom-forms" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
          Back to Custom Forms
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100vh - 60px)' }}>
      {/* ── Top Toolbar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, padding: '10px 20px',
        backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-primary)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <Link href="/dashboard/settings/custom-forms" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>

        <Icon path={mdiFormSelect} size={0.9} color="var(--accent-primary)" />

        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
          {settings.name || 'Untitled Form'}
        </h1>

        <StatusBadge status={formStatus} />

        {isDirty && (
          <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Unsaved changes</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => void saveDraft()} disabled={saving} style={{ ...btnOutline, opacity: saving ? 0.6 : 1 }}>
            <Icon path={mdiContentSave} size={0.7} color="currentColor" />
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => setShowPreview(true)} style={btnOutline}>
            <Icon path={mdiEye} size={0.7} color="currentColor" />
            Preview
          </button>
          <button
            onClick={() => void togglePublish()}
            disabled={publishing}
            style={{
              ...btnPrimary,
              backgroundColor: formStatus === 'PUBLISHED' ? '#d97706' : 'var(--accent-primary)',
              opacity: publishing ? 0.6 : 1,
            }}
          >
            <Icon path={formStatus === 'PUBLISHED' ? mdiPublishOff : mdiPublish} size={0.7} color="currentColor" />
            {publishing ? 'Working...' : formStatus === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {/* ── Banners ── */}
      <div style={{ padding: '0 20px', marginTop: successMsg || errorMsg ? 12 : 0 }}>
        {successMsg && <SuccessBanner message={successMsg} onDismiss={dismissSuccess} />}
        {errorMsg && <ErrorBanner message={errorMsg} />}
      </div>

      {/* ── Main Area ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Left Panel (Canvas) ── */}
        <div style={{ flex: '0 0 70%', overflow: 'auto', padding: 20 }}>
          {sections.length === 0 ? (
            <div style={{
              padding: 48, textAlign: 'center', backgroundColor: 'var(--bg-secondary)',
              border: '2px dashed var(--border-secondary)', borderRadius: 12,
              color: 'var(--text-muted)', fontSize: 14,
            }}>
              <Icon path={mdiFormSelect} size={2} color="var(--text-muted)" />
              <p style={{ margin: '12px 0 0' }}>Add a section to start building your form</p>
            </div>
          ) : (
            sections.map((section, idx) => (
              <CanvasSection
                key={section.id}
                section={section}
                sectionIndex={idx}
                selectedFieldId={selectedFieldId}
                onSelectField={(id) => { setSelectedFieldId(id); setActiveTab('fields'); }}
                onUpdateTitle={updateSectionTitle}
                onUpdateDescription={updateSectionDescription}
                onToggleCollapse={toggleSectionCollapse}
                onRemoveSection={removeSection}
                onAddField={(sectionId) => setPickerSectionId(sectionId)}
                onRemoveField={removeField}
                onMoveField={moveField}
              />
            ))
          )}

          <button onClick={addSection} style={{ ...btnOutline, marginTop: 8 }}>
            <Icon path={mdiPlus} size={0.7} color="currentColor" />
            Add Section
          </button>
        </div>

        {/* ── Right Panel (Config) ── */}
        <div style={{
          flex: '0 0 30%', borderLeft: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-primary)', overflow: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-secondary)', flexShrink: 0 }}>
            <TabButton label="Fields" active={activeTab === 'fields'} onClick={() => setActiveTab('fields')} />
            <TabButton label="Mapping" active={activeTab === 'mapping'} onClick={() => setActiveTab('mapping')} />
            <TabButton label="Conditions" active={activeTab === 'conditions'} onClick={() => setActiveTab('conditions')} />
            <TabButton label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {activeTab === 'fields' && (
              <FieldsConfigTab selectedField={selectedField} onUpdateField={updateFieldInstance} />
            )}
            {activeTab === 'mapping' && (
              <MappingConfigTab mapping={mapping} allFields={allFields} onUpdateMapping={updateMapping} />
            )}
            {activeTab === 'conditions' && (
              <ConditionsConfigTab conditions={conditions} allFields={allFields} onUpdateConditions={updateConditions} />
            )}
            {activeTab === 'settings' && (
              <SettingsConfigTab settings={settings} onUpdateSettings={updateSettings} />
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {pickerSectionId && (
        <FieldPickerModal
          onSelect={(fieldDef) => addFieldToSection(pickerSectionId, fieldDef)}
          onClose={() => setPickerSectionId(null)}
        />
      )}

      {showPreview && (
        <PreviewModal
          sections={sections}
          formName={settings.name || 'Untitled Form'}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
