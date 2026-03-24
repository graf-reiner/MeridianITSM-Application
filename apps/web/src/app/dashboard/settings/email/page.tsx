'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiEmail, mdiPlus, mdiPencil, mdiTrashCan, mdiCheckCircle, mdiCloseCircle } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  name: string;
  email: string;
  smtpConfigured: boolean;
  imapConfigured: boolean;
  isActive: boolean;
  lastPolledAt: string | null;
  defaultQueue: { id: string; name: string } | null;
  defaultCategory: { id: string; name: string } | null;
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
  const [email, setEmail] = useState(account?.email ?? '');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUser, setImapUser] = useState('');
  const [imapPass, setImapPass] = useState('');
  const [imapSecure, setImapSecure] = useState(true);
  const [defaultQueueId, setDefaultQueueId] = useState(account?.defaultQueue?.id ?? '');
  const [defaultCategoryId, setDefaultCategoryId] = useState(account?.defaultCategory?.id ?? '');
  const [testResult, setTestResult] = useState<{ type: 'SMTP' | 'IMAP'; result: TestResult } | null>(null);
  const [isTesting, setIsTesting] = useState<'smtp' | 'imap' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async (type: 'smtp' | 'imap') => {
    setIsTesting(type);
    try {
      const body = type === 'smtp'
        ? { host: smtpHost, port: Number(smtpPort), user: smtpUser, password: smtpPass, secure: smtpSecure }
        : { host: imapHost, port: Number(imapPort), user: imapUser, password: imapPass, secure: imapSecure };
      const res = await fetch(`/api/v1/email-accounts/test-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
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
        email: email.trim(),
        defaultQueueId: defaultQueueId || null,
        defaultCategoryId: defaultCategoryId || null,
      };
      if (smtpHost) body.smtpConfig = { host: smtpHost, port: Number(smtpPort), user: smtpUser, password: smtpPass, secure: smtpSecure };
      if (imapHost) body.imapConfig = { host: imapHost, port: Number(imapPort), user: imapUser, password: imapPass, secure: imapSecure };
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

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{account ? 'Edit Email Account' : 'Add Email Account'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Display Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} placeholder="Support" />
            </div>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} placeholder="support@company.com" />
            </div>
          </div>

          {/* SMTP section */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#374151' }}>SMTP (Outbound)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 8 }}>
              <div><label style={labelStyle}>Host</label><input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder={account?.smtpConfigured ? '(configured)' : 'smtp.gmail.com'} style={inputStyle} /></div>
              <div><label style={labelStyle}>Port</label><input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div><label style={labelStyle}>Username</label><input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder={account?.smtpConfigured ? '(configured)' : ''} style={inputStyle} /></div>
              <div><label style={labelStyle}>Password</label><input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={account?.smtpConfigured ? '(configured)' : ''} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />SSL/TLS
              </label>
              <button type="button" onClick={() => void handleTest('smtp')} disabled={isTesting === 'smtp'} style={{ padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
                {isTesting === 'smtp' ? 'Testing...' : 'Test SMTP'}
              </button>
            </div>
          </div>

          {/* IMAP section */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#374151' }}>IMAP (Inbound)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 8 }}>
              <div><label style={labelStyle}>Host</label><input type="text" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder={account?.imapConfigured ? '(configured)' : 'imap.gmail.com'} style={inputStyle} /></div>
              <div><label style={labelStyle}>Port</label><input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div><label style={labelStyle}>Username</label><input type="text" value={imapUser} onChange={(e) => setImapUser(e.target.value)} placeholder={account?.imapConfigured ? '(configured)' : ''} style={inputStyle} /></div>
              <div><label style={labelStyle}>Password</label><input type="password" value={imapPass} onChange={(e) => setImapPass(e.target.value)} placeholder={account?.imapConfigured ? '(configured)' : ''} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} />SSL/TLS
              </label>
              <button type="button" onClick={() => void handleTest('imap')} disabled={isTesting === 'imap'} style={{ padding: '5px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
                {isTesting === 'imap' ? 'Testing...' : 'Test IMAP'}
              </button>
            </div>
          </div>

          {/* Defaults */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div>
              <label style={{ ...labelStyle, color: '#374151', fontSize: 13, fontWeight: 600 }}>Default Queue</label>
              <select value={defaultQueueId} onChange={(e) => setDefaultQueueId(e.target.value)} style={inputStyle}>
                <option value="">-- None --</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#374151', fontSize: 13, fontWeight: 600 }}>Default Category</label>
              <select value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)} style={inputStyle}>
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

  const { data, isLoading } = useQuery<{ accounts: EmailAccount[] }>({
    queryKey: ['settings-email'],
    queryFn: async () => {
      const res = await fetch('/api/v1/email-accounts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load email accounts');
      return res.json() as Promise<{ accounts: EmailAccount[] }>;
    },
  });

  const { data: queuesData } = useQuery<{ queues: QueueOption[] }>({
    queryKey: ['settings-queues-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return { queues: [] };
      return res.json() as Promise<{ queues: QueueOption[] }>;
    },
  });

  const { data: categoriesData } = useQuery<{ categories: CategoryOption[] }>({
    queryKey: ['settings-categories-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return { categories: [] };
      return res.json() as Promise<{ categories: CategoryOption[] }>;
    },
  });

  const handleDelete = async (account: EmailAccount) => {
    if (!window.confirm(`Delete email account "${account.name}"?`)) return;
    await fetch(`/api/v1/email-accounts/${account.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-email'] });
  };

  const accounts = data?.accounts ?? [];
  const queues = queuesData?.queues ?? [];
  const categories = categoriesData?.categories ?? [];

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
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditAccount(null); setShowModal(true); }}
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
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>SMTP</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>IMAP</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Active</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Last Polled</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{acc.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{acc.email}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Icon path={acc.smtpConfigured ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={acc.smtpConfigured ? '#059669' : '#d1d5db'} />
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Icon path={acc.imapConfigured ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={acc.imapConfigured ? '#059669' : '#d1d5db'} />
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, backgroundColor: acc.isActive ? '#d1fae5' : '#f3f4f6', color: acc.isActive ? '#065f46' : '#6b7280' }}>
                      {acc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>
                    {acc.lastPolledAt ? new Date(acc.lastPolledAt).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditAccount(acc); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />Edit
                      </button>
                      <button onClick={() => void handleDelete(acc)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}>
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
    </div>
  );
}
