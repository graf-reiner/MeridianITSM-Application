'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Icon from '@mdi/react';
import { mdiChevronLeft, mdiCheckCircle } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
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
        border: `2px solid ${isSelected ? '#4f46e5' : '#e5e7eb'}`,
        borderRadius: 10,
        backgroundColor: isSelected ? '#eef2ff' : '#fff',
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
          backgroundColor: category.color ?? '#e0e7ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        {category.icon ?? '🎫'}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{category.name}</span>
      {category.description && (
        <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
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
  const [step, setStep] = useState<1 | 2>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
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
              color: '#6b7280',
              fontSize: 13,
              padding: 0,
              marginBottom: 12,
            }}
          >
            <Icon path={mdiChevronLeft} size={0.8} color="currentColor" />
            Back to categories
          </button>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
          Submit New Request
        </h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
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
              backgroundColor: s <= step ? '#4f46e5' : '#e5e7eb',
              transition: 'background-color 0.2s ease',
            }}
          />
        ))}
      </div>

      {/* ── Step 1: Category Picker ───────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          {categoriesLoading ? (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: 32 }}>
              Loading categories...
            </p>
          ) : categories.length === 0 ? (
            // Fallback: no categories — skip to step 2 with no category
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#6b7280', marginBottom: 16 }}>
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
                  backgroundColor: '#4f46e5',
                  color: '#fff',
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
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}
            >
              Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="title"
              type="text"
              placeholder="Brief summary of your request"
              {...register('title')}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${errors.title ? '#ef4444' : '#d1d5db'}`,
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {errors.title && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="description"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}
            >
              Description <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              id="description"
              rows={5}
              placeholder="Describe your request in detail. Include any relevant information, error messages, or steps to reproduce."
              {...register('description')}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: `1px solid ${errors.description ? '#ef4444' : '#d1d5db'}`,
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
            {errors.description && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 28 }}>
            <label
              htmlFor="priority"
              style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}
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
                backgroundColor: '#fff',
                boxSizing: 'border-box',
              }}
            >
              <option value="LOW">Low — Non-urgent, when you get a chance</option>
              <option value="MEDIUM">Medium — Affecting my work but I can manage</option>
              <option value="HIGH">High — Significantly impacting my work</option>
              <option value="CRITICAL">Critical — Completely blocked, urgent help needed</option>
            </select>
            {errors.priority && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>
                {errors.priority.message}
              </p>
            )}
          </div>

          {/* Submit Error */}
          {submitError && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#fee2e2',
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
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: 14,
                color: '#374151',
              }}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 28px',
                backgroundColor: isSubmitting ? '#a5b4fc' : '#4f46e5',
                color: '#fff',
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
