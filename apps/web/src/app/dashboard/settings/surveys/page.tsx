'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiClipboardTextMultiple, mdiPlus, mdiPencil, mdiTrashCan, mdiCheck, mdiClose, mdiStarCircle, mdiChartBar, mdiPercent } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SurveyTemplate {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  isDefault: boolean;
  isActive: boolean;
  questions: unknown[];
}

interface SurveyStats {
  totalResponses: number;
  averageRating: number;
  csatPercentage: number;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function SurveyModal({ item, onClose, onSaved }: { item: SurveyTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [trigger, setTrigger] = useState(item?.trigger ?? 'RESOLVED');
  const [isDefault, setIsDefault] = useState(item?.isDefault ?? false);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [questionsJson, setQuestionsJson] = useState(item?.questions ? JSON.stringify(item.questions, null, 2) : '[]');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      let parsedQuestions: unknown[];
      try {
        parsedQuestions = JSON.parse(questionsJson);
      } catch {
        throw new Error('Questions is not valid JSON');
      }
      const res = await fetch(item ? `/api/v1/surveys/templates/${item.id}` : '/api/v1/surveys/templates', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          trigger,
          isDefault,
          isActive,
          questions: parsedQuestions,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save survey');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 560, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{item ? 'Edit Survey' : 'Create Survey'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="description" style={labelStyle}>Description</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="trigger" style={labelStyle}>Trigger</label>
            <select id="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} style={inputStyle}>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Default
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="questions" style={labelStyle}>Questions (JSON)</label>
            <textarea id="questions" value={questionsJson} onChange={(e) => setQuestionsJson(e.target.value)} rows={8} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : item ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatsCard({ stats }: { stats: SurveyStats | null }) {
  if (!stats) return null;
  const cards = [
    { label: 'Total Responses', value: stats.totalResponses.toLocaleString(), icon: mdiChartBar, color: '#6366f1' },
    { label: 'Average Rating', value: stats.averageRating.toFixed(1), icon: mdiStarCircle, color: '#f59e0b' },
    { label: 'CSAT', value: `${stats.csatPercentage.toFixed(0)}%`, icon: mdiPercent, color: '#10b981' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon path={c.icon} size={1.2} color={c.color} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SurveysSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<SurveyTemplate | null>(null);

  const { data: templates, isLoading } = useQuery<SurveyTemplate[]>({
    queryKey: ['settings-survey-templates'],
    queryFn: async () => {
      const res = await fetch('/api/v1/surveys/templates', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load surveys');
      const json = await res.json();
      return Array.isArray(json) ? json : json.templates ?? json.data ?? [];
    },
  });

  const { data: stats } = useQuery<SurveyStats>({
    queryKey: ['settings-survey-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/surveys/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load stats');
      return res.json();
    },
  });

  const handleDelete = async (item: SurveyTemplate) => {
    if (!window.confirm(`Delete survey "${item.name}"?`)) return;
    await fetch(`/api/v1/surveys/templates/${item.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-survey-templates'] });
  };

  const items = templates ?? [];

  const statusBadge = (active: boolean) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: active ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: active ? '#16a34a' : 'var(--text-muted)' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );

  const triggerBadge = (t: string) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: 'var(--badge-blue-bg)' }}>
      {t}
    </span>
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiClipboardTextMultiple} size={1} color="#10b981" />
          Surveys
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Survey
          </button>
        </div>
      </div>

      <StatsCard stats={stats ?? null} />

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Questions</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Default</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Trigger</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{item.questions?.length ?? 0}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Icon path={item.isDefault ? mdiCheck : mdiClose} size={0.7} color={item.isDefault ? '#16a34a' : 'var(--text-placeholder)'} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(item.isActive)}</td>
                  <td style={{ padding: '10px 14px' }}>{triggerBadge(item.trigger)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditItem(item); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" /> Edit
                      </button>
                      <button onClick={() => void handleDelete(item)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}>
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No surveys found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <SurveyModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-survey-templates'] })}
        />
      )}
    </div>
  );
}
