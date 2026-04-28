// ─── End-to-End Mail Connector Test ──────────────────────────────────────────
// POST /api/v1/email-accounts/:id/test-roundtrip          - start a test
// GET  /api/v1/email-accounts/:id/test-roundtrip/:testId  - poll status
//
// Walks four phases:
//   smtpAuth  - testSmtpConnection (handshake, no body sent)
//   smtpSend  - real outbound send to the user-supplied address with
//               subject "[MeridianITSM Connector Test #<token>]"
//   imapAuth  - testImapConnection (connect, list mailboxes, logout)
//   roundtrip - flipped to OK by the worker when the inbound poll loop
//               sees the test message (markTestReceived in worker)
//
// Right after smtpSend succeeds we enqueue an ad-hoc 'poll-once' job on
// the email-polling queue so the worker checks the inbox immediately
// instead of waiting for the next 5-minute scheduled cycle.

import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { prisma } from '@meridian/db';
import { decrypt, encrypt, getFreshAccessToken, getOAuthCredentials } from '@meridian/core';
import { requirePermission } from '../../../plugins/rbac.js';
import { testSmtpConnection, testImapConnection } from '../../../services/email.service.js';
import {
  generateTestId,
  generateToken,
  buildTestSubject,
  saveState,
  loadState,
  patchState,
  rollupOverall,
  type TestState,
} from '../../../services/connector-test.service.js';

// Reuse the same Redis URL parsing the worker uses
function makeBullmqConnection() {
  return {
    host: (() => {
      try { return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname; } catch { return 'localhost'; }
    })(),
    port: (() => {
      try { return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379; } catch { return 6379; }
    })(),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

const emailPollingQueue = new Queue('email-polling', { connection: makeBullmqConnection() });

interface AccountRow {
  id: string;
  tenantId: string;
  emailAddress: string;
  authProvider: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPasswordEnc: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  imapUser: string | null;
  imapPasswordEnc: string | null;
  oauthAccessTokenEnc: string | null;
  oauthRefreshTokenEnc: string | null;
  oauthTokenExpiresAt: Date | null;
}

async function buildSmtpTransport(account: AccountRow): Promise<nodemailer.Transporter> {
  const isOAuth = account.authProvider === 'GOOGLE' || account.authProvider === 'MICROSOFT';
  if (isOAuth) {
    const provider = account.authProvider!.toLowerCase() as 'google' | 'microsoft';
    const creds = await getOAuthCredentials(prisma, provider);
    if (!creds) throw new Error(`OAuth credentials not configured for ${provider}`);
    if (!account.oauthRefreshTokenEnc) throw new Error('Account is missing OAuth refresh token — reconnect from Settings');
    const result = await getFreshAccessToken(
      provider,
      account.oauthAccessTokenEnc ?? '',
      account.oauthRefreshTokenEnc,
      account.oauthTokenExpiresAt ?? new Date(0),
      creds.clientId,
      creds.clientSecret,
    );
    if (result.refreshed) {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          oauthAccessTokenEnc: encrypt(result.accessToken),
          oauthTokenExpiresAt: result.newExpiresAt ?? null,
          oauthConnectionStatus: 'CONNECTED',
        },
      });
    }
    return nodemailer.createTransport({
      host: account.smtpHost ?? 'smtp.office365.com',
      port: account.smtpPort ?? 587,
      secure: false,
      auth: { type: 'OAuth2', user: account.smtpUser ?? account.emailAddress, accessToken: result.accessToken } as never,
    });
  }
  // Manual / password path
  let pass = '';
  if (account.smtpPasswordEnc) { try { pass = decrypt(account.smtpPasswordEnc); } catch { /* leave empty */ } }
  const hasAuth = !!(account.smtpUser || pass);
  return nodemailer.createTransport({
    host: account.smtpHost ?? undefined,
    port: account.smtpPort ?? 587,
    secure: account.smtpSecure,
    ...(hasAuth ? { auth: { user: account.smtpUser ?? '', pass } } : {}),
  });
}

