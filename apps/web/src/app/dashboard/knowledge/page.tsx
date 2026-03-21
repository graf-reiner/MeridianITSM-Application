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
    case 'PUBLISHED': return { bg: '#d1fae5', text: '#065f46' };
    case 'IN_REVIEW': return { bg: '#dbeafe', text: '#1e40af' };
    case 'DRAFT': return { bg: '#f3f4f6', text: '#374151' };
    case 'RETIRED': return { bg: '#fee2e2', text: '#991b1b' };
    default: return { bg: '#f3f4f6', text: '#374151' };
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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiBookOpenVariant} size={1} color="#4f46e5" />
          Knowledge Base
        </h1>
        <Link
          href="/dashboard/knowledge/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: '#4f46e5',
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
            <Icon path={mdiMagnify} size={0.8} color="#9ca3af" />
          </div>
          <input
            type="search"
            placeholder="Search articles..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '8px 10px 8px 34px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
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
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
        >
          <option value="">All Visibility</option>
          <option value="PUBLIC">Public</option>
          <option value="INTERNAL">Internal</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading articles...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          {error instanceof Error ? error.message : 'Failed to load articles'}
        </div>
      ) : articles.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiBookOpenVariant} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: '#6b7280', fontSize: 14 }}>No articles found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Visibility</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Author</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Views</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Helpful</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => {
                const statusStyle = getStatusStyle(article.status);
                return (
                  <tr key={article.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/dashboard/knowledge/${article.id}`} style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}>
                        {article.title}
                      </Link>
                      {article.summary && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                          {article.summary}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {article.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>
                      {article.visibility}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {article.author ? `${article.author.firstName} ${article.author.lastName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6b7280' }}>
                        <Icon path={mdiEye} size={0.6} color="currentColor" />
                        {article.viewCount}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6b7280' }}>
                        <Icon path={mdiThumbUpOutline} size={0.6} color="currentColor" />
                        {article.helpfulCount}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
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
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14, color: '#6b7280' }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
