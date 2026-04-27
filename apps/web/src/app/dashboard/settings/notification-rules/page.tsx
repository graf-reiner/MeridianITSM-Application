'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiBellAlert,
  mdiPlus,
  mdiCogSync,
  mdiDownload,
  mdiUpload,
  mdiPencil,
  mdiTrashCan,
  mdiContentCopy,
  mdiFlag,
  mdiClose,
  mdiBellRing,
  mdiEmail,
  mdiSlack,
  mdiMicrosoftTeams,
  mdiWebhook,
  mdiCellphone,
  mdiArrowUpBold,
  mdiPencilBox,
  mdiTimerSand,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Trigger = (typeof TRIGGERS)[number];

interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  trigger: Trigger;
  isActive: boolean;
  priority: number;
  stopAfterMatch: boolean;
  conditionGroups: unknown[];
  actions: { type: string }[];
}

interface RulesListResponse {
  rules: NotificationRule[];
  total: number;
}

interface ImportPreview {
  rules: { name: string; action: string; warnings: string[] }[];
  sessionToken: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTriggerBadge(trigger: string): { bg: string; text: string } {
  if (trigger.startsWith('TICKET_')) return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
  if (trigger.startsWith('SLA_')) return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
  if (trigger.startsWith('CHANGE_') || trigger === 'CAB_INVITATION') return { bg: 'var(--badge-green-bg)', text: '#065f46' };
  return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
}

const ACTION_ICONS: Record<string, string> = {
  in_app: mdiBellRing,
  email: mdiEmail,
  slack: mdiSlack,
  teams: mdiMicrosoftTeams,
  webhook: mdiWebhook,
  sms: mdiCellphone,
  push: mdiBellAlert,
  escalate: mdiArrowUpBold,
  update_field: mdiPencilBox,
  webhook_wait: mdiTimerSand,
};

function conditionSummary(groups: unknown[]): string {
  if (!Array.isArray(groups) || groups.length === 0) return 'No conditions';
  const groupCount = groups.length;
  let condCount = 0;
  for (const g of groups) {
    if (g && typeof g === 'object' && 'conditions' in g && Array.isArray((g as { conditions: unknown[] }).conditions)) {
      condCount += (g as { conditions: unknown[] }).conditions.length;
    }
  }
  return `${groupCount} group${groupCount !== 1 ? 's' : ''}, ${condCount} condition${condCount !== 1 ? 's' : ''}`;
}

// ─── Import Preview Modal ─────────────────────────────────────────────────────

function ImportPreviewModal({
  preview,
  onClose,
  onConfirm,
  confirming,
}: {
  preview: ImportPreview;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 640,
          overflow: 'auto',
          maxHeight: '90vh',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
            Import Preview
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon path={mdiClose} size={0.9} color="#6b7280" />
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Rule Name</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Action</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {preview.rules.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px' }}>{r.name}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: r.action === 'create' ? 'var(--badge-green-bg)' : r.action === 'update' ? 'var(--badge-blue-bg)' : 'var(--bg-tertiary)',
                        color: r.action === 'create' ? '#065f46' : r.action === 'update' ? '#1e40af' : 'var(--text-muted)',
                      }}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--accent-warning)', fontSize: 12 }}>
                    {r.warnings?.length > 0 ? r.warnings.join(', ') : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={confirming}
              style={{
                padding: '8px 18px',
                backgroundColor: confirming ? '#a5b4fc' : 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: confirming ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Notification Rules List Page ─────────────────────────────────────────────

export default function NotificationRulesPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [triggerFilter, setTriggerFilter] = useState<string>('');
  const [generatingDefaults, setGeneratingDefaults] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery<RulesListResponse>({
    queryKey: ['settings-notification-rules', triggerFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (triggerFilter) params.set('trigger', triggerFilter);
      const res = await fetch(`/api/v1/settings/notification-rules?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load notification rules');
      return res.json() as Promise<RulesListResponse>;
    },
  });

  const rules = Array.isArray(data) ? data : (data?.rules ?? []);

  const handleToggleActive = async (rule: NotificationRule) => {
    await fetch(`/api/v1/settings/notification-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
  };

  const handleDelete = async (rule: NotificationRule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    await fetch(`/api/v1/settings/notification-rules/${rule.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
  };

  const handleDuplicate = async (rule: NotificationRule) => {
    const res = await fetch(`/api/v1/settings/notification-rules/${rule.id}`, { credentials: 'include' });
    if (!res.ok) return;
    const { rule: full } = (await res.json()) as { rule: Record<string, unknown> };
    const { id: _id, createdAt: _c, updatedAt: _u, tenantId: _t, ...rest } = full;
    await fetch('/api/v1/settings/notification-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...rest, name: `${rule.name} (copy)`, isActive: false }),
    });
    void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
  };

  const handleGenerateDefaults = async () => {
    setGeneratingDefaults(true);
    try {
      await fetch('/api/v1/settings/notification-rules/generate-defaults', {
        method: 'POST',
        credentials: 'include',
      });
      void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
    } finally {
      setGeneratingDefaults(false);
    }
  };

  const handleExportYaml = async () => {
    const res = await fetch('/api/v1/settings/notification-rules/yaml-export', { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notification-rules.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await fetch('/api/v1/settings/notification-rules/yaml-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ yaml: text }),
      });
      if (!res.ok) throw new Error('Import failed');
      const preview = (await res.json()) as ImportPreview;
      setImportPreview(preview);
    } catch {
      alert('Failed to parse YAML file');
    }
    // Reset input so re-selecting same file triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setConfirming(true);
    try {
      await fetch('/api/v1/settings/notification-rules/yaml-import-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionToken: importPreview.sessionToken }),
      });
      void qc.invalidateQueries({ queryKey: ['settings-notification-rules'] });
      setImportPreview(null);
    } finally {
      setConfirming(false);
    }
  };

  const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 13 };
  const tdStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 13 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Link
          href="/dashboard/settings"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiBellAlert} size={1} color="#d97706" />
          Notification Rules
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/dashboard/settings/workflows" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Try Workflow Automation
          </Link>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link
            href="/dashboard/settings/notification-rules/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Rule
          </Link>
          <button
            onClick={() => void handleGenerateDefaults()}
            disabled={generatingDefaults}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: generatingDefaults ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon path={mdiCogSync} size={0.75} color="currentColor" />
            {generatingDefaults ? 'Restoring...' : 'Restore Defaults'}
          </button>
          <button
            onClick={() => void handleExportYaml()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiDownload} size={0.75} color="currentColor" />
            Export YAML
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiUpload} size={0.75} color="currentColor" />
            Import YAML
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
            style={{ display: 'none' }}
            onChange={(e) => void handleImportFile(e)}
          />
        </div>
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 14 }}>
        Configure when and how notifications are sent based on triggers, conditions, and actions.
      </p>

      {/* Filter */}
      <div style={{ marginBottom: 16 }}>
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          style={{
            padding: '7px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 7,
            fontSize: 13,
            outline: 'none',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
          }}
        >
          <option value="">All Triggers</option>
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Icon path={mdiBellAlert} size={2.5} color="#d1d5db" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
            No notification rules configured
          </h3>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
            Create rules to automatically send notifications based on ticket events, SLA breaches, and more.
          </p>
          <Link
            href="/dashboard/settings/notification-rules/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Rule
          </Link>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Trigger</th>
                  <th style={thStyle}>Conditions</th>
                  <th style={thStyle}>Actions</th>
                  <th style={thStyle}>Active</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Stop</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const badge = getTriggerBadge(rule.trigger);
                  return (
                    <tr key={rule.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            backgroundColor: 'var(--bg-tertiary)',
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {rule.priority}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <Link
                          href={`/dashboard/settings/notification-rules/${rule.id}`}
                          style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {rule.name}
                        </Link>
                        {rule.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-placeholder)', marginTop: 2 }}>{rule.description}</div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 500,
                            backgroundColor: badge.bg,
                            color: badge.text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rule.trigger.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12 }}>
                        {conditionSummary(rule.conditionGroups)}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {rule.actions.map((a: { type: string }, i: number) => (
                            <span
                              key={i}
                              title={a.type}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 6px',
                                borderRadius: 6,
                                backgroundColor: 'var(--bg-tertiary)',
                                fontSize: 11,
                                gap: 3,
                              }}
                            >
                              <Icon path={ACTION_ICONS[a.type] ?? mdiBellRing} size={0.55} color="#6b7280" />
                              {a.type}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => void handleToggleActive(rule)}
                          style={{
                            width: 40,
                            height: 22,
                            borderRadius: 11,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: rule.isActive ? 'var(--accent-primary)' : 'var(--border-secondary)',
                            position: 'relative',
                            transition: 'background-color 0.2s',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: 2,
                              left: rule.isActive ? 20 : 2,
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              backgroundColor: 'var(--bg-primary)',
                              transition: 'left 0.2s',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                            }}
                          />
                        </button>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {rule.stopAfterMatch && (
                          <Icon path={mdiFlag} size={0.7} color="#d97706" />
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Link
                            href={`/dashboard/settings/notification-rules/${rule.id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              backgroundColor: 'var(--bg-primary)',
                              color: 'var(--text-secondary)',
                              textDecoration: 'none',
                            }}
                          >
                            <Icon path={mdiPencil} size={0.6} color="currentColor" />
                            Edit
                          </Link>
                          <button
                            onClick={() => void handleDuplicate(rule)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              border: '1px solid #d1d5db',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              backgroundColor: 'var(--bg-primary)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <Icon path={mdiContentCopy} size={0.6} color="currentColor" />
                          </button>
                          <button
                            onClick={() => void handleDelete(rule)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              border: '1px solid #fecaca',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              backgroundColor: 'var(--bg-primary)',
                              color: 'var(--accent-danger)',
                            }}
                          >
                            <Icon path={mdiTrashCan} size={0.6} color="currentColor" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onClose={() => setImportPreview(null)}
          onConfirm={() => void handleConfirmImport()}
          confirming={confirming}
        />
      )}
    </div>
  );
}
