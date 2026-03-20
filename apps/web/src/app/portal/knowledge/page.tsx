'use client';

import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import Icon from '@mdi/react';
import {
  mdiMagnify,
  mdiBookOpenVariant,
  mdiThumbUpOutline,
  mdiThumbDownOutline,
  mdiEye,
  mdiTagOutline,
  mdiClose,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string[];
  viewCount: number;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Safe HTML Renderer ───────────────────────────────────────────────────────

/**
 * Renders sanitized HTML content from knowledge articles.
 * DOMPurify strips all potentially dangerous tags and attributes.
 */
function SafeHtml({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'div', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });

  return (
    <div
      style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}
      // sanitized by DOMPurify with explicit allowlist — XSS safe
      dangerouslySetInnerHTML={{ __html: sanitized }} // eslint-disable-line react/no-danger
    />
  );
}

// ─── Article Detail Modal ─────────────────────────────────────────────────────

function ArticleModal({
  article,
  onClose,
}: {
  article: Article;
  onClose: () => void;
}) {
  const [voted, setVoted] = useState<'helpful' | 'not_helpful' | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);

  const handleVote = async (vote: 'helpful' | 'not_helpful') => {
    if (voted) return; // Already voted
    setVoteLoading(true);
    try {
      const res = await fetch(`/api/v1/knowledge/${article.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ vote }),
      });
      if (res.ok) {
        setVoted(vote);
      }
    } catch {
      // Non-critical — ignore errors
    } finally {
      setVoteLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 760,
          maxHeight: '85vh',
          overflow: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            backgroundColor: '#fff',
            borderBottom: '1px solid #e5e7eb',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            zIndex: 1,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
            {article.title}
          </h2>
          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              padding: 4,
              borderRadius: 6,
            }}
            aria-label="Close"
          >
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>

        {/* Article metadata */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 12,
            color: '#9ca3af',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon path={mdiEye} size={0.7} color="currentColor" />
            {article.viewCount} views
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon path={mdiThumbUpOutline} size={0.7} color="currentColor" />
            {article.helpfulCount} found helpful
          </span>
          {article.tags.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Icon path={mdiTagOutline} size={0.7} color="currentColor" />
              {article.tags.join(', ')}
            </span>
          )}
        </div>

        {/* Article content (sanitized HTML) */}
        <div style={{ padding: '24px' }}>
          <SafeHtml html={article.content} />
        </div>

        {/* Vote section */}
        <div
          style={{
            padding: '20px 24px',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280', fontWeight: 500 }}>
            Was this article helpful?
          </p>
          <button
            onClick={() => void handleVote('helpful')}
            disabled={voted !== null || voteLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              backgroundColor: voted === 'helpful' ? '#d1fae5' : '#fff',
              color: voted === 'helpful' ? '#065f46' : '#374151',
              cursor: voted !== null ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Icon path={mdiThumbUpOutline} size={0.75} color="currentColor" />
            Yes
          </button>
          <button
            onClick={() => void handleVote('not_helpful')}
            disabled={voted !== null || voteLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              backgroundColor: voted === 'not_helpful' ? '#fee2e2' : '#fff',
              color: voted === 'not_helpful' ? '#991b1b' : '#374151',
              cursor: voted !== null ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Icon path={mdiThumbDownOutline} size={0.75} color="currentColor" />
            No
          </button>
          {voted && (
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Thank you for your feedback!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Knowledge Base Page ──────────────────────────────────────────────────────

export default function PortalKnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchArticles = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`/api/v1/knowledge/published?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to load articles: ${res.status}`);
      const data = (await res.json()) as { articles: Article[] };
      setArticles(data.articles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArticles(debouncedSearch);
  }, [debouncedSearch, fetchArticles]);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
          Knowledge Base
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          Browse guides and answers to common questions
        </p>
      </div>

      {/* ── Search Bar ────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <Icon path={mdiMagnify} size={0.9} color="#9ca3af" />
        </div>
        <input
          type="search"
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 12px 12px 40px',
            border: '1px solid #d1d5db',
            borderRadius: 10,
            fontSize: 15,
            outline: 'none',
            backgroundColor: '#fff',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── Article List ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Loading articles...
        </div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>
      ) : articles.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiBookOpenVariant} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: '#6b7280', fontSize: 14 }}>
            {debouncedSearch
              ? `No articles found for "${debouncedSearch}"`
              : 'No articles available yet'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {articles.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => setSelectedArticle(article)}
              style={{
                display: 'block',
                width: '100%',
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '16px 18px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease',
              }}
            >
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
                {article.title}
              </h3>

              {article.summary && (
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: 13,
                    color: '#6b7280',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {article.summary}
                </p>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {article.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          backgroundColor: '#f3f4f6',
                          fontSize: 11,
                          color: '#6b7280',
                          fontWeight: 500,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Icon path={mdiEye} size={0.6} color="currentColor" />
                    {article.viewCount}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Icon path={mdiThumbUpOutline} size={0.6} color="currentColor" />
                    {article.helpfulCount}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Article Detail Modal ──────────────────────────────────────────────── */}
      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </div>
  );
}
