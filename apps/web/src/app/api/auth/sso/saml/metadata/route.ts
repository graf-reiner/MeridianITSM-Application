import { getJacksonInstance } from '@/lib/sso/saml-jackson';

export async function GET() {
  try {
    const { spConfig } = await getJacksonInstance();
    const spData = await spConfig.get();
    // spConfig.get() returns { acsUrl, entityId, response, ... }
    // The 'response' field contains the XML metadata
    const xmlMetadata = (spData as any).response ?? (spData as any).metadata ?? JSON.stringify(spData);

    return new Response(xmlMetadata, {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('SP metadata error:', error);
    return new Response('Service unavailable', { status: 503 });
  }
}
