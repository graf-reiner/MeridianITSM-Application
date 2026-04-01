'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft } from '@mdi/js';
import ArticleEditor from '../../../../components/ArticleEditor';
import RichTextField from '@/components/RichTextField';

// ─── New Article Page ─────────────────────────────────────────────────────────

export default function NewArticlePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/v1/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim() || undefined,
          content,
          tags: parsedTags,
          visibility,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create article');
      }
      const created = (await res.json()) as { article?: { id: string }; id?: string };
      const articleId = created.article?.id ?? (created as { id?: string }).id;
      if (articleId) {
        router.push(`/dashboard/knowledge/${articleId}`);
      } else {
        router.push('/dashboard/knowledge');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create article');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: '#fff',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 5,
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#374151',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard/knowledge" style={{ display: 'flex', alignItems: 'center', color: '#6b7280', textDecoration: 'none' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>New Article</h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28, marginBottom: 16 }}>

          {/* Title */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              required
              style={inputStyle}
            />
          </div>

          {/* Summary */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Summary</label>
            <RichTextField
              value={summary}
              onChange={setSummary}
              placeholder="Brief description of this article..."
              minHeight={60}
              compact
            />
          </div>

          {/* Tags & Visibility row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Comma-separated</p>
            </div>
            <div>
              <label style={labelStyle}>Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
                style={inputStyle}
              >
                <option value="PUBLIC">Public (visible in end-user portal)</option>
                <option value="INTERNAL">Internal (staff only)</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div>
            <label style={labelStyle}>Content</label>
            <ArticleEditor
              initialContent={content}
              onChange={(html) => setContent(html)}
              editable
            />
          </div>
        </div>

        {submitError && (
          <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, color: '#dc2626', fontSize: 14 }}>
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/dashboard/knowledge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              color: '#374151',
              textDecoration: 'none',
              backgroundColor: '#fff',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 24px',
              backgroundColor: isSubmitting || !title.trim() ? '#a5b4fc' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: isSubmitting || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting ? 'Creating...' : 'Create Article'}
          </button>
        </div>
      </form>
    </div>
  );
}
