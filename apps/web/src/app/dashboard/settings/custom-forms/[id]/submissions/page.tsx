'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '@mdi/react';
import { formatTicketNumber } from '@meridian/core/record-numbers';
import {
  mdiArrowLeft,
  mdiHistory,
  mdiClose,
  mdiChevronLeft,
  mdiChevronRight,
  mdiOpenInNew,
  mdiAlertCircleOutline,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmissionUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface SubmissionTicket {
  id: string;
  ticketNumber: number;
}

interface LayoutField {
  id: string;
  fieldDefinitionId: string;
  position: number;
  overrides?: {
    label?: string;
  };
}

interface LayoutSection {
  id: string;
  title: string;
  position: number;
  fields: LayoutField[];
}

interface LayoutSnapshot {
  sections: LayoutSection[];
}

interface Submission {
  id: string;
  formId: string;
  formVersion: number;
  ticketId: string | null;
  submittedById: string;
  valuesJson: Record<string, unknown>;
  layoutSnapshot: LayoutSnapshot | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  submittedBy: SubmissionUser;
  ticket: SubmissionTicket | null;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SubmissionsResponse {
  data: Submission[];
  pagination: PaginationInfo;
}

interface CustomForm {
  id: string;
  name: string;
  slug: string;
  layoutJson: LayoutSnapshot;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const thStyle = { padding: '10px 14px', textAlign: 'left' as const, fontWeight: 600, color: 'var(--text-secondary)' };
const tdStyle = { padding: '10px 14px' };

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    COMPLETED: { bg: 'var(--badge-green-bg, #dcfce7)', color: '#16a34a' },
    FAILED: { bg: 'var(--badge-red-bg-subtle, #fee2e2)', color: '#dc2626' },
  };
  const c = colors[status] ?? { bg: 'var(--bg-tertiary, #f3f4f6)', color: 'var(--text-muted, #9ca3af)' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

// ─── Format Date ──────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Resolve field labels from layout snapshot ────────────────────────────────

function resolveFieldLabels(
  valuesJson: Record<string, unknown>,
  layoutSnapshot: LayoutSnapshot | null,
  formLayout: LayoutSnapshot | null,
): Array<{ label: string; value: string }> {
  const layout = layoutSnapshot ?? formLayout;
  const fieldMap = new Map<string, string>();

  if (layout?.sections) {
    for (const section of layout.sections) {
      for (const field of section.fields ?? []) {
        const label = field.overrides?.label ?? field.id;
        fieldMap.set(field.id, label);
      }
    }
  }

  const entries: Array<{ label: string; value: string }> = [];
  for (const [key, val] of Object.entries(valuesJson)) {
    if (val === null || val === undefined || val === '') continue;
    const label = fieldMap.get(key) ?? key;
    const displayValue = Array.isArray(val) ? val.join(', ') : String(val);
    entries.push({ label, value: displayValue });
  }

  return entries;
}

// ─── Submission Detail Modal ──────────────────────────────────────────────────

function SubmissionDetailModal({
  submission,
  formLayout,
  onClose,
}: {
  submission: Submission;
  formLayout: LayoutSnapshot | null;
  onClose: () => void;
}) {
  const fieldEntries = resolveFieldLabels(
    submission.valuesJson,
    submission.layoutSnapshot,
    formLayout,
  );

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 600, overflow: 'auto', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            Submission Detail
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Date</div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{formatDateTime(submission.createdAt)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Submitted By</div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {submission.submittedBy.firstName} {submission.submittedBy.lastName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Ticket</div>
              <div style={{ fontSize: 14 }}>
                {submission.ticket ? (
                  <Link
                    href={`/dashboard/tickets/${submission.ticket.id}`}
                    style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    {formatTicketNumber(submission.ticket.ticketNumber)}
                    <Icon path={mdiOpenInNew} size={0.55} color="currentColor" />
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>--</span>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
              <StatusBadge status={submission.status} />
            </div>
          </div>

          {/* Error Message */}
          {submission.status === 'FAILED' && submission.errorMessage && (
            <div style={{ padding: '10px 14px', marginBottom: 20, backgroundColor: 'var(--badge-red-bg-subtle, #fee2e2)', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Icon path={mdiAlertCircleOutline} size={0.7} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Error</div>
                {submission.errorMessage}
              </div>
            </div>
          )}

          {/* Submitted Values */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border-primary)' }}>
              Submitted Values
            </div>
            {fieldEntries.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fieldEntries.map((entry, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 120, flexShrink: 0 }}>
                      {entry.label}:
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {entry.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No values recorded.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Submission History Page ──────────────────────────────────────────────────

export default function SubmissionHistoryPage() {
  const params = useParams();
  const formId = params.id as string;

  const [page, setPage] = useState(1);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  const pageSize = 20;

  // Fetch form details (for name + layout)
  const { data: form } = useQuery<CustomForm>({
    queryKey: ['custom-form', formId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/custom-forms/${formId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load form');
      return res.json();
    },
  });

  // Fetch submissions
  const { data: submissionsData, isLoading } = useQuery<SubmissionsResponse>({
    queryKey: ['custom-form-submissions', formId, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/custom-forms/${formId}/submissions?page=${page}&pageSize=${pageSize}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Failed to load submissions');
      return res.json();
    },
  });

  const submissions = submissionsData?.data ?? [];
  const pagination = submissionsData?.pagination;

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Link
          href={`/dashboard/settings/custom-forms/${formId}`}
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiHistory} size={1} color="#6366f1" />
          Submission History
        </h1>
      </div>

      {/* Subtitle */}
      <p style={{ margin: '0 0 20px 0', fontSize: 14, color: 'var(--text-muted)', paddingLeft: 34 }}>
        {form?.name ?? 'Loading...'}
      </p>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading submissions...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Submitted By</th>
                <th style={thStyle}>Ticket #</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr
                  key={sub.id}
                  onClick={() => setSelectedSubmission(sub)}
                  style={{ borderBottom: '1px solid var(--bg-tertiary)', cursor: 'pointer', transition: 'background-color 0.15s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-secondary)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  <td style={{ ...tdStyle, fontSize: 13, color: 'var(--text-secondary)' }}>
                    {formatDateTime(sub.createdAt)}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>
                    {sub.submittedBy.firstName} {sub.submittedBy.lastName}
                  </td>
                  <td style={tdStyle}>
                    {sub.ticket ? (
                      <Link
                        href={`/dashboard/tickets/${sub.ticket.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {formatTicketNumber(sub.ticket.ticketNumber)}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>--</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={sub.status} />
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                    No submissions found for this form.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>
            Showing {((pagination.page - 1) * pagination.pageSize) + 1}
            {' '}-{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)}
            {' '}of {pagination.total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', border: '1px solid var(--border-secondary)',
                borderRadius: 7, fontSize: 13, cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                opacity: pagination.page <= 1 ? 0.5 : 1,
              }}
            >
              <Icon path={mdiChevronLeft} size={0.7} color="currentColor" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', border: '1px solid var(--border-secondary)',
                borderRadius: 7, fontSize: 13, cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                opacity: pagination.page >= pagination.totalPages ? 0.5 : 1,
              }}
            >
              Next
              <Icon path={mdiChevronRight} size={0.7} color="currentColor" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedSubmission && (
        <SubmissionDetailModal
          submission={selectedSubmission}
          formLayout={form?.layoutJson ?? null}
          onClose={() => setSelectedSubmission(null)}
        />
      )}
    </div>
  );
}
