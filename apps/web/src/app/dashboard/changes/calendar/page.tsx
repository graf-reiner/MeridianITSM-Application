'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiCalendar, mdiChevronLeft, mdiChevronRight, mdiViewList } from '@mdi/js';
import { formatChangeNumber } from '@meridian/core/record-numbers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarChange {
  id: string;
  changeNumber: string;
  title: string;
  type: string;
  status: string;
  riskLevel: string;
  scheduledStart: string;
  scheduledEnd: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskColor(risk: string): { bg: string; text: string; border: string } {
  switch (risk) {
    case 'LOW':      return { bg: 'var(--badge-green-bg)', text: '#065f46', border: '#16a34a' };
    case 'MEDIUM':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e', border: '#d97706' };
    case 'HIGH':     return { bg: 'var(--badge-red-bg)', text: '#991b1b', border: '#dc2626' };
    case 'CRITICAL': return { bg: '#450a0a', text: '#fca5a5', border: '#dc2626' };
    default:         return { bg: 'var(--bg-tertiary)', text: '#374151', border: 'var(--border-secondary)' };
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = date.setHours(0, 0, 0, 0);
  const s = new Date(start).setHours(0, 0, 0, 0);
  const e = new Date(end).setHours(23, 59, 59, 999);
  return d >= s && d <= e;
}

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from Sunday of the first week
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  // End on Saturday of the last week
  const endDate = new Date(lastDay);
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const days: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Change Calendar Page ─────────────────────────────────────────────────────

export default function ChangeCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const monthStart = new Date(year, month, 1).toISOString();
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data, isLoading } = useQuery<{ changes: CalendarChange[] }>({
    queryKey: ['changes-calendar', year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ start: monthStart, end: monthEnd });
      const res = await fetch(`/api/v1/changes/calendar?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load calendar: ${res.status}`);
      return res.json() as Promise<{ changes: CalendarChange[] }>;
    },
  });

  const changes = data?.changes ?? [];
  const days = getCalendarDays(year, month);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const getChangesForDay = (day: Date): CalendarChange[] => {
    return changes.filter((c) => {
      const start = new Date(c.scheduledStart);
      const end = c.scheduledEnd ? new Date(c.scheduledEnd) : start;
      return isDateInRange(day, start, end);
    });
  };

  const isToday = (day: Date): boolean => isSameDay(day, today);
  const isCurrentMonth = (day: Date): boolean => day.getMonth() === month;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiCalendar} size={1} color="var(--accent-primary)" />
          Change Calendar
        </h1>
        <Link
          href="/dashboard/changes"
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
          <Icon path={mdiViewList} size={0.8} color="currentColor" />
          List View
        </Link>
      </div>

      {/* ── Month Navigator ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
        <button
          onClick={prevMonth}
          style={{ display: 'flex', alignItems: 'center', padding: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer' }}
          aria-label="Previous month"
        >
          <Icon path={mdiChevronLeft} size={1} color="var(--text-secondary)" />
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', minWidth: 200, textAlign: 'center' }}>
          {MONTH_NAMES[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          style={{ display: 'flex', alignItems: 'center', padding: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, cursor: 'pointer' }}
          aria-label="Next month"
        >
          <Icon path={mdiChevronRight} size={1} color="var(--text-secondary)" />
        </button>
      </div>

      {/* ── Risk Legend ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((risk) => {
          const style = getRiskColor(risk);
          return (
            <span
              key={risk}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: style.bg, border: `2px solid ${style.border}`, display: 'inline-block' }} />
              {risk}
            </span>
          );
        })}
      </div>

      {/* ── Calendar Grid ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading calendar...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
            {DAY_NAMES.map((day) => (
              <div
                key={day}
                style={{ padding: '8px 4px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Week rows */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {days.map((day, idx) => {
              const dayChanges = getChangesForDay(day);
              const isThisMonth = isCurrentMonth(day);
              const isTodayDay = isToday(day);

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: 100,
                    borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--border-primary)' : 'none',
                    borderBottom: idx < days.length - 7 ? '1px solid var(--border-primary)' : 'none',
                    padding: '6px 4px',
                    backgroundColor: isThisMonth ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                  }}
                >
                  {/* Day number */}
                  <div style={{ marginBottom: 4, textAlign: 'right', paddingRight: 4 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        fontSize: 13,
                        fontWeight: isTodayDay ? 700 : 400,
                        color: isTodayDay ? '#fff' : isThisMonth ? 'var(--text-secondary)' : 'var(--border-secondary)',
                        backgroundColor: isTodayDay ? 'var(--accent-primary)' : 'transparent',
                      }}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Change bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {dayChanges.slice(0, 3).map((c) => {
                      const riskStyle = getRiskColor(c.riskLevel);
                      const isEmergency = c.type === 'EMERGENCY';
                      return (
                        <Link
                          key={c.id}
                          href={`/dashboard/changes/${c.id}`}
                          style={{
                            display: 'block',
                            padding: '2px 6px',
                            borderRadius: 3,
                            fontSize: 11,
                            fontWeight: isEmergency ? 700 : 500,
                            backgroundColor: isEmergency ? 'var(--badge-red-bg)' : riskStyle.bg,
                            color: isEmergency ? '#991b1b' : riskStyle.text,
                            borderLeft: `3px solid ${isEmergency ? '#dc2626' : riskStyle.border}`,
                            textDecoration: 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={`${formatChangeNumber(c.changeNumber)}: ${c.title}`}
                        >
                          {isEmergency && '! '}{formatChangeNumber(c.changeNumber)}
                        </Link>
                      );
                    })}
                    {dayChanges.length > 3 && (
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)', paddingLeft: 6 }}>
                        +{dayChanges.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
