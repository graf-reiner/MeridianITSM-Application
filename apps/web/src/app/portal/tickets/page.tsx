'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiTicketOutline, mdiPlus, mdiClockOutline } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'all' | 'open' | 'resolved' | 'closed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'NEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'OPEN': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'PENDING': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'RESOLVED': return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
    case 'CLOSED': return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
    case 'CANCELLED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default: return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
  }
}

function getPriorityStyle(priority: string): { bg: string; text: string } {
  switch (priority) {
    case 'CRITICAL': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'HIGH': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'MEDIUM': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'LOW': return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
    default: return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
  }
}

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const OPEN_STATUSES = new Set(['NEW', 'OPEN', 'IN_PROGRESS', 'PENDING']);
const RESOLVED_STATUSES = new Set(['RESOLVED']);
const CLOSED_STATUSES = new Set(['CLOSED', 'CANCELLED']);

// ─── My Tickets Page ──────────────────────────────────────────────────────────

export default function PortalTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const PAGE_SIZE = 20;

  useEffect(() => {
    async function fetchTickets() {
      setIsLoading(true);
      setError(null);
      try {
        // requestedById is resolved server-side from the JWT session
        const params = new URLSearchParams({
          pageSize: String(PAGE_SIZE),
          page: String(page),
        });
        const res = await fetch(`/api/v1/tickets?requestedById=me&${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
        const data = (await res.json()) as { tickets: Ticket[]; total: number };
        setTickets(data.tickets ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tickets');
      } finally {
        setIsLoading(false);
      }
    }
    void fetchTickets();
  }, [page]);

  const filteredTickets = tickets.filter((ticket) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'open') return OPEN_STATUSES.has(ticket.status);
    if (activeFilter === 'resolved') return RESOLVED_STATUSES.has(ticket.status);
    if (activeFilter === 'closed') return CLOSED_STATUSES.has(ticket.status);
    return true;
  });

  const tabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'closed', label: 'Closed' },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>My Tickets</h1>
        <Link
          href="/portal/tickets/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--bg-primary)',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon path={mdiPlus} size={0.8} color="currentColor" />
          New Request
        </Link>
      </div>

      {/* ── Status Filter Tabs ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          borderBottom: '1px solid var(--border-primary)',
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveFilter(tab.id);
              setPage(1);
            }}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeFilter === tab.id ? 600 : 400,
              color: activeFilter === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: activeFilter === tab.id ? '2px solid #4f46e5' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Ticket List ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading tickets...
        </div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>{error}</div>
      ) : filteredTickets.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiTicketOutline} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            {activeFilter === 'all'
              ? 'No tickets yet. Submit your first request!'
              : `No ${activeFilter} tickets.`}
          </p>
          {activeFilter === 'all' && (
            <Link
              href="/portal/tickets/new"
              style={{
                display: 'inline-block',
                marginTop: 16,
                padding: '8px 20px',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                textDecoration: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Submit New Request
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTickets.map((ticket) => {
            const statusStyle = getStatusStyle(ticket.status);
            const priorityStyle = getPriorityStyle(ticket.priority);
            return (
              <Link
                key={ticket.id}
                href={`/portal/tickets/${ticket.id}`}
                style={{
                  display: 'block',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: '0 0 4px',
                        fontSize: 15,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ticket.title}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-placeholder)' }}>
                      {ticket.ticketNumber}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                      }}
                    >
                      {ticket.status.replace(/_/g, ' ')}
                    </span>

                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: priorityStyle.bg,
                        color: priorityStyle.text,
                      }}
                    >
                      {ticket.priority}
                    </span>

                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        fontSize: 12,
                        color: 'var(--text-placeholder)',
                      }}
                    >
                      <Icon path={mdiClockOutline} size={0.6} color="currentColor" />
                      {relativeTime(ticket.updatedAt)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              backgroundColor: 'var(--bg-primary)',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
              fontSize: 14,
            }}
          >
            Previous
          </button>
          <span style={{ padding: '6px 12px', fontSize: 14, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              backgroundColor: 'var(--bg-primary)',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? 0.5 : 1,
              fontSize: 14,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
