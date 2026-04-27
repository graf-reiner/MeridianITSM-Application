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
  { key: 'register', title: 'Register the app' },
  { key: 'permissions', title: 'API permissions' },
  { key: 'secret', title: 'Create client secret' },
  { key: 'paste', title: 'Paste credentials' },
  { key: 'test', title: 'Test' },
] as const;

const SCOPES = [
  { name: 'IMAP.AccessAsUser.All', api: 'Office 365 Exchange Online' },
  { name: 'SMTP.Send', api: 'Office 365 Exchange Online' },
  { name: 'User.Read', api: 'Microsoft Graph' },
  { name: 'offline_access', api: 'Microsoft Graph' },
];

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <code style={{ flex: 1, padding: '8px 10px', background: '#f1f5f9', borderRadius: 4, fontSize: 13, color: '#0f172a', border: '1px solid #e2e8f0', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {value}
        </code>
        <button
          onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ padding: '6px 12px', background: copied ? '#dcfce7' : '#fff', color: copied ? '#166534' : '#475569', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function MicrosoftOAuthWizard({ redirectUri, existing, onClose }: Props) {
  const [step, setStep] = useState(0);

  // Step 5 form state
  const [clientId, setClientId] = useState(existing?.source === 'db' ? '' : '');
  const [clientSecret, setClientSecret] = useState('');
  const [secretExpiresAt, setSecretExpiresAt] = useState(existing?.secretExpiresAt?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(existing?.source === 'db');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Step 6 test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const res = await ownerFetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'MICROSOFT',
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
    setTesting(true);
    setTestResult(null);
    try {
      const res = await ownerFetch('/api/integrations/MICROSOFT/test', { method: 'POST' });
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
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#0f172a' }}>Microsoft 365 Integration Setup</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0 0' }}>Step {step + 1} of {STEPS.length}: {STEPS[step]!.title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer', padding: 4 }} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <aside style={{ width: 200, borderRight: '1px solid #e2e8f0', padding: '16px 12px', background: '#f8fafc' }}>
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none',
                  background: i === step ? '#e0e7ff' : 'transparent',
                  color: i === step ? '#4338ca' : i < step ? '#16a34a' : '#475569',
                  fontSize: 13, fontWeight: i === step ? 600 : 400, cursor: 'pointer', marginBottom: 2,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: i < step ? '#16a34a' : i === step ? '#4338ca' : '#cbd5e1', color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s.title}
              </button>
            ))}
          </aside>

          {/* Content */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
            {step === 0 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>What we're about to do</h3>
                <p>You'll register a single <strong>multi-tenant Azure app</strong> in your Microsoft Entra ID (formerly Azure AD). After this one-time setup, every MeridianITSM customer can connect their own Microsoft 365 mailbox by clicking a button — no per-customer Azure work.</p>
                <p>This walks you through:</p>
                <ol style={{ margin: '8px 0 16px 18px', padding: 0 }}>
                  <li>Creating the app registration at portal.azure.com</li>
                  <li>Granting the right API permissions (IMAP, SMTP)</li>
                  <li>Generating a client secret</li>
                  <li>Pasting the credentials here</li>
                  <li>Validating against Microsoft</li>
                </ol>
                <p>Need to step away? Each step is self-contained — close the wizard and pick up where you left off any time.</p>
                <div style={{ marginTop: 20, padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, color: '#1e40af' }}>
                  <strong>Heads up:</strong> The redirect URI shown on the next step must be registered <em>exactly</em> in Azure or sign-in will fail with <code>AADSTS50011</code>.
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Register the app in Azure</h3>
                <ol style={{ paddingLeft: 18 }}>
                  <li style={{ marginBottom: 8 }}>Open the Azure portal:{' '}
                    <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/quickStartType~/null/isMSAApp~/false" target="_blank" rel="noopener noreferrer" style={{ color: '#4338ca', fontWeight: 500 }}>
                      Open "New app registration" →
                    </a>
                  </li>
                  <li style={{ marginBottom: 8 }}>Name the app:</li>
                </ol>
                <CopyField label="App name" value="MeridianITSM Email Connector" />
                <p style={{ marginTop: 12 }}><strong>Supported account types:</strong> Select <em>"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"</em>. This is what makes one app serve all your customers.</p>
                <p><strong>Redirect URI</strong> (Platform: <em>Web</em>):</p>
                <CopyField label="Redirect URI" value={redirectUri || '(APP_URL not set on api server)'} />
                <p style={{ fontSize: 12, color: '#64748b' }}>If you'll have multiple environments (dev/prod), add each one's redirect URI on this same app under <em>Authentication → Redirect URIs</em>.</p>
                <p>Click <strong>Register</strong> and you'll land on the app's Overview blade. Note the <em>Application (client) ID</em> — you'll need it on step 5.</p>
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Add API permissions</h3>
                <p>From your new app, go to <strong>API permissions → + Add a permission</strong>, then add each of these as <strong>Delegated permissions</strong>:</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>API</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Permission</th>
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {SCOPES.map((s) => (
                      <tr key={s.name}>
                        <td style={{ padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{s.api}</td>
                        <td style={{ padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}><code>{s.name}</code></td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                          <button
                            onClick={() => void navigator.clipboard.writeText(s.name)}
                            style={{ padding: '3px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                          >Copy</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  <strong>Important:</strong> After adding all four, click <strong>Grant admin consent for &lt;your tenant&gt;</strong> at the top of the API permissions page. Without that, the first customer who tries to connect will get a "Need admin approval" screen.
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Create a client secret</h3>
                <ol style={{ paddingLeft: 18 }}>
                  <li>From the app, go to <strong>Certificates &amp; secrets → + New client secret</strong>.</li>
                  <li>Description: anything memorable (e.g. <code>dev-2026</code>).</li>
                  <li>Expires: 12 or 24 months (24 is the max).</li>
                  <li>Click <strong>Add</strong>. Stay on this page.</li>
                </ol>

                <div style={{ padding: 14, background: '#fef2f2', border: '2px solid #fecaca', borderRadius: 6, fontSize: 13, color: '#991b1b', marginTop: 12, marginBottom: 12 }}>
                  <p style={{ margin: '0 0 10px 0', fontWeight: 700, fontSize: 14 }}>⚠ Read this carefully — this is the #1 mistake everyone makes.</p>
                  <p style={{ margin: '0 0 10px 0' }}>Azure shows two columns side by side. You want the <strong>Value</strong>, NOT the Secret ID:</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #fecaca', fontWeight: 600, color: '#16a34a' }}>✓ Value (what you want)</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #fecaca', fontWeight: 600, color: '#dc2626' }}>✗ Secret ID (NOT this)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#0f172a' }}><code>BLs8Q~5snaMsf6SnoQRfR~tfuVJ6iMPJD…</code></td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#94a3b8' }}><code>6828f127-90b8-4da5-8127-1a7040727b65</code></td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>~40 chars, mix of letters/digits/<code>~</code><code>.</code></td>
                        <td style={{ padding: '6px 8px', color: '#475569' }}>UUID format (8-4-4-4-12)</td>
                      </tr>
                    </tbody>
                  </table>
                  <p style={{ margin: '10px 0 0 0' }}>The Value is <strong>truncated visually</strong> in Azure's table — only ~30 chars are shown. Use the small <strong>copy icon</strong> next to the Value (not the text) to copy the full secret to your clipboard.</p>
                  <p style={{ margin: '6px 0 0 0' }}><strong>Microsoft only shows the Value once</strong>, immediately after you click Add. If you navigate away or refresh the page, the Value column shows <code>***</code> forever — you'll have to delete the secret and create a new one.</p>
                </div>

                <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  <strong>Set a calendar reminder for the expiry date.</strong> When the secret expires, every customer's connection breaks at the same moment — no warning. Plan to rotate ~30 days before expiry.
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Paste the credentials</h3>
                <p style={{ fontSize: 13, color: '#64748b' }}>Both values come from the Azure portal. The secret is encrypted at rest and never sent back to the browser after saving.</p>

                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Application (client) ID</span>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder={existing?.source === 'db' ? existing.clientIdMasked ?? '' : '00000000-0000-0000-0000-000000000000'}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    Client secret value {existing?.source === 'db' && <em style={{ color: '#94a3b8' }}>(leave blank to keep existing)</em>}
                  </span>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={existing?.source === 'db' ? '••••••••' : 'paste secret here'}
                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientSecret) ? '#dc2626' : '#cbd5e1'}`, borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}
                  />
                  {/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientSecret) && (
                    <div style={{ marginTop: 6, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, fontSize: 12, color: '#991b1b' }}>
                      ⚠ This looks like the <strong>Secret ID</strong>, not the secret <strong>Value</strong>. Microsoft secret values are ~40 chars and contain <code>~</code> and <code>.</code> characters — see step 3.
                    </div>
                  )}
                </label>

                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Secret expiry date <em style={{ color: '#94a3b8' }}>(optional — used for warning banners)</em></span>
                  <input
                    type="date"
                    value={secretExpiresAt}
                    onChange={(e) => setSecretExpiresAt(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Notes <em style={{ color: '#94a3b8' }}>(optional)</em></span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Rotated by Graf on 2026-04-27"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }}
                  />
                </label>

                <button
                  onClick={() => void handleSave()}
                  disabled={saving || !clientId || (!existing && !clientSecret)}
                  style={{ padding: '8px 16px', background: '#4338ca', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: (!clientId || (!existing && !clientSecret)) ? 0.5 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save credentials'}
                </button>

                {savedOk && <p style={{ marginTop: 12, color: '#166534' }}>✓ Saved. Continue to the test step.</p>}
                {saveError && <p style={{ marginTop: 12, color: '#b91c1c' }}>{saveError}</p>}
              </div>
            )}

            {step === 5 && (
              <div>
                <h3 style={{ fontSize: 16, marginTop: 0 }}>Validate the credentials</h3>
                <p>This sends a deliberately invalid authorization code to Microsoft's token endpoint using your saved credentials. If credentials are correct, Microsoft rejects the fake code with <code>invalid_grant</code> — that's the success signal. If credentials are wrong, the actual error is shown below.</p>
                <button
                  onClick={() => void handleTest()}
                  disabled={testing}
                  style={{ padding: '8px 16px', background: '#0078d4', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: testing ? 'wait' : 'pointer' }}
                >
                  {testing ? 'Testing…' : 'Run validation'}
                </button>

                {testResult && (
                  <div style={{ marginTop: 16, padding: 12, background: testResult.valid ? '#dcfce7' : '#fef2f2', border: `1px solid ${testResult.valid ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, color: testResult.valid ? '#166534' : '#991b1b', fontSize: 13 }}>
                    <strong>{testResult.valid ? '✓ Credentials valid' : '✗ Validation failed'}</strong>
                    <p style={{ margin: '6px 0 0 0' }}>{testResult.message}</p>
                  </div>
                )}

                {testResult?.valid && (
                  <p style={{ marginTop: 16, color: '#166534' }}>
                    You're done. Customers can now connect their Microsoft 365 mailboxes from Settings → Email Accounts. No api restart needed — the change took effect when you saved.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ padding: '8px 14px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.5 : 1 }}
          >Back</button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
              disabled={step === 4 && !canAdvanceFromPaste}
              style={{ padding: '8px 14px', background: '#4338ca', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: (step === 4 && !canAdvanceFromPaste) ? 'not-allowed' : 'pointer', opacity: (step === 4 && !canAdvanceFromPaste) ? 0.5 : 1 }}
            >Next</button>
          ) : (
            <button
              onClick={onClose}
              style={{ padding: '8px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
