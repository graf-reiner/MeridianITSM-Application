'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiEmail, mdiPlus, mdiPencil, mdiTrashCan, mdiCheckCircle, mdiCloseCircle, mdiHistory } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  name: string;
  emailAddress: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  imapSecure: boolean;
  pollInterval: number;
  isActive: boolean;
  lastPolledAt: string | null;
  defaultQueueId: string | null;
  defaultCategoryId: string | null;
  authProvider: string;
  oauthConnectionStatus: string | null;
}

interface QueueOption { id: string; name: string; }
interface CategoryOption { id: string; name: string; }

interface TestStep {
  step: string;
  status: 'ok' | 'failed' | 'skipped';
  detail?: string;
  durationMs?: number;
}

interface TestResult {
  success: boolean;
  error?: string;
  steps: TestStep[];
}

type SmtpEncryption = 'ssl' | 'starttls' | 'none';
type ImapEncryption = 'ssl' | 'starttls' | 'none';

function smtpEncryptionToPort(enc: SmtpEncryption): string {
  switch (enc) {
    case 'ssl': return '465';
    case 'starttls': return '587';
    case 'none': return '25';
  }
}

function imapEncryptionToPort(enc: ImapEncryption): string {
  switch (enc) {
    case 'ssl': return '993';
    case 'starttls': return '143';
    case 'none': return '143';
  }
}

function detectSmtpEncryption(port: number | null, secure: boolean): SmtpEncryption {
  if (secure) return 'ssl';
  if (port === 25) return 'none';
  return 'starttls';
}

function detectImapEncryption(port: number | null, secure: boolean): ImapEncryption {
  if (secure) return 'ssl';
  if (port === 143) return 'starttls';
  return 'starttls';
}

// ─── Provider Icons ──────────────────────────────────────────────────────────

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function MicrosoftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M1 13h10v10H1z"/>
      <path fill="#7fba00" d="M13 1h10v10H13z"/><path fill="#ffb900" d="M13 13h10v10H13z"/>
    </svg>
  );
}

// ─── Provider Select Modal ──────────────────────────────────────────────────

function ProviderSelectModal({ onSelect, onClose }: { onSelect: (provider: 'MANUAL' | 'GOOGLE' | 'MICROSOFT') => void; onClose: () => void }) {
  const cardStyle = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
    border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer',
    backgroundColor: '#fff', transition: 'border-color 0.15s',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Add Email Account</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>Choose how to connect your email account:</p>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect('GOOGLE')}
            onKeyDown={(e) => e.key === 'Enter' && onSelect('GOOGLE')}
            style={cardStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#4285F4'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
          >
            <GoogleIcon size={28} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Google</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Workspace &amp; Gmail</div>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect('MICROSOFT')}
            onKeyDown={(e) => e.key === 'Enter' && onSelect('MICROSOFT')}
            style={cardStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#00a4ef'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
          >
            <MicrosoftIcon size={28} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Microsoft 365</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Outlook &amp; Exchange</div>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect('MANUAL')}
            onKeyDown={(e) => e.key === 'Enter' && onSelect('MANUAL')}
            style={cardStyle}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#4f46e5'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb'; }}
          >
            <Icon path={mdiEmail} size={1.2} color="#6b7280" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Manual</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>SMTP / IMAP configuration</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Post-Connect Modal ─────────────────────────────────────────────────────

