'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiBookOpenVariant, mdiPlus, mdiMagnify, mdiEye, mdiThumbUpOutline } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  visibility: string;
  author: { firstName: string; lastName: string } | null;
  viewCount: number;
  helpfulCount: number;
  updatedAt: string;
  tags: string[];
}

interface ArticleListResponse {
  articles: Article[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(s: string) {
  switch (s) {
    case 'PUBLISHED': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_REVIEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'DRAFT': return { bg: 'var(--bg-tertiary)', text: '#374151' };
    case 'RETIRED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default: return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Knowledge Base Page ──────────────────────────────────────────────────────

export default function DashboardKnowledgePage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [visibility, setVisibility] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = useQuery<ArticleListResponse>({
    queryKey: ['knowledge', search, status, visibility, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (visibility) params.set('visibility', visibility);
      const res = await fetch(`/api/v1/knowledge?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load articles');
      return res.json() as Promise<ArticleListResponse>;
    },
  });

  const articles = data?.articles ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiBookOpenVariant} size={1} color="var(--accent-primary)" />
          Knowledge Base
        </h1>
        <Link
          href="/dashboard/knowledge/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon path={mdiPlus} size={0.8} color="currentColor" />
          New Article
        </Link>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="var(--text-placeholder)" />
          </div>
          <input
            type="search"
            placeholder="Search articles..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '8px 10px 8px 34px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="PUBLISHED">Published</option>
          <option value="RETIRED">Retired</option>
        </select>
        <select
          value={visibility}
          onChange={(e) => { setVisibility(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Visibility</option>
          <option value="PUBLIC">Public</option>
          <option value="INTERNAL">Internal</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading articles...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
          {error instanceof Error ? error.message : 'Failed to load articles'}
        </div>
      ) : articles.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiBookOpenVariant} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No articles found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Visibility</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Author</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Views</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Helpful</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => {
                const statusStyle = getStatusStyle(article.status);
                return (
                  <tr key={article.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/dashboard/knowledge/${article.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {article.title}
                      </Link>
                      {article.summary && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                          {article.summary}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {article.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                      {article.visibility}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {article.author ? `${article.author.firstName} ${article.author.lastName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                        <Icon path={mdiEye} size={0.6} color="currentColor" />
                        {article.viewCount}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                        <Icon path={mdiThumbUpOutline} size={0.6} color="currentColor" />
                        {article.helpfulCount}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>
                      {relativeTime(article.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
