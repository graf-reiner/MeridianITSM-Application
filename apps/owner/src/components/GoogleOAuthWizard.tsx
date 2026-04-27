'use client';

import { useState } from 'react';
import { ownerFetch } from '../lib/api';
import type { IntegrationStatus } from '../app/(admin)/integrations/page';

interface Props {
  redirectUri: string;
  existing: IntegrationStatus | null;
  onClose: () => void;
}

const STEPS = [
  { key: 'overview', title: 'Overview' },
  { key: 'project', title: 'Cloud project' },
  { key: 'consent', title: 'OAuth consent screen' },
  { key: 'client', title: 'Create OAuth client' },
  { key: 'paste', title: 'Paste credentials' },
  { key: 'test', title: 'Test' },
] as const;

const SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
  'profile',
];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <code style={{ flex: 1, padding: '8px 10px', background: '#f1f5f9', borderRadius: 4, fontSize: 13, color: '#0f172a', border: '1px solid #e2e8f0', overflowX: 'auto', whiteSpace: 'nowrap' }}>{value}</code>
        <button
          onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ padding: '6px 12px', background: copied ? '#dcfce7' : '#fff', color: copied ? '#166534' : '#475569', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

export default function GoogleOAuthWizard({ redirectUri, existing, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [secretExpiresAt, setSecretExpiresAt] = useState(existing?.secretExpiresAt?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(existing?.source === 'db');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  async function handleSave() {
    setSaving(true); setSaveError(null); setSavedOk(false);
    try {
      const res = await ownerFetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'GOOGLE',
          clientId,
          clientSecret,
          secretExpiresAt: secretExpiresAt || null,
          notes: notes || null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSavedOk(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const res = await ownerFetch('/api/integrations/GOOGLE/test', { method: 'POST' });
      const data = await res.json() as { valid: boolean; message: string };
      setTestResult(data);
    } catch (err) {
      setTestResult({ valid: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  const canAdvanceFromPaste = savedOk;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 920, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#0f172a' }}>Google Workspace Integration Setup</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>Step {step + 1} of {STEPS.length}: {STEPS[step]!.title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer', padding: 4 }} aria-label="Close">×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <aside style={{ width: 200, borderRight: '1px solid #e2e8f0', padding: '16px 12px', background: '#f8fafc' }}>
            {STEPS.map((s, i) => (
              <button key={s.key} onClick={() => setStep(i)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', background: i === step ? '#fee2e2' : 'transparent', color: i === step ? '#b91c1c' : i < step ? '#16a34a' : '#475569', fontSize: 13, fontWeight: i === step ? 600 : 400, cursor: 'pointer', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i < step ? '#16a34a' : i === step ? '#b91c1c' : '#cbd5e1', color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s.title}
              </button>
            ))}
          </aside>

          <div style={{ flex: 1, padding: 24, overflowY: 'auto', fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
            {step === 0 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>What we're about to do</h3>
                <p>You'll create a single OAuth 2.0 Client ID in Google Cloud Console. After that, every MeridianITSM customer can connect their Google Workspace mailbox without per-customer Cloud Console work.</p>
                <p>Walk-through:</p>
                <ol style={{ margin: '8px 0 16px 18px', padding: 0 }}>
                  <li>Create or pick a Google Cloud project</li>
                  <li>Configure the OAuth consent screen (External, In production)</li>
                  <li>Create the OAuth 2.0 Client ID</li>
                  <li>Paste credentials here</li>
                  <li>Validate against Google</li>
                </ol>
                <div style={{ marginTop: 12, padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  <strong>Important:</strong> The <code>https://mail.google.com/</code> scope is restricted. Google requires app verification before unlimited users can consent. Until verification, you're capped at 100 test users — fine for early customers, plan verification before scale.
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Create or select a Google Cloud project</h3>
                <ol style={{ paddingLeft: 18 }}>
                  <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer" style={{ color: '#b91c1c', fontWeight: 500 }}>Google Cloud Console — Create Project</a>.</li>
                  <li>Name: <code>MeridianITSM Email</code> (or pick an existing project).</li>
                  <li>Once created, go to <strong>APIs &amp; Services → Library</strong> and enable <em>Gmail API</em>.</li>
                </ol>
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Configure the OAuth consent screen</h3>
                <ol style={{ paddingLeft: 18 }}>
                  <li>In Cloud Console: <strong>APIs &amp; Services → OAuth consent screen</strong>.</li>
                  <li>User Type: <strong>External</strong>. Click Create.</li>
                  <li>Fill in app name, support email, and developer contact email. Save and continue.</li>
                  <li>On <strong>Scopes</strong>, click "Add or remove scopes" and add:</li>
                </ol>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead><tr style={{ background: '#f8fafc' }}><th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Scope</th><th /></tr></thead>
                  <tbody>
                    {SCOPES.map(s => (
                      <tr key={s}>
                        <td style={{ padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}><code>{s}</code></td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                          <button onClick={() => void navigator.clipboard.writeText(s)} style={{ padding: '3px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>For early use, leave the app in <strong>Testing</strong> mode and add your customers' admin emails as test users (max 100). Once you're ready for general availability, submit the app for verification — Google will require it because <code>mail.google.com</code> is a restricted scope.</p>
              </div>
            )}

            {step === 3 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Create the OAuth Client ID</h3>
                <ol style={{ paddingLeft: 18 }}>
                  <li>In Cloud Console: <strong>APIs &amp; Services → Credentials → + Create Credentials → OAuth client ID</strong>.</li>
                  <li>Application type: <strong>Web application</strong>.</li>
                  <li>Name: <code>MeridianITSM Email Connector</code>.</li>
                  <li>Add Authorized redirect URI:</li>
                </ol>
                <CopyField label="Authorized redirect URI" value={redirectUri || '(APP_URL not set on api server)'} />
                <p>Click Create. A modal shows your <em>Client ID</em> and <em>Client secret</em>. Copy both — you'll paste them on the next step. (Unlike Microsoft, the secret stays visible in Cloud Console afterward, but copy it now anyway.)</p>
              </div>
            )}

            {step === 4 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Paste the credentials</h3>
                <p style={{ fontSize: 13, color: '#64748b' }}>Stored encrypted at rest. The secret never round-trips back to the browser after saving.</p>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Client ID</span>
                  <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={existing?.source === 'db' ? existing.clientIdMasked ?? '' : 'XXXXXXX.apps.googleusercontent.com'} style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }} />
                </label>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Client secret {existing?.source === 'db' && <em style={{ color: '#94a3b8' }}>(leave blank to keep existing)</em>}</span>
                  <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={existing?.source === 'db' ? '••••••••' : 'paste secret here'} style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }} />
                </label>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Secret expiry date <em style={{ color: '#94a3b8' }}>(optional — Google secrets don't auto-expire, but you may want a rotation reminder)</em></span>
                  <input type="date" value={secretExpiresAt} onChange={(e) => setSecretExpiresAt(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Notes <em style={{ color: '#94a3b8' }}>(optional)</em></span>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. App not yet verified by Google" style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} />
                </label>
                <button onClick={() => void handleSave()} disabled={saving || !clientId || (!existing && !clientSecret)} style={{ padding: '8px 16px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: (!clientId || (!existing && !clientSecret)) ? 0.5 : 1 }}>
                  {saving ? 'Saving…' : 'Save credentials'}
                </button>
                {savedOk && <p style={{ marginTop: 12, color: '#166534' }}>✓ Saved. Continue to the test step.</p>}
                {saveError && <p style={{ marginTop: 12, color: '#b91c1c' }}>{saveError}</p>}
              </div>
            )}

            {step === 5 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Validate the credentials</h3>
                <p>This sends a deliberately invalid authorization code to Google's token endpoint using your saved credentials. Valid credentials cause Google to reject the fake code with <code>invalid_grant</code> — that's the success signal.</p>
                <button onClick={() => void handleTest()} disabled={testing} style={{ padding: '8px 16px', background: '#ea4335', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: testing ? 'wait' : 'pointer' }}>
                  {testing ? 'Testing…' : 'Run validation'}
                </button>
                {testResult && (
                  <div style={{ marginTop: 16, padding: 12, background: testResult.valid ? '#dcfce7' : '#fef2f2', border: `1px solid ${testResult.valid ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, color: testResult.valid ? '#166534' : '#991b1b', fontSize: 13 }}>
                    <strong>{testResult.valid ? '✓ Credentials valid' : '✗ Validation failed'}</strong>
                    <p style={{ margin: '6px 0 0 0' }}>{testResult.message}</p>
                  </div>
                )}
                {testResult?.valid && (
                  <p style={{ marginTop: 16, color: '#166534' }}>You're done. Customers can now connect their Google Workspace mailboxes from Settings → Email Accounts.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={{ padding: '8px 14px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.5 : 1 }}>Back</button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === 4 && !canAdvanceFromPaste} style={{ padding: '8px 14px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: (step === 4 && !canAdvanceFromPaste) ? 'not-allowed' : 'pointer', opacity: (step === 4 && !canAdvanceFromPaste) ? 0.5 : 1 }}>Next</button>
          ) : (
            <button onClick={onClose} style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
