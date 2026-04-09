'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import Icon from '@mdi/react';
import Breadcrumb from '@/components/Breadcrumb';
import {
  mdiAlertDecagramOutline,
  mdiLinkVariant,
  mdiServerNetwork,
  mdiBookOpenVariant,
  mdiContentSave,
  mdiPlus,
  mdiDeleteOutline,
  mdiLoading,
  mdiBugOutline,
  mdiLightbulbOutline,
} from '@mdi/js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LinkedIncident {
  id: string;
  ticketNumber: number;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface LinkedCI {
  ci: { id: string; ciNumber: number; name: string; ciType: string; lifecycleStatus: string };
}

interface ProblemDetail {
  id: string;
  ticketNumber: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  rootCause: string | null;
  workaround: string | null;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  category: { id: string; name: string } | null;
  queue: { id: string; name: string } | null;
  knowledgeArticle: { id: string; articleNumber: number; title: string; status: string } | null;
  problemIncidents: Array<{ incident: LinkedIncident; createdAt: string }>;
  cmdbProblemLinks: LinkedCI[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: '#eff6ff', text: '#1d4ed8' },
  OPEN: { bg: '#f0fdf4', text: '#15803d' },
  IN_PROGRESS: { bg: '#fffbeb', text: '#b45309' },
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  RESOLVED: { bg: '#f0fdf4', text: '#166534' },
  CLOSED: { bg: '#f1f5f9', text: '#475569' },
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626', HIGH: '#ea580c', MEDIUM: '#ca8a04', LOW: '#6b7280',
};

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'h1', 'h2', 'h3', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProblemDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const problemId = params.id as string;

  const [activeTab, setActiveTab] = useState<'details' | 'incidents' | 'cis'>('details');
  const [rootCause, setRootCause] = useState('');
  const [workaround, setWorkaround] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkIncidentId, setLinkIncidentId] = useState('');

  const { data: problem, isLoading } = useQuery<ProblemDetail>({
    queryKey: ['problem', problemId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/problems/${problemId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Problem not found');
      const data = await res.json() as ProblemDetail;
      setRootCause(data.rootCause ?? '');
      setWorkaround(data.workaround ?? '');
      return data;
    },
  });

  const safeDescription = useMemo(
    () => (problem?.description ? sanitizeHtml(problem.description) : ''),
    [problem?.description],
  );

  const handleSaveRootCause = async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/problems/${problemId}/root-cause`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootCause, workaround }),
      });
      void queryClient.invalidateQueries({ queryKey: ['problem', problemId] });
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleLinkIncident = async () => {
    if (!linkIncidentId.trim()) return;
    try {
      const res = await fetch(`/api/v1/problems/${problemId}/incidents`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId: linkIncidentId.trim() }),
      });
      if (res.ok) {
        setLinkIncidentId('');
        void queryClient.invalidateQueries({ queryKey: ['problem', problemId] });
      }
    } catch { /* ignore */ }
  };

  const handleUnlinkIncident = async (incidentId: string) => {
    try {
      await fetch(`/api/v1/problems/${problemId}/incidents/${incidentId}`, { method: 'DELETE', credentials: 'include' });
      void queryClient.invalidateQueries({ queryKey: ['problem', problemId] });
    } catch { /* ignore */ }
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Icon path={mdiLoading} size={1.5} spin color="var(--text-muted)" /></div>;
  }

  if (!problem) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>Problem not found</div>;
  }

  const sc = STATUS_COLORS[problem.status] ?? STATUS_COLORS.NEW;
  const incidents = problem.problemIncidents.map((l) => l.incident);

  const tabStyle = (tab: string) => ({
    padding: '8px 16px', border: 'none',
    borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
    backgroundColor: 'transparent',
    color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)',
    fontSize: 14, fontWeight: activeTab === tab ? 600 : 400, cursor: 'pointer' as const,
  });

  const textareaStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', minHeight: 80,
    outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb + Header */}
      <Breadcrumb items={[
        { label: 'Problems', href: '/dashboard/problems' },
        { label: `PRB-${String(problem.ticketNumber).padStart(5, '0')}` },
      ]} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Icon path={mdiAlertDecagramOutline} size={1} color="var(--accent-primary)" />
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>
          PRB-{String(problem.ticketNumber).padStart(5, '0')}
        </span>
        <span style={{ padding: '2px 8px', borderRadius: 12, backgroundColor: sc.bg, color: sc.text, fontSize: 11, fontWeight: 600 }}>
          {problem.status.replace(/_/g, ' ')}
        </span>
        <span style={{ color: PRIORITY_COLORS[problem.priority], fontWeight: 600, fontSize: 12 }}>{problem.priority}</span>
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{problem.title}</h1>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        {problem.assignedTo ? `Assigned to ${problem.assignedTo.firstName} ${problem.assignedTo.lastName}` : 'Unassigned'}
        {problem.category ? ` · ${problem.category.name}` : ''}
        {' · '}{new Date(problem.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiLinkVariant} size={0.8} color="var(--accent-primary)" />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{incidents.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Linked Incidents</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiServerNetwork} size={0.8} color="#7c3aed" />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{problem.cmdbProblemLinks.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Affected CIs</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiBookOpenVariant} size={0.8} color="#059669" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {problem.knowledgeArticle ? `KB-${String(problem.knowledgeArticle.articleNumber).padStart(5, '0')}` : 'None'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Known Error Article</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', marginBottom: 20 }}>
        <button onClick={() => setActiveTab('details')} style={tabStyle('details')}>Details</button>
        <button onClick={() => setActiveTab('incidents')} style={tabStyle('incidents')}>Linked Incidents ({incidents.length})</button>
        <button onClick={() => setActiveTab('cis')} style={tabStyle('cis')}>Affected CIs ({problem.cmdbProblemLinks.length})</button>
      </div>

      {/* Details tab */}
      {activeTab === 'details' && (
        <div>
          {safeDescription && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Description</h3>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: safeDescription }} />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon path={mdiBugOutline} size={0.65} color="var(--text-muted)" /> Root Cause Analysis
            </h3>
            <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="Describe the root cause..." style={textareaStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon path={mdiLightbulbOutline} size={0.65} color="var(--text-muted)" /> Workaround
            </h3>
            <textarea value={workaround} onChange={(e) => setWorkaround(e.target.value)} placeholder="Describe any known workaround..." style={textareaStyle} />
          </div>

          <button onClick={handleSaveRootCause} disabled={saving} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8,
            border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            <Icon path={saving ? mdiLoading : mdiContentSave} size={0.7} color="#fff" spin={saving} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Incidents tab */}
      {activeTab === 'incidents' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input placeholder="Paste incident ticket ID to link..." value={linkIncidentId} onChange={(e) => setLinkIncidentId(e.target.value)}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
            <button onClick={handleLinkIncident} disabled={!linkIncidentId.trim()} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderRadius: 8,
              border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: linkIncidentId.trim() ? 1 : 0.5,
            }}><Icon path={mdiPlus} size={0.6} color="#fff" /> Link</button>
          </div>
          {incidents.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-primary)', borderRadius: 10 }}>No incidents linked yet.</div>
          ) : (
            <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              {incidents.map((inc) => {
                const isc = STATUS_COLORS[inc.status] ?? STATUS_COLORS.NEW;
                return (
                  <div key={inc.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--bg-tertiary)', gap: 12 }}>
                    <Link href={`/dashboard/tickets/${inc.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>TKT-{String(inc.ticketNumber).padStart(5, '0')}</span>
                      <span style={{ marginLeft: 8, fontSize: 14, color: 'var(--accent-primary)', fontWeight: 500 }}>{inc.title}</span>
                    </Link>
                    <span style={{ padding: '2px 8px', borderRadius: 10, backgroundColor: isc.bg, color: isc.text, fontSize: 11, fontWeight: 600 }}>{inc.status.replace(/_/g, ' ')}</span>
                    <span style={{ color: PRIORITY_COLORS[inc.priority], fontWeight: 600, fontSize: 11 }}>{inc.priority}</span>
                    <button onClick={() => void handleUnlinkIncident(inc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} title="Unlink">
                      <Icon path={mdiDeleteOutline} size={0.65} color="var(--accent-danger)" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CIs tab */}
      {activeTab === 'cis' && (
        <div>
          {problem.cmdbProblemLinks.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-primary)', borderRadius: 10 }}>No CIs linked.</div>
          ) : (
            <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              {problem.cmdbProblemLinks.map(({ ci }) => (
                <div key={ci.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--bg-tertiary)', gap: 12 }}>
                  <Icon path={mdiServerNetwork} size={0.7} color="var(--text-muted)" />
                  <Link href={`/dashboard/cmdb/${ci.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>CI-{String(ci.ciNumber).padStart(5, '0')}</span>
                    <span style={{ marginLeft: 8, fontSize: 14, color: 'var(--accent-primary)', fontWeight: 500 }}>{ci.name}</span>
                  </Link>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ci.ciType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
