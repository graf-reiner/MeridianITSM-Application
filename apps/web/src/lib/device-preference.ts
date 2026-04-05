export const DEVICE_PREF_COOKIE = 'meridian_device_pref';
export const DEVICE_PREF_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export type DevicePreference = 'mobile-app' | 'desktop';

/**
 * Read the device preference cookie. Returns null when unset or when
 * running in a non-browser environment.
 */
export function getDevicePreference(): DevicePreference | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${DEVICE_PREF_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(DEVICE_PREF_COOKIE.length + 1));
  if (value === 'mobile-app' || value === 'desktop') return value;
  return null;
}

/**
 * Write the device preference cookie with a 1-year expiry.
 */
export function setDevicePreference(value: DevicePreference): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${DEVICE_PREF_COOKIE}=${encodeURIComponent(value)}` +
    `; Path=/` +
    `; Max-Age=${DEVICE_PREF_MAX_AGE_SECONDS}` +
    `; SameSite=Lax${secure}`;
}

/**
 * Clear the device preference cookie, causing the launcher modal to
 * re-appear on next mobile load.
 */
export function clearDevicePreference(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${DEVICE_PREF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
