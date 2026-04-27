// POST /api/integrations/:provider/test — exercise the saved credentials by
// sending a deliberately fake authorization_code to the provider's /token
// endpoint and inspecting the error response.
//
// Why this works:
//   - If clientId/clientSecret are valid, the provider returns
//     "invalid_grant" (Microsoft AADSTS70008 / Google "Bad Request") because
//     the code itself is fake. That's our success signal — credentials ok.
//   - If clientSecret is wrong, the provider returns "invalid_client" /
//     "Invalid client secret" — surfaced verbatim to the wizard.
//   - If clientId is wrong, "Application not found in directory of <tenant>"
//     or similar — also surfaced verbatim.

import { prisma } from '@meridian/db';
import { decrypt, OAUTH_PROVIDERS } from '@meridian/core';
import { verifyOwnerToken } from '../../../../../lib/owner-auth';
import { NextResponse } from 'next/server';

type Provider = 'MICROSOFT' | 'GOOGLE';
const PROVIDERS: Provider[] = ['MICROSOFT', 'GOOGLE'];

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { provider: rawProvider } = await params;
  const provider = rawProvider.toUpperCase() as Provider;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }

  // Pull the saved row (test only validates DB-stored creds; env-only deployments
  // already work and don't need a wizard self-test).
  const row = await prisma.ownerOAuthIntegration.findUnique({ where: { provider } });
  if (!row) {
    return NextResponse.json(
      { valid: false, message: 'No saved credentials for this provider. Save first, then test.' },
      { status: 400 },
    );
  }

  let clientSecret: string;
  try {
    clientSecret = decrypt(row.clientSecretEnc);
  } catch (err) {
    return NextResponse.json(
      { valid: false, message: `Could not decrypt stored secret: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 500 },
    );
  }

  const config = OAUTH_PROVIDERS[provider === 'MICROSOFT' ? 'microsoft' : 'google'];
  const redirectUri = `${process.env.APP_URL ?? ''}/api/v1/email-accounts/oauth/callback`;

  // POST a fake code to the provider's token endpoint
  const body = new URLSearchParams({
    client_id: row.clientId,
    client_secret: clientSecret,
    code: 'invalid-test-code-from-meridian-wizard',
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  let providerResp: Response;
  try {
    providerResp = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    return NextResponse.json(
      { valid: false, message: `Network error reaching ${config.tokenUrl}: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 502 },
    );
  }

  let payload: { error?: string; error_description?: string; error_codes?: number[] };
  try {
    payload = await providerResp.json() as typeof payload;
  } catch {
    return NextResponse.json({ valid: false, message: `Provider returned non-JSON response (HTTP ${providerResp.status})` });
  }

  // Microsoft: AADSTS70008 = expired/invalid code (= our credentials are valid)
  // Google:   error="invalid_grant" with description like "Malformed auth code"
  // Either way, "invalid_grant" means the credentials worked and the code (which we faked) was rejected.
  if (payload.error === 'invalid_grant') {
    return NextResponse.json({
      valid: true,
      message: `Credentials accepted by ${provider === 'MICROSOFT' ? 'Microsoft' : 'Google'}. (The fake code was correctly rejected — that's expected.)`,
    });
  }

  // Anything else is a real credential problem — surface the provider's own message.
  return NextResponse.json({
    valid: false,
    message: payload.error_description || payload.error || `Unexpected response from provider (HTTP ${providerResp.status})`,
  });
}