function PostConnectModal({
  account,
  queues,
  categories,
  onClose,
  onSaved,
}: {
  account: { id: string; name: string; email: string };
  queues: QueueOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(account.name);
  const [pollInterval, setPollInterval] = useState(5);
  const [defaultQueueId, setDefaultQueueId] = useState('');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600 as const, color: '#6b7280' };
  const selectStyle = { ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' as const };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/email-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: displayName.trim(),
          pollInterval,
          defaultQueueId: defaultQueueId || null,
          defaultCategoryId: defaultCategoryId || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Account Connected</h2>
        </div>
        <form onSubmit={(e) => void handleSave(e)} style={{ padding: 24 }}>
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, marginBottom: 16, textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#065f46' }}>Successfully connected!</p>
            <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{account.email}</p>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="postDisplayName" style={labelStyle}>Display Name</label>
            <input id="postDisplayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="postEmail" style={labelStyle}>Email Address</label>
            <input id="postEmail" type="email" value={account.email} readOnly style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="postPollInterval" style={labelStyle}>Poll Interval (minutes)</label>
            <input id="postPollInterval" type="number" min={1} max={1440} value={pollInterval} onChange={(e) => setPollInterval(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))} style={{ ...inputStyle, maxWidth: 120 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label htmlFor="postDefaultQueue" style={labelStyle}>Default Queue</label>
              <select id="postDefaultQueue" value={defaultQueueId} onChange={(e) => setDefaultQueueId(e.target.value)} style={selectStyle}>
                <option value="">-- None --</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="postDefaultCategory" style={labelStyle}>Default Category</label>
              <select id="postDefaultCategory" value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)} style={selectStyle}>
                <option value="">-- None --</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Skip</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Test Result Modal ────────────────────────────────────────────────────────

function TestResultModal({ type, result, onClose }: { type: 'SMTP' | 'IMAP'; result: TestResult; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: result.success ? '#f0fdf4' : '#fef2f2' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: result.success ? '#065f46' : '#991b1b' }}>
            {type} Test — {result.success ? 'Passed' : 'Failed'}
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {result.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < result.steps.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <span style={{ fontSize: 16, lineHeight: '20px', flexShrink: 0 }}>
                {step.status === 'ok' ? '\u2705' : step.status === 'failed' ? '\u274C' : '\u23ED\uFE0F'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{step.step}</div>
                {step.detail && (
                  <div style={{ fontSize: 12, color: step.status === 'failed' ? '#dc2626' : '#6b7280', marginTop: 2, wordBreak: 'break-word' }}>
                    {step.detail}
                  </div>
                )}
              </div>
              {step.durationMs !== undefined && (
                <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}>{step.durationMs}ms</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '6px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ───────────────────────────────────────────────

function DeleteConfirmModal({ account, rules, onConfirm, onCancel }: {
  account: EmailAccount;
  rules: Array<{ id: string; name: string }>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fef2f2' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#991b1b' }}>
            Delete Email Account
          </h3>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>
            Are you sure you want to delete <strong>{account.name}</strong> ({account.emailAddress})?
          </p>
          {rules.length > 0 && (
            <div style={{ padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                This account is referenced by {rules.length} notification rule{rules.length > 1 ? 's' : ''}:
              </p>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#92400e' }}>
                {rules.map((r) => (
                  <li key={r.id}>{r.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '6px 16px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Email Account Modal ──────────────────────────────────────────────────────

function EmailModal({
  account,
  queues,
  categories,
  onClose,
  onSaved,
}: {
  account: EmailAccount | null;
  queues: QueueOption[];
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.emailAddress ?? '');
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpEncryption, setSmtpEncryption] = useState<SmtpEncryption>(
    account?.smtpHost ? detectSmtpEncryption(account.smtpPort, account.smtpSecure) : 'starttls'
  );
  const [smtpPort, setSmtpPort] = useState(
    account?.smtpPort ? String(account.smtpPort) : smtpEncryptionToPort(smtpEncryption)
  );
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapEncryption, setImapEncryption] = useState<ImapEncryption>(
    account?.imapHost ? detectImapEncryption(account.imapPort, account.imapSecure) : 'ssl'
  );
  const [imapPort, setImapPort] = useState(
    account?.imapPort ? String(account.imapPort) : imapEncryptionToPort(imapEncryption)
  );
  const [imapUser, setImapUser] = useState('');
  const [imapPass, setImapPass] = useState('');
  const [pollInterval, setPollInterval] = useState(account?.pollInterval ?? 5);
  const [defaultQueueId, setDefaultQueueId] = useState(account?.defaultQueueId ?? '');
  const [defaultCategoryId, setDefaultCategoryId] = useState(account?.defaultCategoryId ?? '');
  const [smtpSendTo, setSmtpSendTo] = useState('');
  const [testResult, setTestResult] = useState<{ type: 'SMTP' | 'IMAP'; result: TestResult } | null>(null);
  const [isTesting, setIsTesting] = useState<'smtp' | 'imap' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const smtpConfigured = !!(smtpHost || account?.smtpHost);
  const imapConfigured = !!(imapHost || account?.imapHost);

  const handleSmtpEncryptionChange = (enc: SmtpEncryption) => {
    setSmtpEncryption(enc);
    setSmtpPort(smtpEncryptionToPort(enc));
    if (enc === 'none') {
      setSmtpUser('');
      setSmtpPass('');
    }
  };

  const handleImapEncryptionChange = (enc: ImapEncryption) => {
    setImapEncryption(enc);
    setImapPort(imapEncryptionToPort(enc));
    if (enc === 'none') {
      setImapUser('');
      setImapPass('');
    }
  };

  const handleTest = async (type: 'smtp' | 'imap') => {
    setIsTesting(type);
    try {
      let body: Record<string, unknown>;
      if (type === 'smtp') {
        if (smtpHost) {
          // User entered a new host — send all inline
          body = {
            host: smtpHost, port: Number(smtpPort),
            user: smtpEncryption !== 'none' ? smtpUser : '',
            password: smtpEncryption !== 'none' ? smtpPass : '',
            secure: smtpEncryption === 'ssl',
            sendTo: smtpSendTo.trim() || undefined,
            fromAddress: email.trim() || undefined,
          };
        } else {
          // Use stored credentials but allow port/secure overrides
          body = {
            accountId: account?.id,
            port: Number(smtpPort),
            secure: smtpEncryption === 'ssl',
            sendTo: smtpSendTo.trim() || undefined,
          };
        }
      } else {
        if (imapHost) {
          body = {
            host: imapHost, port: Number(imapPort),
            user: imapEncryption !== 'none' ? imapUser : '',
            password: imapEncryption !== 'none' ? imapPass : '',
            secure: imapEncryption === 'ssl',
          };
        } else {
          body = {
            accountId: account?.id,
            port: Number(imapPort),
            secure: imapEncryption === 'ssl',
          };
        }
      }
      const res = await fetch(`/api/v1/email-accounts/test-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned ${res.status} — API may be unavailable`);
      }
      const data = (await res.json()) as TestResult;
      setTestResult({ type: type === 'smtp' ? 'SMTP' : 'IMAP', result: data });
    } catch (err) {
      setTestResult({
        type: type === 'smtp' ? 'SMTP' : 'IMAP',
        result: { success: false, error: err instanceof Error ? err.message : 'Network error', steps: [{ step: 'Send request', status: 'failed', detail: 'Could not reach the API server' }] },
      });
    } finally {
      setIsTesting(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        emailAddress: email.trim(),
        isActive,
        pollInterval,
        defaultQueueId: defaultQueueId || null,
        defaultCategoryId: defaultCategoryId || null,
      };
      // Always send SMTP settings if host is entered or account already has SMTP configured
      if (smtpHost || account?.smtpHost) {
        if (smtpHost) body.smtpHost = smtpHost;
        body.smtpPort = Number(smtpPort);
        body.smtpSecure = smtpEncryption === 'ssl';
        if (smtpEncryption !== 'none') {
          if (smtpUser) body.smtpUser = smtpUser;
          if (smtpPass) body.smtpPassword = smtpPass;
        } else {
          body.smtpUser = null;
          body.smtpPassword = '';
        }
      }
      // Always send IMAP settings if host is entered or account already has IMAP configured
      if (imapHost || account?.imapHost) {
        if (imapHost) body.imapHost = imapHost;
        body.imapPort = Number(imapPort);
        body.imapSecure = imapEncryption === 'ssl';
        if (imapEncryption !== 'none') {
          if (imapUser) body.imapUser = imapUser;
          if (imapPass) body.imapPassword = imapPass;
        } else {
          body.imapUser = null;
          body.imapPassword = '';
        }
      }
      const res = await fetch(account ? `/api/v1/email-accounts/${account.id}` : '/api/v1/email-accounts', {
        method: account ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600 as const, color: '#6b7280' };
  const selectStyle = { ...inputStyle, backgroundColor: '#fff', cursor: 'pointer' as const };
  const disabledInputStyle = { ...inputStyle, backgroundColor: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{account ? 'Edit Email Account' : 'Add Email Account'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="displayName" style={labelStyle}>Display Name *</label>
              <input id="displayName" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} placeholder="Support" />
            </div>
            <div>
              <label htmlFor="emailAddress" style={labelStyle}>Email Address *</label>
              <input id="emailAddress" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} placeholder="support@company.com" />
            </div>
          </div>

          {/* Active toggle */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span style={{ fontWeight: 600, color: '#374151' }}>Active</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>— uncheck to disable email polling for this account</span>
            </label>
          </div>

          {account && account.authProvider !== 'MANUAL' ? (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 16, marginBottom: 14, textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#065f46' }}>
                Connected via {account.authProvider === 'GOOGLE' ? 'Google' : 'Microsoft 365'}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{account.emailAddress}</p>
            </div>
          ) : (
            <>
              {/* SMTP section */}
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#374151' }}>SMTP (Outbound)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label htmlFor="smtpHost" style={labelStyle}>Host</label>
                    <input id="smtpHost" type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder={account?.smtpHost ? '(configured)' : 'smtp.gmail.com'} style={inputStyle} />
                  </div>
                  <div>
                    <label htmlFor="smtpEncryption" style={labelStyle}>Encryption</label>
                    <select id="smtpEncryption" value={smtpEncryption} onChange={(e) => handleSmtpEncryptionChange(e.target.value as SmtpEncryption)} style={selectStyle}>
                      <option value="ssl">SSL/TLS</option>
                      <option value="starttls">StartTLS</option>
                      <option value="none">Not Encrypted</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="smtpPort" style={labelStyle}>Port</label>
                    <input id="smtpPort" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label htmlFor="smtpUsername" style={labelStyle}>Username</label>
                    <input
                      id="smtpUsername" type="text"
                      value={smtpEncryption !== 'none' ? smtpUser : ''}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder={smtpEncryption === 'none' ? '' : (account?.smtpUser ? '(configured)' : '')}
                      disabled={smtpEncryption === 'none'}
                      style={smtpEncryption === 'none' ? disabledInputStyle : inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="smtpPassword" style={labelStyle}>Password</label>
                    <input
                      id="smtpPassword" type="password"
                      value={smtpEncryption !== 'none' ? smtpPass : ''}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder={smtpEncryption === 'none' ? '' : (account?.smtpHost ? '(configured)' : '')}
                      disabled={smtpEncryption === 'none'}
                      style={smtpEncryption === 'none' ? disabledInputStyle : inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label htmlFor="smtpSendTo" style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' }}>Send To</label>
                  <input id="smtpSendTo" type="email" value={smtpSendTo} onChange={(e) => setSmtpSendTo(e.target.value)} placeholder="test@example.com" style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => void handleTest('smtp')} disabled={isTesting === 'smtp' || !smtpConfigured} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isTesting === 'smtp' || !smtpConfigured ? 'not-allowed' : 'pointer', backgroundColor: isTesting === 'smtp' || !smtpConfigured ? '#d1d5db' : '#4f46e5', color: '#fff', whiteSpace: 'nowrap' }}>
                    {isTesting === 'smtp' ? 'Testing...' : 'Test SMTP'}
                  </button>
                </div>
              </div>

              {/* IMAP section */}
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#374151' }}>IMAP (Inbound)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label htmlFor="imapHost" style={labelStyle}>Host</label>
                    <input id="imapHost" type="text" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder={account?.imapHost ? '(configured)' : 'imap.gmail.com'} style={inputStyle} />
                  </div>
                  <div>
                    <label htmlFor="imapEncryption" style={labelStyle}>Encryption</label>
                    <select id="imapEncryption" value={imapEncryption} onChange={(e) => handleImapEncryptionChange(e.target.value as ImapEncryption)} style={selectStyle}>
                      <option value="ssl">SSL/TLS</option>
                      <option value="starttls">StartTLS</option>
                      <option value="none">Not Encrypted</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="imapPort" style={labelStyle}>Port</label>
                    <input id="imapPort" type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label htmlFor="imapUsername" style={labelStyle}>Username</label>
                    <input
                      id="imapUsername" type="text"
                      value={imapEncryption !== 'none' ? imapUser : ''}
                      onChange={(e) => setImapUser(e.target.value)}
                      placeholder={imapEncryption === 'none' ? '' : (account?.imapUser ? '(configured)' : '')}
                      disabled={imapEncryption === 'none'}
                      style={imapEncryption === 'none' ? disabledInputStyle : inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="imapPassword" style={labelStyle}>Password</label>
                    <input
                      id="imapPassword" type="password"
                      value={imapEncryption !== 'none' ? imapPass : ''}
                      onChange={(e) => setImapPass(e.target.value)}
                      placeholder={imapEncryption === 'none' ? '' : (account?.imapHost ? '(configured)' : '')}
                      disabled={imapEncryption === 'none'}
                      style={imapEncryption === 'none' ? disabledInputStyle : inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => void handleTest('imap')} disabled={isTesting === 'imap' || !imapConfigured} style={{ padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: isTesting === 'imap' || !imapConfigured ? 'not-allowed' : 'pointer', backgroundColor: '#fff', color: '#374151' }}>
                    {isTesting === 'imap' ? 'Testing...' : 'Test IMAP'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Poll Interval */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="pollInterval" style={labelStyle}>Poll Interval (minutes)</label>
            <input id="pollInterval" type="number" min={1} max={1440} value={pollInterval} onChange={(e) => setPollInterval(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))} style={{ ...inputStyle, maxWidth: 120 }} />
            <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>How often to check for new emails (1-1440 min)</span>
          </div>

          {/* Defaults */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label htmlFor="defaultQueue" style={{ ...labelStyle, color: '#374151', fontSize: 13, fontWeight: 600 }}>Default Queue</label>
              <select id="defaultQueue" value={defaultQueueId} onChange={(e) => setDefaultQueueId(e.target.value)} style={selectStyle}>
                <option value="">-- None --</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="defaultCategory" style={{ ...labelStyle, color: '#374151', fontSize: 13, fontWeight: 600 }}>Default Category</label>
              <select id="defaultCategory" value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)} style={selectStyle}>
                <option value="">-- None --</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : account ? 'Save Changes' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
      {testResult && (
        <TestResultModal type={testResult.type} result={testResult.result} onClose={() => setTestResult(null)} />
      )}
    </div>
  );
}

// ─── Email Accounts Page ──────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<EmailAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ account: EmailAccount; rules: Array<{ id: string; name: string }> } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showProviderSelect, setShowProviderSelect] = useState(false);
  const [postConnectAccount, setPostConnectAccount] = useState<{ id: string; name: string; email: string } | null>(null);

  const { data, isLoading } = useQuery<EmailAccount[]>({
    queryKey: ['settings-email'],
    queryFn: async () => {
      const res = await fetch('/api/v1/email-accounts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load email accounts');
      const json = await res.json();
      return Array.isArray(json) ? json : (json.accounts ?? []);
    },
  });

  const { data: queuesData } = useQuery<QueueOption[]>({
    queryKey: ['settings-queues-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const { data: categoriesData } = useQuery<CategoryOption[]>({
    queryKey: ['settings-categories-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? [];
    },
  });

  const handleDeleteClick = async (account: EmailAccount) => {
    // Check if any notification rules reference this account
    try {
      const res = await fetch('/api/v1/settings/notification-rules', { credentials: 'include' });
      if (res.ok) {
        const rules = await res.json();
        const ruleList = Array.isArray(rules) ? rules : rules.rules ?? [];
        const referencingRules = ruleList.filter((rule: { actions: Array<{ type: string; emailAccountId?: string }> }) =>
          Array.isArray(rule.actions) && rule.actions.some((a: { emailAccountId?: string }) => a.emailAccountId === account.id)
        ).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));
        setDeleteTarget({ account, rules: referencingRules });
      } else {
        setDeleteTarget({ account, rules: [] });
      }
    } catch {
      setDeleteTarget({ account, rules: [] });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/v1/email-accounts/${deleteTarget.account.id}`, { method: 'DELETE', credentials: 'include' });
      void qc.invalidateQueries({ queryKey: ['settings-email'] });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleOAuthConnect = async (provider: 'GOOGLE' | 'MICROSOFT') => {
    setShowProviderSelect(false);
    try {
      const res = await fetch(`/api/v1/email-accounts/oauth/authorize?provider=${provider.toLowerCase()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to get authorization URL');
      const { url } = (await res.json()) as { url: string };
      const popup = window.open(url, 'oauth-popup', 'width=600,height=700,scrollbars=yes');
      if (!popup) { alert('Please allow popups for this site.'); return; }
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string; account?: { id: string; name: string; email: string }; error?: string };
        if (data.type === 'oauth-success' && data.account) {
          setPostConnectAccount(data.account);
          void qc.invalidateQueries({ queryKey: ['settings-email'] });
        } else if (data.type === 'oauth-error') {
          alert(`OAuth connection failed: ${data.error ?? 'Unknown error'}`);
        }
        window.removeEventListener('message', handleMessage);
      };
      window.addEventListener('message', handleMessage);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start OAuth flow');
    }
  };

  const handleProviderSelect = (provider: 'MANUAL' | 'GOOGLE' | 'MICROSOFT') => {
    if (provider === 'MANUAL') {
      setShowProviderSelect(false);
      setEditAccount(null);
      setShowModal(true);
    } else {
      void handleOAuthConnect(provider);
    }
  };

  const accounts = data ?? [];
  const queues = queuesData ?? [];
  const categories = categoriesData ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiEmail} size={1} color="#dc2626" />
          Email Accounts
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link
            href="/dashboard/settings/email/activity"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', backgroundColor: '#fff', color: '#374151', textDecoration: 'none' }}
          >
            <Icon path={mdiHistory} size={0.8} color="currentColor" />
            View Activity Log
          </Link>
          <button
            onClick={() => setShowProviderSelect(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Account
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading email accounts...</div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Email</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Connection</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Active</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Poll</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Last Polled</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {acc.authProvider === 'GOOGLE' && <GoogleIcon size={14} />}
                      {acc.authProvider === 'MICROSOFT' && <MicrosoftIcon size={14} />}
                      {(!acc.authProvider || acc.authProvider === 'MANUAL') && <Icon path={mdiEmail} size={0.6} color="#6b7280" />}
                      {acc.name}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{acc.emailAddress}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500,
                      backgroundColor: acc.oauthConnectionStatus === 'REFRESH_FAILED' ? '#fef2f2'
                        : (acc.smtpHost || acc.authProvider !== 'MANUAL') ? '#d1fae5' : '#f3f4f6',
                      color: acc.oauthConnectionStatus === 'REFRESH_FAILED' ? '#991b1b'
                        : (acc.smtpHost || acc.authProvider !== 'MANUAL') ? '#065f46' : '#6b7280',
                    }}>
                      {acc.oauthConnectionStatus === 'REFRESH_FAILED' ? 'Disconnected' : 'Connected'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, backgroundColor: acc.isActive ? '#d1fae5' : '#f3f4f6', color: acc.isActive ? '#065f46' : '#6b7280' }}>
                      {acc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                    {acc.pollInterval ?? 5} min
                  </td>
                  <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>
                    {acc.lastPolledAt ? new Date(acc.lastPolledAt).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditAccount(acc); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />Edit
                      </button>
                      <button onClick={() => void handleDeleteClick(acc)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}>
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No email accounts configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <EmailModal
          account={editAccount}
          queues={queues}
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-email'] })}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          account={deleteTarget.account}
          rules={deleteTarget.rules}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showProviderSelect && (
        <ProviderSelectModal
          onSelect={handleProviderSelect}
          onClose={() => setShowProviderSelect(false)}
        />
      )}

      {postConnectAccount && (
        <PostConnectModal
          account={postConnectAccount}
          queues={queues}
          categories={categories}
          onClose={() => setPostConnectAccount(null)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-email'] })}
        />
      )}
    </div>
  );
}
