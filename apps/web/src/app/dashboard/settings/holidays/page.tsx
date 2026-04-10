'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiCalendarRemoveOutline,
  mdiPlus,
  mdiTrashCanOutline,
  mdiRefresh,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Holiday {
  id: string;
  date: string;
  name: string;
  recurring: boolean;
  createdAt: string;
}

interface SeedCountry {
  code: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  // The API stores DATE columns; Prisma returns ISO timestamps at UTC midnight.
  // Format with UTC components so the displayed day matches what was stored.
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Holidays Settings Page ───────────────────────────────────────────────────

export default function HolidaysPage() {
  const qc = useQueryClient();

  const [newDate, setNewDate] = useState<string>(todayYmd());
  const [newName, setNewName] = useState('');
  const [newRecurring, setNewRecurring] = useState(false);
  const [seedCountry, setSeedCountry] = useState('');
  const [seedYear, setSeedYear] = useState<number>(new Date().getFullYear());
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: holidays, isLoading } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: async () => {
      const res = await fetch('/api/v1/holidays', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load holidays');
      return res.json() as Promise<Holiday[]>;
    },
  });

  const { data: seedCountries } = useQuery<SeedCountry[]>({
    queryKey: ['holiday-seed-countries'],
    queryFn: async () => {
      const res = await fetch('/api/v1/holidays/seed', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load seed countries');
      return res.json() as Promise<SeedCountry[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { date: string; name: string; recurring: boolean }) => {
      const res = await fetch('/api/v1/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to create holiday');
      }
      return res.json() as Promise<Holiday>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['holidays'] });
      setNewName('');
      setNewRecurring(false);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/holidays/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete holiday');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const seedMutation = useMutation({
    mutationFn: async (payload: { country: string; year: number }) => {
      const res = await fetch('/api/v1/holidays/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to import seed pack');
      }
      return res.json() as Promise<{ inserted: number; skipped: number; total: number }>;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['holidays'] });
      setSeedResult(`Imported ${data.inserted} of ${data.total} holidays (${data.skipped} skipped)`);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const inputStyle = {
    padding: '8px 10px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    backgroundColor: 'var(--bg-primary)',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 4,
    fontSize: 12,
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link
          href="/dashboard/settings"
          style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiCalendarRemoveOutline} size={1} color="#dc2626" />
          Holiday Calendar
        </h1>
      </div>

      <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Holidays added here are excluded from SLA business-hours calculations. When a ticket&apos;s
        SLA target window crosses one of these dates, the holiday hours are not counted toward the
        breach time. Mark a holiday as <strong>recurring</strong> to apply it every year automatically
        (e.g. Christmas, New Year&apos;s Day).
      </p>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--badge-red-bg-subtle)',
            border: '1px solid var(--badge-red-bg-strong)',
            borderRadius: 8,
            marginBottom: 16,
            color: 'var(--accent-danger)',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Add a holiday ───────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Add a holiday
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            createMutation.mutate({ date: newDate, name: newName.trim(), recurring: newRecurring });
          }}
          style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto auto', gap: 12, alignItems: 'end' }}
        >
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Christmas Day"
              required
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={newRecurring}
                onChange={(e) => setNewRecurring(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              Recurring
            </label>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending || !newName.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 18px',
              backgroundColor: createMutation.isPending || !newName.trim() ? 'var(--badge-indigo-bg)' : 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: createMutation.isPending || !newName.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.7} color="currentColor" />
            Add
          </button>
        </form>
      </div>

      {/* ── Country seed picker ─────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Quick import from country pack
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-placeholder)' }}>
          Import a country&apos;s common holidays for the selected year. Existing holidays on the same date are skipped.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Country</label>
            <select
              value={seedCountry}
              onChange={(e) => setSeedCountry(e.target.value)}
              style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
            >
              <option value="">— select a country —</option>
              {(seedCountries ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Year</label>
            <input
              type="number"
              value={seedYear}
              min={1900}
              max={2100}
              onChange={(e) => setSeedYear(Number(e.target.value))}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          <button
            type="button"
            disabled={!seedCountry || seedMutation.isPending}
            onClick={() => seedMutation.mutate({ country: seedCountry, year: seedYear })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 18px',
              backgroundColor: !seedCountry || seedMutation.isPending ? 'var(--bg-tertiary)' : 'var(--text-secondary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: !seedCountry || seedMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon path={mdiRefresh} size={0.7} color="currentColor" />
            Import
          </button>
        </div>
        {seedResult && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--accent-success, #059669)' }}>
            {seedResult}
          </p>
        )}
      </div>

      {/* ── Existing holidays list ──────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading holidays...
          </div>
        ) : !holidays || holidays.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Icon path={mdiCalendarRemoveOutline} size={2.5} color="var(--border-secondary)" />
            <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
              No holidays configured. Add one above or import a country pack.
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Recurring</th>
                <th style={{ padding: '10px 14px', width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                    {formatDate(h.date)}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{h.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {h.recurring ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 500,
                          backgroundColor: 'var(--badge-blue-bg)',
                          color: '#1e40af',
                        }}
                      >
                        Yearly
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>One-off</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${h.name}"?`)) {
                          deleteMutation.mutate(h.id);
                        }
                      }}
                      title="Delete"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: 6,
                        border: 'none',
                        borderRadius: 6,
                        backgroundColor: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--accent-danger)',
                      }}
                    >
                      <Icon path={mdiTrashCanOutline} size={0.8} color="currentColor" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
