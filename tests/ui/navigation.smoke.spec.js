import { expect, test } from '@playwright/test';

async function openLocalApp(page) {
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#auth-guest').click();
  await expect(page.locator('#app')).toBeVisible();
}

test('local mode can navigate through the main sections', async ({ page }) => {
  await openLocalApp(page);

  const sections = ['#library-controls', '#book-form', '#dashboard-stats', '#quotes-section'];
  for (const [index, [, path]] of [
    [/kitaplığım/i, '/library', '#library-section'],
    [/kitap ekle/i, '/add', '#add-section'],
    [/istatistik/i, '/stats', '#stats-section'],
    [/alıntılarım/i, '/quotes', '#quotes-section'],
  ].entries()) {
    const pageName = ['library', 'add', 'stats', 'quotes'][index];
    await page.locator(`[data-page="${pageName}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator(sections[index])).toBeVisible();
  }
});

test('notification panel opens and closes accessibly', async ({ page }) => {
  await openLocalApp(page);
  const toggle = page.locator('#notifications-toggle');
  const panel = page.locator('#notifications-panel');

  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});