export async function testRoundtripRoutes(app: FastifyInstance): Promise<void> {
  // POST /:id/test-roundtrip — start a test
  app.post('/api/v1/email-accounts/:id/test-roundtrip', { preHandler: [requirePermission('settings.update')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { to?: string };
    const to = body.to?.trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return reply.status(400).send({ error: 'Valid "to" email address required' });
    }

    const account = await prisma.emailAccount.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!account) return reply.status(404).send({ error: 'Email account not found' });

    const testId = generateTestId();
    const token = generateToken();
    const state: TestState = {
      testId,
      startedAt: new Date().toISOString(),
      to,
      token,
      phases: {
        smtpAuth:   { status: 'PENDING' },
        smtpSend:   { status: 'PENDING' },
        imapAuth:   { status: 'PENDING' },
        roundtrip:  { status: 'PENDING' },
      },
      overall: 'RUNNING',
    };
    await saveState(user.tenantId, state);

    // Run phases asynchronously — return testId immediately so frontend can start polling.
    void runPhases(account as AccountRow, state).catch(err => {
      console.error(`[test-roundtrip] runPhases threw for ${testId}:`, err);
    });

    return reply.status(202).send({ testId, state });
  });

  // GET /:id/test-roundtrip/:testId — poll status
  app.get('/api/v1/email-accounts/:id/test-roundtrip/:testId', { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id, testId } = request.params as { id: string; testId: string };
    const account = await prisma.emailAccount.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
    if (!account) return reply.status(404).send({ error: 'Email account not found' });

    const state = await loadState(user.tenantId, testId);
    if (!state) return reply.status(404).send({ error: 'Test not found or expired' });

    // Recompute overall on read so the frontend sees TIMEOUT once the wait window elapses
    state.overall = rollupOverall(state);
    if (state.overall !== 'RUNNING' && !state.finishedAt) state.finishedAt = new Date().toISOString();
    return reply.send({ state });
  });
}

