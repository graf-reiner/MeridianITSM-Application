// Platform-level settings stored in the owner_settings key/value table. Read
// by API routes that need the public app URL for OAuth callbacks etc., with
// the corresponding env var as a fallback so an unsaved row doesn't break
// flows on a fresh install.

import { prisma } from '@meridian/db';

export const SETTING_KEYS = {
  APP_URL: 'platform.appUrl',
} as const;

export async function getPlatformAppUrl(): Promise<string> {
  const row = await prisma.ownerSetting.findUnique({
    where: { key: SETTING_KEYS.APP_URL },
  });
  const fromDb = row?.value.trim();
  if (fromDb) return fromDb.replace(/\/+$/, '');
  return (process.env.APP_URL ?? '').replace(/\/+$/, '');
}
