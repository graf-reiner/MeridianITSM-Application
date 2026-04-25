import { test } from '@playwright/test';

test('Check KB articles via API', async ({ page }) => {
  await page.goto('/dashboard');

  const response = await page.request.get('/api/v1/knowledge');
  console.log(`API Status: ${response.status()}`);

  if (response.ok()) {
    const data = await response.json();
    console.log(`Full response: ${JSON.stringify(data).substring(0, 500)}`);
    const articles = data.data || data.articles || [];
    const total = data.total || articles.length;
    console.log(`Total articles: ${articles.length}, total field: ${total}`);
    console.log(`Response keys: ${Object.keys(data).join(', ')}`);
    if (articles.length > 0) {
      articles.slice(0, 3).forEach((article: any) => {
        console.log(`  - ${article.title} (${article.status})`);
      });
    }
  } else {
    const error = await response.text();
    console.log(`Error: ${error}`);
  }
});
