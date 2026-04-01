'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiEye, mdiThumbUpOutline, mdiTagOutline } from '@mdi/js';
import ArticleEditor from '../../../../components/ArticleEditor';
import RichTextField from '@/components/RichTextField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArticleDetail {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  status: string;
  visibility: string;
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
    case 'PUBLISHED': return { bg: '#d1fae5', text: '#065f46' };
    case 'IN_REVIEW': return { bg: '#dbeafe', text: '#1e40af' };
    case 'DRAFT': return { bg: '#f3f4f6', text: '#374151' };
    case 'RETIRED': return { bg: '#fee2e2', text: '#991b1b' };
    default: return { bg: '#f3f4f6', text: '#374151' };
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

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading article...</div>;
  if (error || !article) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
        {error instanceof Error ? error.message : 'Article not found'}
        <div style={{ marginTop: 16 }}>
          <Link href="/dashboard/knowledge" style={{ color: '#4f46e5', textDecoration: 'none' }}>Back to knowledge base</Link>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(article.status);
  const transitions = STATUS_TRANSITIONS[article.status] ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/knowledge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280', textDecoration: 'none', fontSize: 14 }}>
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to knowledge base
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

        {/* Main content */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {article.status.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>{article.visibility}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {transitions.map((nextStatus) => (
                <button
                  key={nextStatus}
                  onClick={() => void handleStatusChange(nextStatus)}
                  disabled={statusUpdating}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: statusUpdating ? 'not-allowed' : 'pointer',
                    backgroundColor: '#fff',
                    color: '#374151',
                  }}
                >
                  Move to {nextStatus.replace(/_/g, ' ')}
                </button>
              ))}
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  padding: '6px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  backgroundColor: isEditing ? '#f3f4f6' : '#fff',
                  color: '#374151',
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
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 18, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }}
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
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151' }}>Tags</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="tag1, tag2"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151' }}>Visibility</label>
                  <select
                    value={editVisibility}
                    onChange={(e) => setEditVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: '#fff' }}
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="INTERNAL">Internal</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151' }}>Content</label>
                <ArticleEditor
                  initialContent={editContent}
                  onChange={(html) => setEditContent(html)}
                  editable
                />
              </div>
              {saveError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12, color: '#dc2626', fontSize: 14 }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={isSaving || !editTitle.trim()}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5',
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
              <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#111827' }}>{article.title}</h1>
              {article.summary && (
                <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{article.summary}</p>
              )}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
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
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div>
              <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Author</span>
              <span style={{ color: '#374151', fontWeight: 500 }}>
                {article.author ? `${article.author.firstName} ${article.author.lastName}` : '—'}
              </span>
            </div>
            <div>
              <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Created</span>
              <span style={{ color: '#374151' }}>{formatDate(article.createdAt)}</span>
            </div>
            <div>
              <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Updated</span>
              <span style={{ color: '#374151' }}>{formatDate(article.updatedAt)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                <Icon path={mdiEye} size={0.7} color="currentColor" />
                {article.viewCount} views
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                <Icon path={mdiThumbUpOutline} size={0.7} color="currentColor" />
                {article.helpfulCount}
              </span>
            </div>
            {article.tags.length > 0 && (
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  <Icon path={mdiTagOutline} size={0.7} color="currentColor" style={{ marginRight: 4 }} />
                  Tags
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{ padding: '2px 8px', borderRadius: 12, backgroundColor: '#f3f4f6', fontSize: 12, color: '#6b7280' }}
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
