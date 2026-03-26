import { NextRequest, NextResponse } from 'next/server';
import { getJacksonInstance } from '@/lib/sso/saml-jackson';

export async function POST(request: NextRequest) {
  try {
    const { oauthController } = await getJacksonInstance();

    const formData = await request.formData();
    const SAMLResponse = formData.get('SAMLResponse') as string;
    const RelayState = formData.get('RelayState') as string;

    if (!SAMLResponse) {
      return NextResponse.redirect(
        new URL('/login?error=Missing+SAML+response', request.url),
      );
    }

    const result = await oauthController.samlResponse({
      SAMLResponse,
      RelayState,
    });

    // SAML Jackson converts the assertion into an OAuth redirect
    // Follow the redirect to complete the flow
    return NextResponse.redirect(result.redirect_url!);
  } catch (error) {
    console.error('SAML ACS error:', error);
    return NextResponse.redirect(
      new URL('/login?error=SAML+authentication+failed', request.url),
    );
  }
}
