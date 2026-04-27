'use client';

// Detailed Azure manifest walkthrough — opened from step 3 of the Microsoft 365
// OAuth wizard for users who prefer the manifest-edit path over the click-through
// API permissions UI. Content sourced from scratch/MSWizardHTML.txt.

import { useEffect } from 'react';

interface Props {
  onClose: () => void;
}

const MANIFEST_BLOCK = `"requiredResourceAccess": [
  {
    "resourceAppId": "00000002-0000-0ff1-ce00-000000000000",
    "resourceAccess": [
      {
        "id": "dc50a0fb-09a3-484d-be87-e023b12c6440",
        "type": "Scope"
      },
      {
        "id": "25a18cb1-9b45-4d7e-b31f-8f4ec47d6f5f",
        "type": "Scope"
      }
    ]
  },
  {
    "resourceAppId": "00000003-0000-0000-c000-000000000000",
    "resourceAccess": [
      {
        "id": "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
        "type": "Scope"
      },
      {
        "id": "7427e0e9-2fba-42fe-b0c0-848c9e6a8182",
        "type": "Scope"
      }
    ]
  }
]`;

export default function AzurePermissionsManifestModal({ onClose }: Props) {
  // Esc key closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 980, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detailed walkthrough</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#64748b', cursor: 'pointer', padding: 4 }} aria-label="Close">×</button>
        </div>

        {/* Scrollable body — all content lives inside the .azure-walkthrough class so the scoped CSS doesn't leak */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div className="azure-walkthrough">
            <section className="instruction-card">
              <div className="instruction-header">
                <div className="instruction-icon">🔧</div>
                <div>
                  <h2>Add Exchange Online Permissions via Manifest</h2>
                  <p>
                    Use these steps to add the required Microsoft Exchange Online and Microsoft Graph delegated API permissions to the
                    {' '}<strong>MeridianITSM Email Connector</strong> app registration.
                  </p>
                </div>
              </div>

              <div className="steps">

                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3>Open the App Registration</h3>
                    <p>Go to:</p>
                    <pre><code>{`Microsoft Entra ID
→ App registrations
→ MeridianITSM Email Connector`}</code></pre>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>Open the Manifest</h3>
                    <p>Inside the App Registration, select:</p>
                    <pre><code>Manifest</code></pre>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>Find the <code>requiredResourceAccess</code> Section</h3>
                    <p>Look for this section in the manifest:</p>
                    <pre><code>"requiredResourceAccess": []</code></pre>
                    <p className="note">It may already contain an existing array with permissions.</p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>Replace or Merge the Permission Block</h3>

                    <div className="warning-box">
                      <strong>Important:</strong> If <code>requiredResourceAccess</code> already contains values, do not delete existing
                      permissions unless you are sure they are no longer needed. Merge the blocks instead.
                    </div>

                    <p>If the array is empty, replace it with this block:</p>

                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(MANIFEST_BLOCK)}
                        style={{ position: 'absolute', top: 10, right: 10, padding: '4px 10px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, fontSize: 11, cursor: 'pointer', zIndex: 1 }}
                      >Copy</button>
                      <pre className="code-block"><code>{MANIFEST_BLOCK}</code></pre>
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">5</div>
                  <div className="step-content">
                    <h3>Permissions This Adds</h3>

                    <div className="permissions-table-wrapper">
                      <table className="permissions-table">
                        <thead>
                          <tr>
                            <th>API</th>
                            <th>Permission</th>
                            <th>Purpose</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Exchange Online</td>
                            <td><code>IMAP.AccessAsUser.All</code></td>
                            <td>Allows mailbox access through IMAP as the signed-in user.</td>
                          </tr>
                          <tr>
                            <td>Exchange Online</td>
                            <td><code>SMTP.Send</code></td>
                            <td>Allows the connector to send email through SMTP.</td>
                          </tr>
                          <tr>
                            <td>Microsoft Graph</td>
                            <td><code>User.Read</code></td>
                            <td>Allows basic user profile read access during sign-in.</td>
                          </tr>
                          <tr>
                            <td>Microsoft Graph</td>
                            <td><code>offline_access</code></td>
                            <td>Allows refresh token access so the connector can stay authenticated.</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">6</div>
                  <div className="step-content">
                    <h3>Save the Manifest</h3>
                    <p>Click:</p>
                    <pre><code>Save</code></pre>

                    <div className="error-box">
                      <strong>If saving fails, check for:</strong>
                      <ul>
                        <li>Missing comma</li>
                        <li>Extra comma</li>
                        <li>Missing bracket</li>
                        <li>Duplicate <code>requiredResourceAccess</code> section</li>
                        <li>Invalid quotation marks</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">7</div>
                  <div className="step-content">
                    <h3>Verify the Permissions</h3>
                    <p>After saving, go to:</p>
                    <pre><code>API permissions</code></pre>

                    <p>Confirm that the following permissions appear:</p>

                    <div className="permission-groups">
                      <div className="permission-group">
                        <h4>Exchange Online</h4>
                        <ul>
                          <li><code>IMAP.AccessAsUser.All</code></li>
                          <li><code>SMTP.Send</code></li>
                        </ul>
                      </div>

                      <div className="permission-group">
                        <h4>Microsoft Graph</h4>
                        <ul>
                          <li><code>User.Read</code></li>
                          <li><code>offline_access</code></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">8</div>
                  <div className="step-content">
                    <h3>Grant Admin Consent</h3>
                    <p>If this application is used organization-wide, click:</p>
                    <pre><code>Grant admin consent</code></pre>
                    <p>
                      This allows the app to use the configured delegated permissions without each user being blocked by tenant-level consent restrictions.
                    </p>
                  </div>
                </div>

                <div className="step">
                  <div className="step-number">9</div>
                  <div className="step-content">
                    <h3>Final Checklist</h3>

                    <ul className="checklist">
                      <li>Manifest saved successfully</li>
                      <li>Exchange Online permissions are visible</li>
                      <li>Microsoft Graph permissions are visible</li>
                      <li>Admin consent has been granted if required</li>
                      <li>Redirect URI is configured correctly</li>
                      <li>Client secret or certificate is configured</li>
                      <li>Application client ID is copied into MeridianITSM</li>
                      <li>Tenant ID is copied into MeridianITSM</li>
                    </ul>
                  </div>
                </div>

              </div>

              <div className="instruction-footer">
                <strong>Result:</strong>
                {' '}Once complete, the MeridianITSM Email Connector should be able to authenticate against Microsoft 365 using the required IMAP and SMTP delegated permissions.
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Scoped styles — every selector is prefixed with .azure-walkthrough so we don't leak into the rest of owner-admin */}
      <style>{`
        .azure-walkthrough .instruction-card {
          padding: 28px;
          background: #ffffff;
          color: #1f2937;
          font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
        }
        .azure-walkthrough .instruction-header {
          display: flex;
          gap: 18px;
          align-items: flex-start;
          padding-bottom: 24px;
          margin-bottom: 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        .azure-walkthrough .instruction-icon {
          width: 52px; height: 52px;
          display: flex; align-items: center; justify-content: center;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 14px;
          font-size: 26px;
          flex-shrink: 0;
        }
        .azure-walkthrough .instruction-header h2 {
          margin: 0 0 8px;
          font-size: 22px;
          line-height: 1.2;
          color: #111827;
        }
        .azure-walkthrough .instruction-header p {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: #4b5563;
        }
        .azure-walkthrough .steps {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .azure-walkthrough .step {
          display: grid;
          grid-template-columns: 42px 1fr;
          gap: 16px;
          padding: 18px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
        }
        .azure-walkthrough .step-number {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          background: #4338ca;
          color: #ffffff;
          font-weight: 700;
          font-size: 14px;
          border-radius: 8px;
          box-shadow: 0 4px 10px rgba(67, 56, 202, 0.25);
        }
        .azure-walkthrough .step-content h3 {
          margin: 4px 0 10px;
          font-size: 16px;
          color: #111827;
        }
        .azure-walkthrough .step-content h4 {
          margin: 0 0 8px;
          font-size: 14px;
          color: #111827;
        }
        .azure-walkthrough .step-content p {
          margin: 8px 0;
          line-height: 1.6;
          color: #4b5563;
          font-size: 14px;
        }
        .azure-walkthrough code {
          font-family: Consolas, Monaco, "Courier New", monospace;
          font-size: 0.92em;
          color: #1d4ed8;
        }
        .azure-walkthrough pre {
          margin: 12px 0;
          padding: 14px 16px;
          overflow-x: auto;
          background: #0f172a;
          color: #e5e7eb;
          border-radius: 8px;
          border: 1px solid #1e293b;
        }
        .azure-walkthrough pre code {
          color: #e5e7eb;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre;
        }
        .azure-walkthrough .code-block { max-height: 460px; }
        .azure-walkthrough .note { font-size: 13px; color: #6b7280; }
        .azure-walkthrough .warning-box,
        .azure-walkthrough .error-box {
          margin: 14px 0;
          padding: 12px 14px;
          border-radius: 8px;
          line-height: 1.6;
          font-size: 13px;
        }
        .azure-walkthrough .warning-box {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }
        .azure-walkthrough .error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }
        .azure-walkthrough .error-box ul {
          margin: 8px 0 0;
          padding-left: 20px;
        }
        .azure-walkthrough .permissions-table-wrapper {
          overflow-x: auto;
          margin-top: 14px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .azure-walkthrough .permissions-table {
          width: 100%;
          border-collapse: collapse;
          background: #ffffff;
        }
        .azure-walkthrough .permissions-table th,
        .azure-walkthrough .permissions-table td {
          padding: 12px 14px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
          font-size: 13px;
        }
        .azure-walkthrough .permissions-table th {
          background: #f3f4f6;
          color: #374151;
          font-weight: 600;
        }
        .azure-walkthrough .permissions-table tr:last-child td { border-bottom: none; }
        .azure-walkthrough .permission-groups {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 14px;
        }
        .azure-walkthrough .permission-group {
          padding: 14px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
        }
        .azure-walkthrough .permission-group ul {
          margin: 0;
          padding-left: 20px;
          font-size: 13px;
        }
        .azure-walkthrough .permission-group li { margin: 6px 0; }
        .azure-walkthrough .checklist {
          list-style: none;
          padding: 0;
          margin: 14px 0 0;
          display: grid;
          gap: 8px;
        }
        .azure-walkthrough .checklist li {
          position: relative;
          padding: 10px 14px 10px 38px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 13px;
          color: #1f2937;
        }
        .azure-walkthrough .checklist li::before {
          content: "✓";
          position: absolute;
          left: 12px;
          top: 9px;
          width: 18px;
          height: 18px;
          background: #dcfce7;
          color: #15803d;
          border-radius: 50%;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }
        .azure-walkthrough .instruction-footer {
          margin-top: 22px;
          padding: 14px 18px;
          background: #ecfdf5;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          color: #166534;
          line-height: 1.6;
          font-size: 14px;
        }
        @media (max-width: 720px) {
          .azure-walkthrough .step { grid-template-columns: 1fr; }
          .azure-walkthrough .permission-groups { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
