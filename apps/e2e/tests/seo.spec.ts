import { expect, test } from './fixtures';

/** What search engines and AI crawlers get without running any script. */
test.describe('SEO', () => {
  test.skip(({ isMobile }) => isMobile, 'the HTML is the same on phones');

  test('the home page HTML already holds the text, the prices and the structured data, in both languages', async ({ request }) => {
    for (const [path, h1, lang] of [['/', "qulay dastur", 'uz'], ['/ru', 'Удобная программа', 'ru']] as const) {
      const html = await (await request.get(path)).text();
      expect(html).toContain(h1);
      expect(html, 'prices rendered on the server').toMatch(/149[\s ]000/);
      expect(html).toMatch(new RegExp(`<link rel="canonical" href="https://myserviceuz\\.uz${path === '/' ? '/?' : '/ru'}"`));
      expect(html).toContain('hrefLang="ru"');
      expect(html).toContain('og:image');
      const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!);
      const types = ld['@graph'].map((n: { '@type': string }) => n['@type']);
      expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']));
      const app = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'SoftwareApplication');
      expect(app.offers.priceCurrency).toBe('UZS');
      const faq = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage');
      expect(faq.inLanguage).toBe(lang);
      expect(faq.mainEntity.length).toBeGreaterThan(3);
    }
    expect(await (await request.get('/ru')).text()).toContain('Частые вопросы');
  });

  test('sitemap, robots, llms.txt and the share picture are served', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://myserviceuz.uz/ru</loc>');
    expect(sitemap).toContain('hreflang="ru"');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap: https://myserviceuz.uz/sitemap.xml');
    expect(robots).toMatch(/Allow: \/ru\$/);
    const llms = await request.get('/llms.txt');
    expect(llms.headers()['content-type']).toContain('text/plain');
    const text = await llms.text();
    expect(text).toContain('# MyService');
    expect(text).toMatch(/Pro: 149 000 so'm\/oy/);
    expect(text).toContain('Частые вопросы');
    const og = await request.get('/opengraph-image');
    expect(og.headers()['content-type']).toBe('image/png');
  });

  test('the Russian home page switches back to Uzbek, and the app stays Russian after /ru', async ({ page }) => {
    await page.goto('/ru');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Удобная программа');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await page.goto('/login');
    await expect(page.getByLabel('Логин или номер телефона')).toBeVisible();
    await page.goto('/ru');
    await expect(async () => {
      await page.getByRole('button', { name: 'UZ' }).first().click();
      await expect(page).toHaveURL(/\/$/, { timeout: 2000 });
    }).toPass();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('qulay dastur');
  });
});
