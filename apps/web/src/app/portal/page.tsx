'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiPlus, mdiBookOpenVariant, mdiTicketOutline, mdiClockOutline } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface TicketStats {
  open: number;
  pending: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'NEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'OPEN': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'PENDING': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'RESOLVED': return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
    case 'CLOSED': return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
    case 'CANCELLED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
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

// ─── Portal Home Page ─────────────────────────────────────────────────────────

export default function PortalHomePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats>({ open: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTickets() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/tickets?pageSize=5', {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
        const data = (await res.json()) as { tickets: Ticket[]; total: number };

        setTickets(data.tickets ?? []);

        // Calculate stats from full list
        const allOpen = (data.tickets ?? []).filter(
          (t) => t.status === 'NEW' || t.status === 'OPEN' || t.status === 'IN_PROGRESS'
        ).length;
        const allPending = (data.tickets ?? []).filter((t) => t.status === 'PENDING').length;
        setStats({ open: allOpen, pending: allPending });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tickets');
      } finally {
        setIsLoading(false);
      }
    }
    void fetchTickets();
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Greeting ──────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
          Welcome back
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 15 }}>
          How can we help you today?
        </p>
      </div>

      {/* ── Quick Stats ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            Open Tickets
          </p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isLoading ? '—' : stats.open}
          </p>
        </div>

        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            Pending Tickets
          </p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isLoading ? '—' : stats.pending}
          </p>
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <Link
          href="/portal/tickets/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--bg-primary)',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon path={mdiPlus} size={0.8} color="currentColor" />
          Submit New Request
        </Link>

        <Link
          href="/portal/knowledge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            border: '1px solid #d1d5db',
          }}
        >
          <Icon path={mdiBookOpenVariant} size={0.8} color="currentColor" />
          Browse Knowledge Base
        </Link>
      </div>

      {/* ── Recent Tickets ────────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Recent Tickets
          </h2>
          <Link
            href="/portal/tickets"
            style={{ fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading tickets...
          </div>
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--accent-danger)' }}>{error}</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Icon path={mdiTicketOutline} size={2} color="#d1d5db" />
            <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
              No tickets yet. Submit your first request!
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tickets.map((ticket, index) => {
              const statusColor = getStatusColor(ticket.status);
              return (
                <li
                  key={ticket.id}
                  style={{
                    borderBottom: index < tickets.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <Link
                    href={`/portal/tickets/${ticket.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 20px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ticket.title}
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-placeholder)' }}>
                        {ticket.ticketNumber}
                      </p>
                    </div>

                    <span
                      style={{
                        flexShrink: 0,
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: statusColor.bg,
                        color: statusColor.text,
                      }}
                    >
                      {ticket.status.replace(/_/g, ' ')}
                    </span>

                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-placeholder)' }}>
                      <Icon path={mdiClockOutline} size={0.6} color="currentColor" />
                      {relativeTime(ticket.createdAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
