'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiFormSelect, mdiFileDocumentOutline, mdiMagnify, mdiClockOutline } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublishedForm {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

// ─── Form Card ────────────────────────────────────────────────────────────────

function FormCard({ form }: { form: PublishedForm }) {
  const accentColor = form.color ?? '#6366f1';

  return (
    <Link
      href={`/portal/forms/${form.slug}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
          padding: 16,
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          backgroundColor: 'var(--bg-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          height: '100%',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = accentColor;
          e.currentTarget.style.boxShadow = `0 0 0 1px ${accentColor}22`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-primary)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: `${accentColor}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            path={form.icon ?? mdiFileDocumentOutline}
            size={0.9}
            color={accentColor}
          />
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {form.name}
        </span>
        {form.description && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {form.description}
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Service Forms Catalog ────────────────────────────────────────────────────

const RECENT_FORMS_KEY = 'meridian_recent_forms';

function getRecentFormSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_FORMS_KEY) ?? '[]') as string[];
  } catch { return []; }
}

function addRecentForm(slug: string) {
  const recent = getRecentFormSlugs().filter((s) => s !== slug);
  recent.unshift(slug);
  localStorage.setItem(RECENT_FORMS_KEY, JSON.stringify(recent.slice(0, 5)));
}

export default function ServiceFormsPage() {
  const [forms, setForms] = useState<PublishedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchForms() {
      try {
        const res = await fetch('/api/v1/custom-forms/published', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load forms');
        const data = await res.json();
        setForms(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load forms');
      } finally {
        setLoading(false);
      }
    }
    void fetchForms();
  }, []);

  const recentSlugs = getRecentFormSlugs();
  const recentForms = recentSlugs
    .map((slug) => forms.find((f) => f.slug === slug))
    .filter(Boolean) as PublishedForm[];

  const filtered = search
    ? forms.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : forms;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon path={mdiFormSelect} size={1.1} color="var(--accent-primary)" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Service Catalog
          </h1>
        </div>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          Browse available services and submit a request
        </p>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      {forms.length > 3 && (
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Icon
            path={mdiMagnify}
            size={0.75}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 12, top: 10 }}
          />
          <input
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
          Loading forms...
        </p>
      ) : error ? (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--badge-red-bg)',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            fontSize: 13,
            color: '#991b1b',
          }}
        >
          Failed to load service forms. Please try again later.
        </div>
      ) : forms.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            border: '1px dashed var(--border-primary)',
            borderRadius: 12,
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <Icon path={mdiFileDocumentOutline} size={2} color="var(--text-muted)" />
          <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 14 }}>
            No service forms available
          </p>
        </div>
      ) : (
        <>
          {/* Recently Used */}
          {!search && recentForms.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon path={mdiClockOutline} size={0.65} color="var(--text-muted)" />
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Recently Used
                </h2>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 10,
                }}
              >
                {recentForms.map((form) => (
                  <div key={form.id} onClick={() => addRecentForm(form.slug)}>
                    <FormCard form={form} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Services */}
          <div>
            {!search && recentForms.length > 0 && (
              <h2 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                All Services
              </h2>
            )}
            {filtered.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                No services match &ldquo;{search}&rdquo;
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                {filtered.map((form) => (
                  <div key={form.id} onClick={() => addRecentForm(form.slug)}>
                    <FormCard form={form} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
