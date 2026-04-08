'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Icon from '@mdi/react';
import { mdiChevronLeft, mdiCheckCircle, mdiClipboardTextOutline } from '@mdi/js';
import Link from 'next/link';
import RichTextField from '@/components/RichTextField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
}

interface PublishedForm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

// ─── Validation Schema ────────────────────────────────────────────────────────

const submitRequestSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title is too long'),
  description: z.string().min(10, 'Please provide more detail (at least 10 characters)'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  categoryId: z.string().min(1, 'Category is required'),
});

type SubmitRequestFormData = z.infer<typeof submitRequestSchema>;

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  isSelected,
  onClick,
}: {
  category: Category;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        padding: 16,
        border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        borderRadius: 10,
        backgroundColor: isSelected ? '#eef2ff' : 'var(--bg-primary)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        width: '100%',
      }}
    >
      {isSelected && (
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <Icon path={mdiCheckCircle} size={0.8} color="#4f46e5" />
        </div>
      )}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: category.color ?? 'var(--badge-indigo-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        {category.icon ?? '🎫'}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{category.name}</span>
      {category.description && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {category.description}
        </span>
      )}
    </button>
  );
}

// ─── Submit New Request Page ──────────────────────────────────────────────────

export default function NewRequestPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [customForms, setCustomForms] = useState<PublishedForm[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitRequestFormData>({
    resolver: zodResolver(submitRequestSchema),
    defaultValues: {
      priority: 'MEDIUM',
    },
  });

  // Load categories on mount
  useEffect(() => {
    async function fetchCategories() {
      setCategoriesLoading(true);
      try {
        const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load categories');
        const data = (await res.json()) as { categories: Category[] };
        setCategories(data.categories ?? []);
      } catch {
        // Show empty state — form remains usable
      } finally {
        setCategoriesLoading(false);
      }
    }
    void fetchCategories();

    // Also fetch published custom forms
    async function fetchCustomForms() {
      try {
        const res = await fetch('/api/v1/custom-forms/published', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setCustomForms(Array.isArray(data) ? data : []);
        }
      } catch {
        // Non-critical
      }
    }
    void fetchCustomForms();
  }, []);

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setValue('categoryId', category.id);
    setStep(2);
  };

  const onSubmit = async (data: SubmitRequestFormData) => {
    setSubmitError(null);
    try {
      const res = await fetch('/api/v1/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          type: 'SERVICE_REQUEST',
          priority: data.priority,
          categoryId: data.categoryId,
          source: 'PORTAL',
        }),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errData.error ?? errData.message ?? `Failed to create ticket: ${res.status}`);
      }

      const newTicket = (await res.json()) as { id: string; ticketNumber: string };
      router.push(`/portal/tickets/${newTicket.id}?created=1`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit request');
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 13,
              padding: 0,
              marginBottom: 12,
            }}
          >
            <Icon path={mdiChevronLeft} size={0.8} color="currentColor" />
            Back to categories
          </button>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          Submit New Request
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
          {step === 1
            ? 'Step 1 of 2: Choose a category for your request'
            : `Step 2 of 2: Describe your request${selectedCategory ? ` — ${selectedCategory.name}` : ''}`}
        </p>
      </div>

      {/* ── Progress Indicator ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
        {[1, 2].map((s) => (
          <div
            key={s}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 2,
              backgroundColor: s <= step ? 'var(--accent-primary)' : 'var(--border-primary)',
              transition: 'background-color 0.2s ease',
            }}
          />
        ))}
      </div>

      {/* ── Step 1: Category Picker ───────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          {categoriesLoading ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
              Loading categories...
            </p>
          ) : categories.length === 0 ? (
            // Fallback: no categories — skip to step 2 with no category
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
                No categories configured. You can still submit a general request.
              </p>
              <button
                type="button"
                onClick={() => {
                  setValue('categoryId', '');
                  setStep(2);
                }}
                style={{
                  padding: '10px 24px',
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Continue without category
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              {categories.map((cat) => (
                <div key={cat.id} style={{ position: 'relative' }}>
                  <CategoryCard
                    category={cat}
                    isSelected={selectedCategory?.id === cat.id}
                    onClick={() => handleCategorySelect(cat)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Custom Forms Section ─────────────────────────────────────────── */}
          {customForms.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Service Forms
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                {customForms.map((form) => (
                  <Link
                    key={form.id}
                    href={`/portal/forms/${form.slug}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 6,
                      padding: 16,
                      border: '2px solid var(--border-primary)',
                      borderRadius: 10,
                      backgroundColor: 'var(--bg-primary)',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: (form.color ?? '#0d9488') + '1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon path={mdiClipboardTextOutline} size={0.7} color={form.color ?? '#0d9488'} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{form.name}</span>
                    {form.description && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {form.description}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Request Form ──────────────────────────────────────────────── */}
      {step === 2 && (
        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          {/* Hidden categoryId field (set via setValue) */}
          <input type="hidden" {...register('categoryId')} />

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="title"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}
            >
              Title <span style={{ color: 'var(--accent-danger)' }}>*</span>
            </label>
            <input
              id="title"
              type="text"
              placeholder="Brief summary of your request"
              {...register('title')}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${errors.title ? 'var(--accent-danger)' : 'var(--border-secondary)'}`,
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {errors.title && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="description"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}
            >
              Description <span style={{ color: 'var(--accent-danger)' }}>*</span>
            </label>
            <RichTextField
              value={watch('description') ?? ''}
              onChange={(html) => setValue('description', html, { shouldValidate: true })}
              placeholder="Describe your request in detail. Include any relevant information, error messages, or steps to reproduce."
              minHeight={120}
            />
            {errors.description && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 28 }}>
            <label
              htmlFor="priority"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}
            >
              Priority
            </label>
            <select
              id="priority"
              {...register('priority')}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                backgroundColor: 'var(--bg-primary)',
                boxSizing: 'border-box',
              }}
            >
              <option value="LOW">Low — Non-urgent, when you get a chance</option>
              <option value="MEDIUM">Medium — Affecting my work but I can manage</option>
              <option value="HIGH">High — Significantly impacting my work</option>
              <option value="CRITICAL">Critical — Completely blocked, urgent help needed</option>
            </select>
            {errors.priority && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--accent-danger)' }}>
                {errors.priority.message}
              </p>
            )}
          </div>

          {/* Submit Error */}
          {submitError && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--badge-red-bg)',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                color: '#991b1b',
              }}
            >
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: '10px 20px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                backgroundColor: 'var(--bg-primary)',
                cursor: 'pointer',
                fontSize: 14,
                color: 'var(--text-secondary)',
              }}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 28px',
                backgroundColor: isSubmitting ? '#a5b4fc' : 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 8,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
