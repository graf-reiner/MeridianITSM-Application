'use client';

// ─── Backup Configuration Section ────────────────────────────────────────────
// Rendered inside /settings#backups — lets the owner admin configure backup
// schedule, retention, and storage bucket. Changes are debounce-PATCHed to
// /api/backups/settings within 400 ms of the last edit.

import { useEffect, useState, useRef, useCallback } from 'react';
import { ownerFetch } from '../lib/api';

interface BackupSettings {
  scheduledEnabled: boolean;
  scheduledCron: string;
  retentionScheduledDays: number;
  retentionManualDays: number;
  bucketName: string;
}

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Daily at 02:00 UTC',     value: '0 2 * * *' },
  { label: 'Daily at 06:00 UTC',     value: '0 6 * * *' },
  { label: 'Every 6 hours',          value: '0 */6 * * *' },
  { label: 'Every 12 hours',         value: '0 */12 * * *' },
  { label: 'Weekly Sun 02:00 UTC',   value: '0 2 * * 0' },
];

function matchPreset(cron: string): string {
  const match = CRON_PRESETS.find(p => p.value === cron);
  return match ? match.value : '__custom__';
}

export default function BackupsSection() {
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState<string | null>(null);
  const [saveErr, setSaveErr]     = useState<string | null>(null);
  const [saved,   setSaved]       = useState(false);

  // Form state
  const [scheduledEnabled,       setScheduledEnabled]       = useState(false);
  const [scheduledCron,          setScheduledCron]          = useState('0 2 * * *');
  const [retentionScheduledDays, setRetentionScheduledDays] = useState(30);
  const [retentionManualDays,    setRetentionManualDays]    = useState(90);
  const [bucketName,             setBucketName]             = useState('');

  // Inline validation errors
  const [cronErr,   setCronErr]   = useState<string | null>(null);
  const [bucketErr, setBucketErr] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load initial settings ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await ownerFetch('/api/backups/settings');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as BackupSettings;
        if (cancelled) return;
        setScheduledEnabled(data.scheduledEnabled);
        setScheduledCron(data.scheduledCron);
        setRetentionScheduledDays(data.retentionScheduledDays);
        setRetentionManualDays(data.retentionManualDays);
        setBucketName(data.bucketName);
      } catch (err) {
        if (!cancelled) {
          setLoadErr(err instanceof Error ? err.message : 'Failed to load backup settings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // ─── Debounced PATCH ──────────────────────────────────────────────────────
  const patchSettings = useCallback((patch: Partial<BackupSettings>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveErr(null);
      setSaved(false);
      try {
        const res = await ownerFetch('/api/backups/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const data = await res.json() as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setSaveErr(err instanceof Error ? err.message : 'Save failed');
      }
    }, 400);
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function handleToggle(checked: boolean) {
    setScheduledEnabled(checked);
    patchSettings({ scheduledEnabled: checked });
  }

  function handleCronChange(value: string) {
    setScheduledCron(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setCronErr('Cron expression cannot be empty');
      return;
    }
    setCronErr(null);
    patchSettings({ scheduledCron: trimmed });
  }

  function handlePresetChange(presetValue: string) {
    if (presetValue === '__custom__') return; // keep existing text, let user edit
    setScheduledCron(presetValue);
    setCronErr(null);
    patchSettings({ scheduledCron: presetValue });
  }

  function handleRetentionScheduled(value: string) {
    const n = Math.min(90, Math.max(1, parseInt(value, 10) || 1));
    setRetentionScheduledDays(n);
    patchSettings({ retentionScheduledDays: n });
  }

  function handleRetentionManual(value: string) {
    const n = Math.min(90, Math.max(1, parseInt(value, 10) || 1));
    setRetentionManualDays(n);
    patchSettings({ retentionManualDays: n });
  }

  function handleBucketChange(value: string) {
    setBucketName(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setBucketErr('Bucket name cannot be empty');
      return;
    }
    setBucketErr(null);
    patchSettings({ bucketName: trimmed });
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '4px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
    backgroundColor: '#fff',
  };

  const errorTextStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#b91c1c',
    marginTop: '4px',
  };

  const hintStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      id="backups"
      style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '24px',
        marginTop: '24px',
      }}
    >
      <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px' }}>
        Backup Configuration
      </h2>
      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
        Configure scheduled backups, retention periods, and the storage bucket.
      </p>

      {/* Warning banner */}
      <div
        style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '4px',
          padding: '8px 12px',
          fontSize: '13px',
          color: '#92400e',
          marginBottom: '20px',
        }}
      >
        Schedule and retention changes take effect on the next worker restart. The &ldquo;Backup now&rdquo; button always works regardless of these settings.
      </div>

      {loading ? (
        <div style={{ padding: '16px 0', color: '#6b7280', fontSize: '14px' }}>Loading backup settings…</div>
      ) : loadErr ? (
        <div style={{ padding: '12px', backgroundColor: '#fee2e2', borderRadius: '4px', color: '#991b1b', fontSize: '13px' }}>
          Error loading settings: {loadErr}
        </div>
      ) : (
        <div style={{ maxWidth: '560px' }}>

          {/* Save feedback */}
          {saveErr && (
            <div style={{ marginBottom: '16px', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', color: '#991b1b', backgroundColor: '#fee2e2' }}>
              {saveErr}
            </div>
          )}
          {saved && (
            <div style={{ marginBottom: '16px', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', color: '#166534', backgroundColor: '#dcfce7' }}>
              Settings saved.
            </div>
          )}

          {/* 1. Enable / disable scheduled backups */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scheduledEnabled}
                onChange={e => handleToggle(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#4f46e5' }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>
                Enable scheduled backups
              </span>
            </label>
            <p style={{ ...hintStyle, marginTop: '6px', marginLeft: '26px' }}>
              When disabled, only manual &ldquo;Backup now&rdquo; runs will execute.
            </p>
          </div>

          {/* 2. Cron preset selector + custom input */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Schedule (cron expression)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <input
                  type="text"
                  value={scheduledCron}
                  onChange={e => handleCronChange(e.target.value)}
                  placeholder="0 2 * * *"
                  style={{ ...inputStyle, borderColor: cronErr ? '#f87171' : '#d1d5db' }}
                  aria-describedby="cron-hint"
                />
                {cronErr && <span style={errorTextStyle}>{cronErr}</span>}
              </div>
              <div style={{ minWidth: '180px' }}>
                <select
                  value={matchPreset(scheduledCron)}
                  onChange={e => handlePresetChange(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  aria-label="Cron preset"
                >
                  <option value="__custom__">Custom…</option>
                  {CRON_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p id="cron-hint" style={hintStyle}>
              Standard 5-field cron (minute hour day month weekday). UTC timezone.
            </p>
          </div>

          {/* 3 & 4. Retention days */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Scheduled backup retention (days)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={retentionScheduledDays}
                onChange={e => handleRetentionScheduled(e.target.value)}
                style={inputStyle}
              />
              <p style={hintStyle}>1 – 90 days</p>
            </div>
            <div>
              <label style={labelStyle}>Manual backup retention (days)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={retentionManualDays}
                onChange={e => handleRetentionManual(e.target.value)}
                style={inputStyle}
              />
              <p style={hintStyle}>1 – 90 days</p>
            </div>
          </div>

          {/* 5. Bucket name */}
          <div style={{ marginBottom: '8px' }}>
            <label style={labelStyle}>Storage bucket name</label>
            <input
              type="text"
              value={bucketName}
              onChange={e => handleBucketChange(e.target.value)}
              placeholder="meridian-backups"
              style={{ ...inputStyle, borderColor: bucketErr ? '#f87171' : '#d1d5db' }}
            />
            {bucketErr && <span style={errorTextStyle}>{bucketErr}</span>}
            <p style={hintStyle}>
              The S3-compatible bucket where backup archives are stored.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
