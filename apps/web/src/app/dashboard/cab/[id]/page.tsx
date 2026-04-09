'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiAccountGroup,
  mdiCalendarExport,
  mdiVideoOutline,
  mdiMapMarkerOutline,
  mdiCheckCircle,
  mdiCloseCircle,
  mdiMinusCircleOutline,
  mdiClockOutline,
  mdiSwapHorizontal,
  mdiAccountPlus,
} from '@mdi/js';
import Breadcrumb from '@/components/Breadcrumb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attendee {
  id: string;
  role: string;
  rsvpStatus: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

interface AgendaChange {
  id: string;
  agendaOrder: number;
  outcome: string | null;
  outcomeNotes: string | null;
  change: {
    id: string;
    changeNumber: string;
    title: string;
    type: string;
    status: string;
    riskLevel: string;
  };
}

interface CABMeetingDetail {
  id: string;
  title: string;
  scheduledFor: string;
  status: string;
  location: string | null;
  meetingUrl: string | null;
  durationMinutes: number | null;
  notes: string | null;
  attendees: Attendee[];
  changes: AgendaChange[];
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'SCHEDULED':   return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'COMPLETED':   return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'CANCELLED':   return { bg: 'var(--bg-tertiary)', text: '#9ca3af' };
    default:            return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function getRsvpIcon(rsvpStatus: string): { path: string; color: string } {
  switch (rsvpStatus) {
    case 'ACCEPTED':   return { path: mdiCheckCircle, color: '#16a34a' };
    case 'DECLINED':   return { path: mdiCloseCircle, color: '#dc2626' };
    case 'TENTATIVE':  return { path: mdiMinusCircleOutline, color: '#d97706' };
    default:           return { path: mdiClockOutline, color: '#9ca3af' };
  }
}

function getRsvpBadge(rsvpStatus: string): { bg: string; text: string } {
  switch (rsvpStatus) {
    case 'ACCEPTED':  return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'DECLINED':  return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'TENTATIVE': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    default:          return { bg: 'var(--bg-tertiary)', text: '#9ca3af' };
  }
}

function getOutcomeBadge(outcome: string | null): { bg: string; text: string } {
  switch (outcome) {
    case 'APPROVED':       return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'REJECTED':       return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'DEFERRED':       return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'NEEDS_MORE_INFO': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    default:               return { bg: 'var(--bg-tertiary)', text: '#9ca3af' };
  }
}

function getRiskStyle(risk: string): { bg: string; text: string } {
  switch (risk) {
    case 'LOW':      return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'MEDIUM':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'HIGH':     return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'CRITICAL': return { bg: '#450a0a', text: '#fca5a5' };
    default:         return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── RSVP Buttons ─────────────────────────────────────────────────────────────

function RSVPButtons({ meetingId, onRsvp }: { meetingId: string; onRsvp: () => void }) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleRsvp = async (rsvpStatus: string) => {
    setSubmitting(rsvpStatus);
    try {
      const res = await fetch(`/api/v1/cab/meetings/${meetingId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rsvpStatus }),
      });
      if (res.ok) onRsvp();
    } finally {
      setSubmitting(null);
    }
  };

  const rsvpOptions = [
    { value: 'ACCEPTED', label: 'Accept', bg: '#16a34a', color: '#fff' },
    { value: 'TENTATIVE', label: 'Tentative', bg: '#d97706', color: '#fff' },
    { value: 'DECLINED', label: 'Decline', bg: '#dc2626', color: '#fff' },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      {rsvpOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => void handleRsvp(opt.value)}
          disabled={submitting !== null}
          style={{
            padding: '6px 12px',
            backgroundColor: opt.bg,
            color: opt.color,
            border: 'none',
            borderRadius: 5,
            fontSize: 13,
            fontWeight: 500,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting === opt.value ? '...' : opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Voting Buttons ───────────────────────────────────────────────────────────

function VotingButtons({
  meetingId,
  changeId,
  currentOutcome,
  onVoted,
}: {
  meetingId: string;
  changeId: string;
  currentOutcome: string | null;
  onVoted: () => void;
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState<string | null>(null);

  const handleVote = async (outcome: string) => {
    setSubmitting(outcome);
    try {
      const res = await fetch(`/api/v1/cab/meetings/${meetingId}/changes/${changeId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outcome, notes: notes || undefined }),
      });
      if (res.ok) {
        setActive(null);
        setNotes('');
        onVoted();
      }
    } finally {
      setSubmitting(null);
    }
  };

