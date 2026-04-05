# Mobile App Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an authenticated mobile user loads `/dashboard` or `/portal` without a device preference cookie, show a modal offering to open the native app (via `servicedesk://` deep-link with App Store/Play Store fallback) or continue in the browser, then persist the choice for 1 year.

**Architecture:** Pure client-side. A `useIsMobile` hook detects coarse-pointer mobile viewports + UA. Cookie helpers read/write `meridian_device_pref` via `document.cookie`. A deep-link helper fires `servicedesk://` and falls back to the correct store after a visibility timeout. A `MobileLauncherModal` client component is mounted inside both the dashboard and portal layouts and auto-shows when conditions match. A "Switch to mobile app" menu item in the user dropdown clears the cookie and reloads.

**Tech Stack:** Next.js 16 App Router (client components), React 19, TypeScript, inline styles (matching existing layouts), `@mdi/react` + `@mdi/js` icons, Playwright for E2E.

---

## File Structure

**Create:**
- `apps/web/src/lib/device-preference.ts` — cookie helpers (`getDevicePreference`, `setDevicePreference`, `clearDevicePreference`).
- `apps/web/src/lib/deep-link.ts` — `openMobileApp()` + store URL constants.
- `apps/web/src/hooks/use-is-mobile.ts` — `useIsMobile()` hook returning `boolean | null`.
- `apps/web/src/components/MobileLauncherModal.tsx` — modal component.
- `apps/web/tests/mobile-launcher.spec.ts` — Playwright E2E test.

**Modify:**
- `apps/web/src/app/dashboard/layout.tsx` — mount `<MobileLauncherModal />`, add "Switch to mobile app" user-menu item.
- `apps/web/src/app/portal/layout.tsx` — same.

---

## Task 1: Device Preference Cookie Helpers

**Files:**
- Create: `apps/web/src/lib/device-preference.ts`

- [ ] **Step 1: Write the module**

```typescript
// apps/web/src/lib/device-preference.ts

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
```

- [ ] **Step 2: Typecheck**

Run from repo root: `pnpm --filter web exec tsc --noEmit`
Expected: no errors (file is self-contained).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/device-preference.ts
git commit -m "feat(web): add device preference cookie helpers"
```

---

## Task 2: Deep-Link Helper

**Files:**
- Create: `apps/web/src/lib/deep-link.ts`

- [ ] **Step 1: Write the module**

```typescript
// apps/web/src/lib/deep-link.ts

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
  now?: () => number;
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/deep-link.ts
git commit -m "feat(web): add mobile app deep-link helper with store fallback"
```

---

## Task 3: `useIsMobile` Hook

**Files:**
- Create: `apps/web/src/hooks/use-is-mobile.ts`

- [ ] **Step 1: Write the hook**

```typescript
// apps/web/src/hooks/use-is-mobile.ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true if the current device looks like a phone:
 *   - viewport <= 768px wide
 *   - coarse pointer (touch, not mouse)
 *   - UA matches iOS or Android
 *
 * Returns null until after hydration (so server rendering is not
 * assumed to know).
 */
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px) and (pointer: coarse)');
    const uaIsMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const update = () => setIsMobile(mq.matches && uaIsMobile);
    update();

    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-is-mobile.ts
git commit -m "feat(web): add useIsMobile hook"
```

---

## Task 4: MobileLauncherModal Component

**Files:**
- Create: `apps/web/src/components/MobileLauncherModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/MobileLauncherModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-is-mobile';
import {
  getDevicePreference,
  setDevicePreference,
} from '@/lib/device-preference';
import { openMobileApp } from '@/lib/deep-link';

/**
 * On mobile devices, shows a one-time modal asking whether the user
 * wants to open the native app or continue in the browser. The choice
 * is persisted in the `meridian_device_pref` cookie for 1 year.
 *
 * Safe to mount on any authenticated layout — it self-gates on
 * device + cookie.
 */
