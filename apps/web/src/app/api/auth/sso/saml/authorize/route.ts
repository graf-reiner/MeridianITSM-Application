import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getJacksonInstance } from '@/lib/sso/saml-jackson';

export async function GET(request: NextRequest) {
  try {
    const { oauthController } = await getJacksonInstance();

    const tenant = request.nextUrl.searchParams.get('tenant') ?? '';
    const product = 'meridian-itsm';
    const state = request.nextUrl.searchParams.get('state') ?? crypto.randomBytes(16).toString('hex');
    const redirectUrl =
      request.nextUrl.searchParams.get('redirect_uri') ??
      `${process.env.NEXTAUTH_URL ?? request.nextUrl.origin}/api/auth/sso/saml/callback`;

    const result = await oauthController.authorize({
      tenant,
      product,
      client_id: 'dummy',
      redirect_uri: redirectUrl,
      state,
      response_type: 'code',
      code_challenge: '',
      code_challenge_method: '',
    } as any);

    if (result.redirect_url) {
      return NextResponse.redirect(result.redirect_url);
    }

    return NextResponse.redirect(
      new URL('/login?error=SAML+authorization+failed', request.url),
    );
  } catch (error) {
    console.error('SAML authorize error:', error);
    return NextResponse.redirect(
      new URL('/login?error=SAML+error', request.url),
    );
  }
}
