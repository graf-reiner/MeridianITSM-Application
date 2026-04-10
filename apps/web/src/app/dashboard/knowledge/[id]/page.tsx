'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiEye, mdiThumbUpOutline, mdiTagOutline, mdiAlertOctagonOutline } from '@mdi/js';
import ArticleEditor from '../../../../components/ArticleEditor';
import RichTextField from '@/components/RichTextField';
import Breadcrumb from '@/components/Breadcrumb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleDetail {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  status: string;
  visibility: string;
  isKnownError: boolean;
  tags: string[];
  viewCount: number;
  helpfulCount: number;
  author: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['RETIRED'],
  RETIRED: ['DRAFT'],
};

function getStatusStyle(s: string) {
  switch (s) {
    case 'PUBLISHED': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_REVIEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'DRAFT': return { bg: 'var(--bg-tertiary)', text: '#374151' };
    case 'RETIRED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default: return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Article Detail/Edit Page ─────────────────────────────────────────────────

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const articleId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editVisibility, setEditVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [editKnownError, setEditKnownError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const { data: article, isLoading, error } = useQuery<ArticleDetail>({
    queryKey: ['article', articleId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/knowledge/${articleId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load article');
      const data = (await res.json()) as { article: ArticleDetail };
      return data.article ?? (data as unknown as ArticleDetail);
    },
  });

  // Populate edit fields when article loads
  useEffect(() => {
    if (article) {
      setEditTitle(article.title);
      setEditSummary(article.summary ?? '');
      setEditContent(article.content);
      setEditTags(article.tags.join(', '));
      setEditVisibility(article.visibility as 'PUBLIC' | 'INTERNAL');
      setEditKnownError(article.isKnownError);
    }
  }, [article]);

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const parsedTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/v1/knowledge/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: editTitle.trim(),
          summary: editSummary.trim() || null,
          content: editContent,
          tags: parsedTags,
          visibility: editVisibility,
          isKnownError: editKnownError,
        }),
      });
      if (!res.ok) throw new Error('Failed to save article');
      void qc.invalidateQueries({ queryKey: ['article', articleId] });
      void qc.invalidateQueries({ queryKey: ['knowledge'] });
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/v1/knowledge/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      void qc.invalidateQueries({ queryKey: ['article', articleId] });
      void qc.invalidateQueries({ queryKey: ['knowledge'] });
    } finally {
      setStatusUpdating(false);
    }
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading article...</div>;
  if (error || !article) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
        {error instanceof Error ? error.message : 'Article not found'}
        <div style={{ marginTop: 16 }}>
          <Link href="/dashboard/knowledge" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Back to knowledge base</Link>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(article.status);
  const transitions = STATUS_TRANSITIONS[article.status] ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: 'Knowledge', href: '/dashboard/knowledge' },
        { label: article.title },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

        {/* Main content */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 28 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {article.status.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>{article.visibility}</span>
              {article.isKnownError && (
                <span
                  title="Known Error (KEDB)"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: 'var(--badge-red-bg-subtle)',
                    color: 'var(--accent-danger)',
                  }}
                >
                  <Icon path={mdiAlertOctagonOutline} size={0.6} color="currentColor" />
                  Known Error
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {transitions.map((nextStatus) => (
                <button
                  key={nextStatus}
                  onClick={() => void handleStatusChange(nextStatus)}
                  disabled={statusUpdating}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: statusUpdating ? 'not-allowed' : 'pointer',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Move to {nextStatus.replace(/_/g, ' ')}
                </button>
              ))}
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  padding: '6px 14px',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  backgroundColor: isEditing ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  fontWeight: isEditing ? 600 : 400,
                }}
              >
                {isEditing ? 'Cancel Edit' : 'Edit'}
              </button>
            </div>
          </div>

          {isEditing ? (
            /* Edit mode */
            <div>
              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 18, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <RichTextField
                  value={editSummary}
                  onChange={setEditSummary}
                  placeholder="Summary..."
                  minHeight={60}
                  compact
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Tags</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="tag1, tag2"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Visibility</label>
                  <select
                    value={editVisibility}
                    onChange={(e) => setEditVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="INTERNAL">Internal</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={editKnownError}
                    onChange={(e) => setEditKnownError(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  Known Error (KEDB)
                </label>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Content</label>
                <ArticleEditor
                  initialContent={editContent}
                  onChange={(html) => setEditContent(html)}
                  editable
                />
              </div>
              {saveError && (
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid var(--badge-red-bg-strong)', borderRadius: 8, marginBottom: 12, color: 'var(--accent-danger)', fontSize: 14 }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving || !editTitle.trim()}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: isSaving ? 'var(--badge-indigo-bg)' : 'var(--accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            /* Read-only mode */
            <div>
              <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{article.title}</h1>
              {article.summary && (
                <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{article.summary}</p>
              )}
              <div style={{ borderTop: '1px solid var(--bg-tertiary)', paddingTop: 20 }}>
                <ArticleEditor
                  initialContent={article.content}
                  onChange={() => { /* read-only */ }}
                  editable={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Author</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                {article.author ? `${article.author.firstName} ${article.author.lastName}` : '—'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Created</span>
              <span style={{ color: 'var(--text-secondary)' }}>{formatDate(article.createdAt)}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Updated</span>
              <span style={{ color: 'var(--text-secondary)' }}>{formatDate(article.updatedAt)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                <Icon path={mdiEye} size={0.7} color="currentColor" />
                {article.viewCount} views
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                <Icon path={mdiThumbUpOutline} size={0.7} color="currentColor" />
                {article.helpfulCount}
              </span>
            </div>
            {article.tags.length > 0 && (
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 6 }}>
                  <Icon path={mdiTagOutline} size={0.7} color="currentColor" style={{ marginRight: 4 }} />
                  Tags
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{ padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--bg-tertiary)', fontSize: 12, color: 'var(--text-muted)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