export default function MobileLauncherModal() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isMobile !== true) return;
    if (getDevicePreference() !== null) return;
    setOpen(true);
  }, [isMobile]);

  if (!open) return null;

  const handleMobileApp = () => {
    setDevicePreference('mobile-app');
    setOpen(false);
    openMobileApp();
  };

  const handleDesktop = () => {
    setDevicePreference('desktop');
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-launcher-title"
      data-testid="mobile-launcher-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: 360,
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h2
          id="mobile-launcher-title"
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          Better on mobile?
        </h2>
        <p
          style={{
            margin: '8px 0 20px',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}
        >
          Meridian has a mobile app built for your phone. Would you like to
          open it?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={handleMobileApp}
            data-testid="mobile-launcher-open-app"
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: 'var(--accent-brand, #0284c7)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Open Mobile App
          </button>
          <button
            type="button"
            onClick={handleDesktop}
            data-testid="mobile-launcher-use-desktop"
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid var(--border-primary)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Continue in Browser
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/MobileLauncherModal.tsx
git commit -m "feat(web): add MobileLauncherModal component"
```

---

## Task 5: Mount Modal and Add Reset Link in Dashboard Layout

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, after the existing `@mdi/js` import block (around line 28), add:

```tsx
import MobileLauncherModal from '@/components/MobileLauncherModal';
import { clearDevicePreference } from '@/lib/device-preference';
import { mdiCellphone } from '@mdi/js';
```

And add `mdiCellphone` — if you prefer fewer imports, append it inside the existing `@mdi/js` import block instead.

- [ ] **Step 2: Mount the modal inside `DashboardInner`**

Inside `DashboardInner`'s returned JSX, just before the closing `</div>` of the outermost container (i.e., immediately after the `<style>` block at line 394 and before `</div>` at line 395), add:

```tsx
<MobileLauncherModal />
```

- [ ] **Step 3: Add "Switch to mobile app" user-menu item**

Inside the user menu dropdown (the `<div>` at lines 317-377), insert a new menu item between the `Security & MFA` Link and the `Sign out` button. It should look like:

```tsx
<button
  type="button"
  onClick={() => {
    setUserMenuOpen(false);
    clearDevicePreference();
    window.location.reload();
  }}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--bg-tertiary)',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 14,
    color: 'var(--text-secondary)',
  }}
  data-testid="user-menu-switch-to-mobile"
>
  <Icon path={mdiCellphone} size={0.8} color="var(--text-muted)" />
  Switch to mobile app
</button>
```

- [ ] **Step 4: Typecheck and manual-sanity**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): mount mobile launcher modal in dashboard layout"
```

---

## Task 6: Mount Modal and Add Reset Link in Portal Layout

**Files:**
- Modify: `apps/web/src/app/portal/layout.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, after the existing `@mdi/js` import block (around line 21), add:

```tsx
import MobileLauncherModal from '@/components/MobileLauncherModal';
import { clearDevicePreference } from '@/lib/device-preference';
import { mdiCellphone } from '@mdi/js';
```

- [ ] **Step 2: Mount the modal**

Inside `PortalLayout`'s returned JSX, just before the closing `</div>` of the outermost container (i.e., immediately after the `<style>` block at line 365, before `</div>` at line 366), add:

```tsx
<MobileLauncherModal />
```

- [ ] **Step 3: Add "Switch to mobile app" user-menu item**

Inside the user profile dropdown (the `<div>` at lines 304-342), insert a new menu item between `<ThemeToggle />` and the `Sign out` button:

```tsx
<button
  type="button"
  onClick={() => {
    setUserMenuOpen(false);
    clearDevicePreference();
    window.location.reload();
  }}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--bg-tertiary)',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 14,
    color: 'var(--text-secondary)',
  }}
  data-testid="user-menu-switch-to-mobile"
>
  <Icon path={mdiCellphone} size={0.8} color="var(--text-muted)" />
  Switch to mobile app
</button>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/portal/layout.tsx
git commit -m "feat(web): mount mobile launcher modal in portal layout"
```

---

## Task 7: Playwright E2E Test

**Files:**
- Create: `apps/web/tests/mobile-launcher.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/web/tests/mobile-launcher.spec.ts
import { test, expect } from '@playwright/test';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

