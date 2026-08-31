import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.goto('/');
});

test('ana React bölümleri gerçek rotalara gider', async ({ page }) => {
  for (const [label, path, heading] of [
    ['Kitaplığım', '/library', 'Kitaplığım'],
    ['Kitap ekle', '/add', 'Kitap ekle'],
    ['İstatistikler', '/stats', 'İstatistikler'],
    ['Alıntılar', '/quotes', 'Alıntılarım'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});
