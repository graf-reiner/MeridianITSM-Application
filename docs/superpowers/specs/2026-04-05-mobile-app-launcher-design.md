# Mobile App Launcher — Design Spec

**Date:** 2026-04-05
**Status:** Draft

## Problem

When a mobile device hits the Meridian ITSM web app, the responsive web UI is served. A native React Native app (`apps/mobile`) also exists with better ergonomics on phones. Mobile users currently have no prompt to switch to the native app.

## Goal

On first authenticated visit from a mobile device, prompt the user with a modal asking whether to use the native mobile app or continue in the browser. Persist the choice for one year via a cookie. Provide a way for users to change the choice later.

## User Flow

1. User logs in on a phone (or tablet with coarse pointer) → hits `/dashboard` or `/portal`.
2. Client detects mobile viewport + no preference cookie → modal appears.
3. User picks **"Open Mobile App"**:
   - Browser attempts deep-link `servicedesk://`.
   - After 1.5s, if the page is still visible (app not installed), redirect to iOS App Store or Google Play Store based on UA.
   - Cookie `meridian_device_pref=mobile-app` is set.
4. User picks **"Continue in Browser"**:
   - Cookie `meridian_device_pref=desktop` is set.
   - Modal closes; user proceeds normally.
5. Later, user can click **"Switch to mobile app"** in the account dropdown (header) to clear the cookie and re-trigger the modal on next load.

## Detection

A client hook `useIsMobile()` combining:
- `window.matchMedia('(max-width: 768px) and (pointer: coarse)')`
- UA check for `/iPhone|iPad|iPod|Android/i` as a secondary signal

Both must be true. Runs only after hydration (no SSR mismatch). The modal lives entirely client-side — no middleware changes.

## Cookie

| Name | `meridian_device_pref` |
|---|---|
| Values | `mobile-app` \| `desktop` |
| Expiry | 365 days |
| Path | `/` |
| SameSite | `Lax` |
| Secure | `true` in production |
| HttpOnly | **false** (client must read it without a round-trip) |

Written either directly via `document.cookie` or via a thin API route; reads always via `document.cookie`.

## Architecture

### New Files

- `apps/web/src/hooks/use-is-mobile.ts` — returns `boolean | null` (null until hydrated).
- `apps/web/src/lib/device-preference.ts` — `getDevicePreference()`, `setDevicePreference(value)`, `clearDevicePreference()` (cookie helpers).
- `apps/web/src/lib/deep-link.ts` — `openMobileApp()`: fires `servicedesk://`, sets a 1500ms timeout, redirects to the correct store on fallback using UA detection.
- `apps/web/src/components/MobileLauncherModal.tsx` — client component, mounted in both authenticated layouts. Checks hook + cookie on mount; renders a Radix/shadcn Dialog with two buttons if conditions met.

### Modified Files

- `apps/web/src/app/dashboard/layout.tsx` — mount `<MobileLauncherModal />`.
- `apps/web/src/app/portal/layout.tsx` — mount `<MobileLauncherModal />`.
- Header/account dropdown component (search `user.?menu|UserMenu` inside the layouts) — add **"Switch to mobile app"** menu item that calls `clearDevicePreference()` then `location.reload()`.

### Store URLs (constants)

- iOS: `https://apps.apple.com/app/idXXXXXXXXX` (TBD — need real App Store ID)
- Android: `https://play.google.com/store/apps/details?id=com.meridianitsm.mobile` (TBD — confirm package ID)

These should live in `apps/web/src/lib/deep-link.ts` as exported constants for easy update.

## Modal Content

**Title:** "Better on mobile?"
**Body:** "Meridian has a mobile app built for your phone. Would you like to open it?"
**Primary button:** "Open Mobile App"
**Secondary button:** "Continue in Browser"

Close/X is intentionally omitted — user must make a choice. (Picking "Continue in Browser" is the escape hatch.)

## Edge Cases

- **Tablet on desktop-sized viewport** — `max-width: 768px` gate excludes it. Intentional; tablets can use the desktop UI comfortably.
- **Deep-link fallback on iOS Safari** — `document.visibilityState === 'hidden'` after the timeout means the app opened; otherwise redirect to store. Use `document.visibilityState` (not page unload) because iOS can be inconsistent.
- **User already on native app's web view** — not a concern; native app uses its own API client, does not load web routes.
- **Cookie cleared by browser** — modal reappears next visit. Acceptable.
- **End-user vs staff** — modal is identical for both; mounted in both `dashboard` and `portal` layouts.

## Multi-Tenancy

No DB writes, no tenant data involved. Cookie is device-scoped and preference-only. The API route (if used) is a stateless cookie setter.

## Testing

- Unit test for `useIsMobile()` with mocked `matchMedia` and UA.
- Unit test for deep-link fallback logic (mock `setTimeout`, `visibilityState`, `location`).
- Playwright E2E: login as agent with mobile viewport + UA → assert modal appears; click "Continue in Browser" → assert cookie set, modal gone, reload → modal does NOT reappear.
- Playwright E2E: desktop viewport → modal never appears.

## Out of Scope

- Changing the responsive web UI itself.
- Tracking preference server-side per-user (cookie is per-device, which is correct for this feature).
- A/B testing modal copy.