test.describe('Mobile launcher modal', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: MOBILE_UA,
    hasTouch: true,
    isMobile: true,
    storageState: 'tests/.auth/admin.json',
  });

  test('shows on first mobile visit, persists choice, hides on reload', async ({
    page,
    context,
  }) => {
    // Ensure no existing preference cookie
    await context.clearCookies({ name: 'meridian_device_pref' });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    const modal = page.getByTestId('mobile-launcher-modal');
    await expect(modal).toBeVisible();

    // Pick desktop
    await page.getByTestId('mobile-launcher-use-desktop').click();
    await expect(modal).toBeHidden();

    // Cookie should be set
    const cookies = await context.cookies();
    const pref = cookies.find((c) => c.name === 'meridian_device_pref');
    expect(pref?.value).toBe('desktop');

    // Reload — modal should NOT reappear
    await page.reload({ waitUntil: 'networkidle' });
    await expect(modal).toBeHidden();
  });

  test('does not show when cookie is already set', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'meridian_device_pref',
        value: 'desktop',
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('mobile-launcher-modal')).toBeHidden();
  });
});

test.describe('Mobile launcher modal — desktop viewport', () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    storageState: 'tests/.auth/admin.json',
  });

  test('does not show on desktop', async ({ page, context }) => {
    await context.clearCookies({ name: 'meridian_device_pref' });
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('mobile-launcher-modal')).toBeHidden();
  });
});
```

- [ ] **Step 2: Run the test**

Start the dev server first in another terminal (`pnpm --filter web dev`) if it is not already running, then:

```bash
pnpm --filter web test:e2e tests/mobile-launcher.spec.ts
```

Expected: 3 passing tests.

If the "mobile" tests fail with the modal not visible, verify:
- The `meridian_device_pref` cookie is actually cleared before navigation.
- The user-agent string is reaching the client (`navigator.userAgent`) — it should via Playwright's `userAgent` option.
- `matchMedia('(max-width: 768px) and (pointer: coarse)')` is `true` — Playwright's `isMobile: true + hasTouch: true` sets `pointer: coarse`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/mobile-launcher.spec.ts
git commit -m "test(web): add e2e tests for mobile launcher modal"
```

---

## Task 8: Manual Verification

- [ ] **Step 1: Start dev server**

```bash
pnpm --filter web dev
```

- [ ] **Step 2: Open Chrome DevTools device toolbar**

- Navigate to `http://localhost:3000/login`, log in as `admin@msp.local` / `Admin123!`.
- In DevTools, click the device toolbar icon, pick "iPhone 14" (or any mobile preset).
- Clear cookies for localhost (DevTools → Application → Cookies → delete `meridian_device_pref`).
- Reload. The modal should appear.

- [ ] **Step 3: Verify both buttons**

- Click **"Continue in Browser"**. Modal closes. Reload → modal does not reappear. Inspect cookies → `meridian_device_pref=desktop`.
- Open user menu → click **"Switch to mobile app"**. Page reloads. Modal reappears.
- Click **"Open Mobile App"**. Browser will attempt `servicedesk://` (likely blocked / "cannot open" dialog in DevTools — this is expected, the deep-link target app is not installed). After ~1.5s the page should navigate to the App Store URL.

- [ ] **Step 4: Verify desktop behavior**

- Turn off the device toolbar (desktop viewport).
- Clear the `meridian_device_pref` cookie.
- Reload → modal does NOT appear.

- [ ] **Step 5: Verify portal layout**

- Log out, log in as `user@customer.local` / `User123!` (redirects to `/portal`).
- Repeat the mobile + cookie clear steps. Modal should appear on `/portal`.

No commit needed — this is verification only.

---

## Summary of Changes

- 4 new files under `apps/web/src/` + 1 new test file.
- 2 layout files modified (dashboard, portal).
- 0 DB/schema changes. 0 API endpoints. 0 tenant-scoping concerns.
- Pure client-side feature gated by cookie + media query + UA.
