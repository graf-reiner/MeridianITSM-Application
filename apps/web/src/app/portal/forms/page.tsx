'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiFormSelect, mdiFileDocumentOutline } from '@mdi/js';

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

export default function ServiceFormsPage() {
  const [forms, setForms] = useState<PublishedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon path={mdiFormSelect} size={1.1} color="var(--accent-primary)" />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Service Forms
          </h1>
        </div>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          Submit a request using one of the forms below
        </p>
      </div>

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {forms.map((form) => (
            <FormCard key={form.id} form={form} />
          ))}
        </div>
      )}
    </div>
  );
}
