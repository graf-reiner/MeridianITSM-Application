// TODO: replace with the real App Store ID and Play Store package name
// once the native app is listed.
export const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id0000000000';
export const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.meridianitsm.mobile';

export const DEEP_LINK_SCHEME = 'servicedesk://';
const FALLBACK_TIMEOUT_MS = 1500;

/**
 * Attempt to open the native Meridian mobile app via deep-link.
 * If the app is not installed, the browser remains visible after
 * FALLBACK_TIMEOUT_MS and we redirect to the appropriate store.
 *
 * Exported for test injection: callers normally call with no args.
 */
export function openMobileApp(opts?: {
  userAgent?: string;
  assign?: (url: string) => void;
  setTimeoutFn?: typeof setTimeout;
  document?: Document;
}): void {
  const ua = opts?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const assign = opts?.assign ?? ((url: string) => {
    window.location.href = url;
  });
  const schedule = opts?.setTimeoutFn ?? setTimeout;
  const doc = opts?.document ?? (typeof document !== 'undefined' ? document : undefined);

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const storeUrl = isIOS ? IOS_APP_STORE_URL : ANDROID_PLAY_STORE_URL;

  // Fire the deep link.
  assign(DEEP_LINK_SCHEME);

  // If the page is still visible after the timeout, the app is not
  // installed — redirect to the store.
  schedule(() => {
    if (!doc || doc.visibilityState === 'visible') {
      assign(storeUrl);
    }
  }, FALLBACK_TIMEOUT_MS);
}
