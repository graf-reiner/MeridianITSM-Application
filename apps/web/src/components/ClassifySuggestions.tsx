'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@mdi/react';
import { mdiLightningBolt, mdiCheck, mdiClose } from '@mdi/js';

interface ClassifySuggestion {
  id?: string;
  name?: string;
  value?: string;
  matchCount: number;
}

interface ClassifyResponse {
  suggestions: {
    category: ClassifySuggestion | null;
    priority: ClassifySuggestion | null;
    queue: ClassifySuggestion | null;
    type: ClassifySuggestion | null;
  };
  confidence: 'high' | 'medium' | 'low';
  sampleSize: number;
}

interface Props {
  title: string;
  description: string;
  onApply: (field: string, value: string) => void;
}

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  medium: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
  low: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
};

/**
 * Shows AI classification suggestions below the description field
 * when creating a new ticket. Debounces 800ms after title+description change.
 */
export default function ClassifySuggestions({ title, description, onApply }: Props) {
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [appliedFields, setAppliedFields] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Reset when input changes significantly
    setDismissed(false);
    setAppliedFields(new Set());

    // Need at least a title with 5+ chars to classify
    const plainTitle = title.trim();
    if (plainTitle.length < 5) {
      setResult(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/tickets/classify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: plainTitle,
            description: description?.replace(/<[^>]*>/g, '') ?? '',
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as ClassifyResponse;
          if (data.sampleSize > 0) {
            setResult(data);
          } else {
            setResult(null);
          }
        }
      } catch {
        // Non-critical — fail silently
      } finally {
        setLoading(false);
      }
    }, 800);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [title, description]);

  if (dismissed || (!result && !loading)) return null;

  const colors = result ? CONFIDENCE_COLORS[result.confidence] : CONFIDENCE_COLORS.low;

  const suggestions: Array<{ key: string; label: string; displayValue: string; applyValue: string }> = [];
  if (result?.suggestions.category?.id) {
    suggestions.push({
      key: 'categoryId',
      label: 'Category',
      displayValue: result.suggestions.category.name ?? '',
      applyValue: result.suggestions.category.id,
    });
  }
  if (result?.suggestions.priority?.value) {
    suggestions.push({
      key: 'priority',
      label: 'Priority',
      displayValue: result.suggestions.priority.value,
      applyValue: result.suggestions.priority.value,
    });
  }
  if (result?.suggestions.queue?.id) {
    suggestions.push({
      key: 'queueId',
      label: 'Queue',
      displayValue: result.suggestions.queue.name ?? '',
      applyValue: result.suggestions.queue.id,
    });
  }
  if (result?.suggestions.type?.value) {
    suggestions.push({
      key: 'type',
      label: 'Type',
      displayValue: result.suggestions.type.value,
      applyValue: result.suggestions.type.value,
    });
  }

  if (!loading && suggestions.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: 18,
        padding: '10px 14px',
        borderRadius: 8,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: suggestions.length > 0 ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: colors.text }}>
          <Icon path={mdiLightningBolt} size={0.55} color={colors.text} />
          {loading ? 'Analyzing...' : `AI Suggestions (${result?.confidence} confidence, ${result?.sampleSize} similar tickets)`}
        </div>
        {!loading && (
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: colors.text, opacity: 0.5 }}
            aria-label="Dismiss"
          >
            <Icon path={mdiClose} size={0.5} color="currentColor" />
          </button>
        )}
      </div>

      {!loading && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => {
            const applied = appliedFields.has(s.key);
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (!applied) {
                    onApply(s.key, s.applyValue);
                    setAppliedFields((prev) => new Set(prev).add(s.key));
                  }
                }}
                disabled={applied}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: `1px solid ${applied ? '#bbf7d0' : colors.border}`,
                  backgroundColor: applied ? '#f0fdf4' : '#fff',
                  color: applied ? '#166534' : colors.text,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: applied ? 'default' : 'pointer',
                }}
              >
                {applied && <Icon path={mdiCheck} size={0.45} color="#166534" />}
                <strong>{s.label}:</strong> {s.displayValue}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