  const outcomes = [
    { value: 'APPROVED', label: 'Approve', bg: '#16a34a', color: '#fff' },
    { value: 'REJECTED', label: 'Reject', bg: '#dc2626', color: '#fff' },
    { value: 'DEFERRED', label: 'Defer', bg: '#d97706', color: '#fff' },
    { value: 'NEEDS_MORE_INFO', label: 'Needs Info', bg: '#1e40af', color: '#fff' },
  ];

  if (currentOutcome) {
    const badge = getOutcomeBadge(currentOutcome);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, backgroundColor: badge.bg, color: badge.text }}>
          {currentOutcome.replace(/_/g, ' ')}
        </span>
        <button
          onClick={() => void handleVote(currentOutcome)}
          style={{ fontSize: 11, color: 'var(--text-placeholder)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          change
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {outcomes.map((o) => (
          <button
            key={o.value}
            onClick={() => setActive(active === o.value ? null : o.value)}
            disabled={submitting !== null}
            style={{
              padding: '4px 10px',
              backgroundColor: active === o.value ? o.bg : 'var(--bg-primary)',
              color: active === o.value ? o.color : 'var(--text-secondary)',
              border: `1px solid ${active === o.value ? o.bg : 'var(--border-secondary)'}`,
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {active && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input
            type="text"
            placeholder="Optional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--border-secondary)', borderRadius: 4, fontSize: 12 }}
          />
          <button
            onClick={() => void handleVote(active)}
            disabled={submitting !== null}
            style={{ padding: '5px 12px', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {submitting ? '...' : 'Confirm'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CAB Meeting Detail Page ──────────────────────────────────────────────────

export default function CABMeetingDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data: meeting, isLoading, error } = useQuery<CABMeetingDetail>({
    queryKey: ['cab-meeting', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cab/meetings/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load meeting: ${res.status}`);
      return res.json() as Promise<CABMeetingDetail>;
    },
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['cab-meeting', id] });

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading meeting...</div>;
  }
  if (error || !meeting) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
      {error instanceof Error ? error.message : 'Meeting not found'}
    </div>;
  }

  const statusStyle = getStatusStyle(meeting.status);

  // For demo purposes — in production this would come from the auth session
  const isCurrentUserAttendee = false;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Breadcrumb + Header ──────────────────────────────────────────────── */}
      <Breadcrumb items={[
        { label: 'CAB Meetings', href: '/dashboard/cab' },
        { label: meeting.title },
      ]} />
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={mdiAccountGroup} size={1} color="var(--accent-primary)" />
              {meeting.title}
            </h1>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {meeting.status}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatDateTime(meeting.scheduledFor)}</span>
              {meeting.durationMinutes && (
                <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>{meeting.durationMinutes} min</span>
              )}
            </div>
          </div>

          {/* iCal download */}
          <a
            href={`/api/v1/cab/meetings/${id}/ical`}
            download={`cab-meeting-${id}.ics`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid var(--border-secondary)',
            }}
          >
            <Icon path={mdiCalendarExport} size={0.8} color="currentColor" />
            Download iCal
          </a>
        </div>
      </div>

      {/* ── Meeting Info Card ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {meeting.location && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
              <Icon path={mdiMapMarkerOutline} size={0.8} color="var(--text-placeholder)" />
              {meeting.location}
            </span>
          )}
          {meeting.meetingUrl && (
            <a
              href={meeting.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--accent-primary)', textDecoration: 'none' }}
            >
              <Icon path={mdiVideoOutline} size={0.8} color="currentColor" />
              Join Meeting
            </a>
          )}
        </div>
        {meeting.notes && (
          <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>{meeting.notes}</p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

        {/* ── Agenda / Changes ──────────────────────────────────────────────────── */}
        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiSwapHorizontal} size={0.9} color="var(--accent-primary)" />
            Agenda ({meeting.changes.length} change{meeting.changes.length !== 1 ? 's' : ''})
          </h2>

          {meeting.changes.length === 0 ? (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 32, textAlign: 'center' }}>
              <p style={{ margin: 0, color: 'var(--text-placeholder)', fontSize: 14 }}>No changes on agenda yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {meeting.changes
                .slice()
                .sort((a, b) => a.agendaOrder - b.agendaOrder)
                .map((item, idx) => {
                  const isEmergency = item.change.type === 'EMERGENCY';
                  const riskStyle = getRiskStyle(item.change.riskLevel);
                  const outcomeBadge = getOutcomeBadge(item.outcome);

                  return (
                    <div
                      key={item.id}
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: `1px solid ${isEmergency ? '#fca5a5' : 'var(--border-primary)'}`,
                        borderRadius: 10,
                        padding: 16,
                        borderLeft: isEmergency ? '4px solid #dc2626' : '4px solid var(--border-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 600, minWidth: 20 }}>
                            {idx + 1}.
                          </span>
                          <div>
                            <Link
                              href={`/dashboard/changes/${item.change.id}`}
                              style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)', textDecoration: 'none' }}
                            >
                              CHG-{item.change.changeNumber}
                            </Link>
                            <span style={{ fontSize: 14, color: 'var(--text-primary)', marginLeft: 6 }}>{item.change.title}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {isEmergency && (
                            <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 700, backgroundColor: 'var(--badge-red-bg)', color: '#991b1b' }}>
                              EMERGENCY
                            </span>
                          )}
                          <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: riskStyle.bg, color: riskStyle.text }}>
                            {item.change.riskLevel}
                          </span>
                          <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                            {item.change.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Voting / outcome */}
                      <div style={{ paddingLeft: 28 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 500 }}>CAB Decision:</p>
                        <VotingButtons
                          meetingId={id}
                          changeId={item.change.id}
                          currentOutcome={item.outcome}
                          onVoted={refresh}
                        />
                        {item.outcomeNotes && (
                          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Note: {item.outcomeNotes}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── Attendees ─────────────────────────────────────────────────────────── */}
        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiAccountGroup} size={0.9} color="var(--accent-primary)" />
            Attendees ({meeting.attendees.length})
          </h2>

          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            {meeting.attendees.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 13 }}>No attendees added</div>
            ) : (
              <div>
                {meeting.attendees.map((attendee, idx) => {
                  const rsvp = getRsvpIcon(attendee.rsvpStatus);
                  const badge = getRsvpBadge(attendee.rsvpStatus);
                  return (
                    <div
                      key={attendee.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderBottom: idx < meeting.attendees.length - 1 ? '1px solid var(--bg-tertiary)' : 'none',
                      }}
                    >
                      <Icon path={rsvp.path} size={0.85} color={rsvp.color} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {attendee.user.firstName} {attendee.user.lastName}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-placeholder)' }}>{attendee.role}</div>
                      </div>
                      <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 11, fontWeight: 500, backgroundColor: badge.bg, color: badge.text }}>
                        {attendee.rsvpStatus}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RSVP buttons for current user */}
          {isCurrentUserAttendee && (
            <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Your RSVP:</p>
              <RSVPButtons meetingId={id} onRsvp={refresh} />
            </div>
          )}

          <button
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 0',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px dashed var(--border-secondary)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            <Icon path={mdiAccountPlus} size={0.8} color="currentColor" />
            Add Attendee
          </button>
        </div>
      </div>
    </div>
  );
}
