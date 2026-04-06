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
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Clear only the device pref cookie (not the auth session)
    await page.evaluate(() => {
      document.cookie = 'meridian_device_pref=; Path=/; Max-Age=0; SameSite=Lax';
    });
    await page.reload({ waitUntil: 'networkidle' });

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
        domain: '10.1.200.218',
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
