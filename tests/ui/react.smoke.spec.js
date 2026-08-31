import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.goto('/?view=library');
});

test('React kitaplık ekranı ve sayfa rotaları çalışır', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Kitap Kütüphanem' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Kitap ekle' })).toBeVisible();
  await page.getByRole('button', { name: '+ Kitap ekle' }).click();
  await expect(page).toHaveURL(/\/add$/);
  await expect(page.getByRole('heading', { name: 'Kitap ekle' })).toBeVisible();
  await page.getByLabel('Başlık').fill('Smoke Test Kitabı');
  await page.getByRole('button', { name: 'Kitabı kaydet' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.locator('.book-tile-main').filter({ hasText: 'Smoke Test Kitabı' }),
  ).toBeVisible();
});

test('mobil React gezinmesi yatay olarak kullanılabilir', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole('navigation', { name: 'React uygulama gezinme' });
  await expect(nav).toBeVisible();
  await page.getByRole('button', { name: 'Profilim' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profilim' })).toBeVisible();
});

test('koyu ve açık tema tercihi korunur', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Koyu mod' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Açık mod' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
