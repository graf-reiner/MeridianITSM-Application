import jackson, { type JacksonOption } from '@boxyhq/saml-jackson';

let jacksonInstance: Awaited<ReturnType<typeof jackson>> | null = null;

export async function getJacksonInstance() {
  if (jacksonInstance) return jacksonInstance;

  const opts: JacksonOption = {
    externalUrl: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
    samlPath: '/api/auth/sso/saml/acs',
    samlAudience:
      process.env.SAML_AUDIENCE ?? 'https://saml.meridian-itsm.com',
    db: {
      engine: 'sql',
      type: 'postgres',
      url:
        process.env.DATABASE_URL ??
        'postgresql://meridian:meridian@10.1.200.153:5432/meridian',
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY ?? '',
    },
    idpEnabled: true,
  };

  jacksonInstance = await jackson(opts);
  return jacksonInstance;
}
