import { NextRequest, NextResponse } from 'next/server';
import { getJacksonInstance } from '@/lib/sso/saml-jackson';

// POST — Register a SAML connection with SAML Jackson
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionAPIController } = await getJacksonInstance();

    const baseUrl =
      process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

    const connection = await connectionAPIController.createSAMLConnection({
      tenant: body.tenantId,
      product: 'meridian-itsm',
      rawMetadata: body.samlMetadataRaw ?? undefined,
      metadataUrl: body.samlMetadataUrl ?? undefined,
      defaultRedirectUrl: `${baseUrl}/api/auth/sso/saml/callback`,
      redirectUrl: JSON.stringify([
        `${baseUrl}/api/auth/sso/saml/callback`,
      ]),
      name: body.name ?? 'SAML Connection',
    });

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error('SAML connection create error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create SAML connection',
      },
      { status: 500 },
    );
  }
}

// GET — List SAML connections from SAML Jackson
export async function GET(request: NextRequest) {
  try {
    const tenant = request.nextUrl.searchParams.get('tenant') ?? '';
    const { connectionAPIController } = await getJacksonInstance();

    const connections = await connectionAPIController.getConnections({
      tenant,
      product: 'meridian-itsm',
    });

    return NextResponse.json(connections);
  } catch (error) {
    console.error('SAML connection list error:', error);
    return NextResponse.json(
      { error: 'Failed to list connections' },
      { status: 500 },
    );
  }
}
