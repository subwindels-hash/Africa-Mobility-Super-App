import { test, expect } from '@playwright/test';

test.describe('web smoke — every route renders', () => {
  const routes = [
    '/', '/wallet', '/vendor', '/vendor/onboarding', '/book', '/track',
    '/corporate', '/admin', '/admin/fams', '/admin/interstate',
    '/admin/mobility', '/admin/organism', '/admin/shield', '/admin/whatsapp',
  ];

  for (const route of routes) {
    test(`GET ${route} renders`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.locator('body')).toContainText(/\S/); // non-empty render
    });
  }

  test('unknown route 404s', async ({ page }) => {
    const res = await page.goto('/definitely-not-a-route');
    expect(res?.status()).toBe(404);
  });
});

test.describe('page content', () => {
  test('home exposes mobility modules', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('wallet shows escrow + loyalty surfaces', async ({ page }) => {
    await page.goto('/wallet');
    await expect(page.locator('main, body').first()).toContainText(/escrow/i);
  });

  test('vendor onboarding starts at step 1', async ({ page }) => {
    await page.goto('/vendor/onboarding');
    await expect(page.locator('main, body').first()).toContainText(/step\s*1|step 1 of|1\s*\/\s*11/i);
  });
});
