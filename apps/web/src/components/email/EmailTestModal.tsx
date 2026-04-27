'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@mdi/react';
import { mdiClose, mdiCheckCircle, mdiCloseCircle, mdiCircleSmall, mdiMinusCircle, mdiPlay } from '@mdi/js';

interface Props {
  account: { id: string; emailAddress: string };
  defaultTo?: string;
  onClose: () => void;
}

type PhaseStatus = 'PENDING' | 'OK' | 'FAILED' | 'SKIPPED';

interface TestPhase {
  status: PhaseStatus;
  detail?: string;
  durationMs?: number;
  messageId?: string;
}

interface TestState {
  testId: string;
  startedAt: string;
  to: string;
  token: string;
  phases: {
    smtpAuth: TestPhase;
    smtpSend: TestPhase;
    imapAuth: TestPhase;
    roundtrip: TestPhase;
  };
  finishedAt?: string;
  overall: 'RUNNING' | 'PASSED' | 'FAILED' | 'TIMEOUT';
}

const PHASE_LABELS: Record<keyof TestState['phases'], string> = {
  smtpAuth: 'SMTP authentication',
  smtpSend: 'Send test email',
  imapAuth: 'IMAP authentication',
  roundtrip: 'Round-trip received',
};

function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === 'OK') return <Icon path={mdiCheckCircle} size={0.85} color="#16a34a" />;
  if (status === 'FAILED') return <Icon path={mdiCloseCircle} size={0.85} color="#dc2626" />;
  if (status === 'SKIPPED') return <Icon path={mdiMinusCircle} size={0.85} color="#94a3b8" />;
  // PENDING — animated spinner
  return (
    <span style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid #cbd5e1', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'meridian-spin 0.8s linear infinite' }} />
  );
}

export default function EmailTestModal({ account, defaultTo, onClose }: Props) {
  const [to, setTo] = useState(defaultTo ?? account.emailAddress);
  const [state, setState] = useState<TestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Poll loop
  useEffect(() => {
    if (!state || state.overall !== 'RUNNING') return;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/email-accounts/${account.id}/test-roundtrip/${state.testId}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { state: TestState };
        setState(data.state);
        if (data.state.overall !== 'RUNNING') window.clearInterval(id);
      } catch (err) {
        console.error('test poll error', err);
      }
    }, 2000);
    pollRef.current = id;
    return () => window.clearInterval(id);
  }, [state, account.id]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    setState(null);
    try {
      const res = await fetch(`/api/v1/email-accounts/${account.id}/test-roundtrip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to }),
      });
      const data = await res.json() as { error?: string; testId?: string; state?: TestState };
      if (!res.ok || !data.state) throw new Error(data.error ?? 'Failed to start test');
      setState(data.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start test');
    } finally {
      setStarting(false);
    }
  }

  const phaseEntries: Array<{ key: keyof TestState['phases']; phase: TestPhase }> = state ? [
    { key: 'smtpAuth', phase: state.phases.smtpAuth },
    { key: 'smtpSend', phase: state.phases.smtpSend },
    { key: 'imapAuth', phase: state.phases.imapAuth },
    { key: 'roundtrip', phase: state.phases.roundtrip },
  ] : [];

  const overallBg = state?.overall === 'PASSED' ? '#dcfce7' : state?.overall === 'FAILED' ? '#fef2f2' : state?.overall === 'TIMEOUT' ? '#fef3c7' : '#eff6ff';
  const overallFg = state?.overall === 'PASSED' ? '#166534' : state?.overall === 'FAILED' ? '#991b1b' : state?.overall === 'TIMEOUT' ? '#92400e' : '#1e40af';

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
      <style>{`@keyframes meridian-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#0f172a' }}>Test email connector</h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0 0' }}>{account.emailAddress}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon path={mdiClose} size={0.8} color="#64748b" />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 14px 0' }}>
            Sends a real test email to the address below, then waits for the inbound poller to detect it. The test message is tagged with a unique token so it&apos;s never turned into a ticket.
          </p>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Send test to</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={state?.overall === 'RUNNING'}
              placeholder="you@example.com"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }}
            />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Defaults to the account&apos;s own address. The message must arrive in this account&apos;s inbox for the round-trip phase to pass.</span>
          </label>

          <button
            onClick={() => void handleStart()}
            disabled={starting || state?.overall === 'RUNNING' || !to}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4338ca', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: starting ? 'wait' : 'pointer', opacity: (!to || starting || state?.overall === 'RUNNING') ? 0.5 : 1 }}
          >
            <Icon path={mdiPlay} size={0.7} color="currentColor" />
            {starting ? 'Starting…' : state ? 'Run again' : 'Run end-to-end test'}
          </button>

          {error && <p style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>{error}</p>}

          {state && (
            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 10, fontSize: 12, color: '#64748b' }}>
                Started {new Date(state.startedAt).toLocaleTimeString()} &middot; Test ID <code>{state.testId}</code>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {phaseEntries.map(({ key, phase }) => (
                  <li key={key} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                    <div style={{ paddingTop: 1 }}><PhaseIcon status={phase.status} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{PHASE_LABELS[key]}</div>
                      {phase.detail && <div style={{ fontSize: 12, color: phase.status === 'FAILED' ? '#991b1b' : '#64748b', marginTop: 2, wordBreak: 'break-word' }}>{phase.detail}</div>}
                      {phase.messageId && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>Message-ID: {phase.messageId}</div>}
                    </div>
                    {typeof phase.durationMs === 'number' && (
                      <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{phase.durationMs} ms</div>
                    )}
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 14, padding: '10px 12px', background: overallBg, color: overallFg, borderRadius: 6, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                {state.overall === 'RUNNING' && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'meridian-spin 0.8s linear infinite' }} />}
                {state.overall === 'RUNNING' && 'Test running — watching for the message to come back…'}
                {state.overall === 'PASSED' && <>✓ End-to-end test passed</>}
                {state.overall === 'FAILED' && <>✗ Test failed — see details above</>}
                {state.overall === 'TIMEOUT' && <>⏱ Round-trip timed out (5 min) — message was sent but never seen by the inbound poll</>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