async function runPhases(account: AccountRow, initial: TestState): Promise<void> {
  const tenantId = account.tenantId;
  const testId = initial.testId;

  // ── Phase 1: SMTP auth ────────────────────────────────────────────────────
  const isOAuthSmtp = account.authProvider === 'GOOGLE' || account.authProvider === 'MICROSOFT';
  if (!account.smtpHost) {
    await patchState(tenantId, testId, s => {
      s.phases.smtpAuth = { status: 'FAILED', detail: 'Account has no SMTP host configured' };
      s.phases.smtpSend = { status: 'SKIPPED' };
      s.phases.imapAuth = { status: 'SKIPPED' };
      s.phases.roundtrip = { status: 'SKIPPED' };
      s.overall = 'FAILED';
      s.finishedAt = new Date().toISOString();
      return s;
    });
    return;
  }

  if (!isOAuthSmtp) {
    let smtpPass = '';
    if (account.smtpPasswordEnc) { try { smtpPass = decrypt(account.smtpPasswordEnc); } catch { /* */ } }
    const smtpStart = Date.now();
    const result = await testSmtpConnection({
      host: account.smtpHost,
      port: account.smtpPort ?? 587,
      secure: account.smtpSecure,
      user: account.smtpUser ?? '',
      password: smtpPass,
    });
    await patchState(tenantId, testId, s => {
      s.phases.smtpAuth = result.success
        ? { status: 'OK', durationMs: Date.now() - smtpStart }
        : { status: 'FAILED', detail: result.error ?? 'SMTP authentication failed', durationMs: Date.now() - smtpStart };
      return s;
    });
    if (!result.success) { await markFailed(tenantId, testId, 'smtpSend'); return; }
  } else {
    // OAuth SMTP — auth happens implicitly when the transport refreshes the token below.
    // Treat phase 1 as OK and let phase 2 surface any auth issue.
    await patchState(tenantId, testId, s => {
      s.phases.smtpAuth = { status: 'OK', detail: 'OAuth — verified during send' };
      return s;
    });
  }

  // ── Phase 2: SMTP send ────────────────────────────────────────────────────
  const subject = buildTestSubject(initial.token);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0f172a; margin: 0 0 12px;">MeridianITSM Connector Test</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        This automated message was sent to verify your mail connector. The MeridianITSM inbound poll loop is watching for it
        and will mark your test as PASSED when it arrives. The message will <strong>not</strong> be turned into a ticket.
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        Test ID: ${initial.testId} &middot; Token: ${initial.token}
      </p>
    </div>`;
  const sendStart = Date.now();
  let messageId: string | undefined;
  try {
    const transport = await buildSmtpTransport(account);
    try {
      const info = await transport.sendMail({
        from: account.emailAddress,
        to: initial.to,
        subject,
        html,
      });
      messageId = info.messageId;
    } finally {
      transport.close();
    }
    await patchState(tenantId, testId, s => {
      s.phases.smtpSend = { status: 'OK', detail: `Sent to ${initial.to}`, messageId, durationMs: Date.now() - sendStart };
      return s;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await patchState(tenantId, testId, s => {
      s.phases.smtpSend = { status: 'FAILED', detail: msg, durationMs: Date.now() - sendStart };
      return s;
    });
    await markFailed(tenantId, testId, 'imapAuth');
    return;
  }

  // ── Phase 3: IMAP auth ────────────────────────────────────────────────────
  if (!account.imapHost) {
    await patchState(tenantId, testId, s => {
      s.phases.imapAuth = { status: 'FAILED', detail: 'Account has no IMAP host configured — cannot verify roundtrip' };
      s.phases.roundtrip = { status: 'SKIPPED' };
      s.overall = 'FAILED';
      s.finishedAt = new Date().toISOString();
      return s;
    });
    return;
  }
  // For OAuth, run a real IMAP probe with the access token: connect + lock
  // INBOX + logout. Surfaces XOAUTH2 failures (most commonly "IMAP disabled
  // on the mailbox") at Phase 3 with the actual server response, instead of
  // letting the test silently TIMEOUT 5 minutes later at Phase 4.
  if (isOAuthSmtp) {
    const provider = account.authProvider!.toLowerCase() as 'google' | 'microsoft';
    const imapStart = Date.now();
    try {
      const creds = await getOAuthCredentials(prisma, provider);
      if (!creds) throw new Error(`OAuth credentials not configured for ${provider}`);
      if (!account.oauthRefreshTokenEnc) throw new Error('Account is missing OAuth refresh token — reconnect from Settings');
      const tok = await getFreshAccessToken(
        provider,
        account.oauthAccessTokenEnc ?? '',
        account.oauthRefreshTokenEnc,
        account.oauthTokenExpiresAt ?? new Date(0),
        creds.clientId,
        creds.clientSecret,
      );
      if (tok.refreshed) {
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            oauthAccessTokenEnc: encrypt(tok.accessToken),
            oauthTokenExpiresAt: tok.newExpiresAt ?? null,
            oauthConnectionStatus: 'CONNECTED',
          },
        });
      }
      const client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort ?? 993,
        secure: account.imapSecure,
        auth: { user: account.imapUser ?? account.emailAddress, accessToken: tok.accessToken },
        logger: false,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        lock.release();
      } finally {
        try { await client.logout(); } catch { /* ignore */ }
      }
      await patchState(tenantId, testId, s => {
        s.phases.imapAuth = { status: 'OK', detail: 'OAuth IMAP authenticated', durationMs: Date.now() - imapStart };
        return s;
      });
    } catch (err) {
      // imapflow attaches `responseText` when the server returned a NO/BAD
      // response — that's the field with the actionable message (e.g.
      // "AUTHENTICATE failed."). Bare err.message is just "Command failed".
      const errAny = err as { message?: string; responseText?: string; authenticationFailed?: boolean };
      const detail = errAny.responseText
        ? `${errAny.responseText}${errAny.authenticationFailed ? ' (XOAUTH2 rejected — IMAP likely disabled on the mailbox)' : ''}`
        : (err instanceof Error ? err.message : String(err));
      await patchState(tenantId, testId, s => {
        s.phases.imapAuth = { status: 'FAILED', detail, durationMs: Date.now() - imapStart };
        return s;
      });
      await markFailed(tenantId, testId, 'roundtrip');
      return;
    }
  } else {
    let imapPass = '';
    if (account.imapPasswordEnc) { try { imapPass = decrypt(account.imapPasswordEnc); } catch { /* */ } }
    const imapStart = Date.now();
    const result = await testImapConnection({
      host: account.imapHost,
      port: account.imapPort ?? 993,
      secure: account.imapSecure,
      user: account.imapUser ?? '',
      password: imapPass,
    });
    await patchState(tenantId, testId, s => {
      s.phases.imapAuth = result.success
        ? { status: 'OK', durationMs: Date.now() - imapStart }
        : { status: 'FAILED', detail: result.error ?? 'IMAP authentication failed', durationMs: Date.now() - imapStart };
      return s;
    });
    if (!result.success) { await markFailed(tenantId, testId, 'roundtrip'); return; }
  }

  // ── Phase 4: trigger an immediate poll, then leave roundtrip pending ──────
  // The worker will flip roundtrip to OK when it sees the correlation token.
  // Frontend keeps polling until rollupOverall returns TIMEOUT (5 min) or PASSED.
  try {
    await emailPollingQueue.add('poll-once', { tenantId, accountId: account.id }, {
      removeOnComplete: { age: 300 },
      removeOnFail: { age: 300 },
    });
  } catch (err) {
    console.error('[test-roundtrip] Failed to enqueue poll-once:', err);
  }
}

async function markFailed(tenantId: string, testId: string, fromPhase: 'smtpSend' | 'imapAuth' | 'roundtrip'): Promise<void> {
  await patchState(tenantId, testId, s => {
    if (fromPhase === 'smtpSend' || fromPhase === 'imapAuth' || fromPhase === 'roundtrip') {
      if (s.phases.smtpSend.status === 'PENDING') s.phases.smtpSend = { status: 'SKIPPED' };
    }
    if (fromPhase === 'imapAuth' || fromPhase === 'roundtrip') {
      if (s.phases.imapAuth.status === 'PENDING') s.phases.imapAuth = { status: 'SKIPPED' };
    }
    if (s.phases.roundtrip.status === 'PENDING') s.phases.roundtrip = { status: 'SKIPPED' };
    s.overall = 'FAILED';
    s.finishedAt = new Date().toISOString();
    return s;
  });
}
