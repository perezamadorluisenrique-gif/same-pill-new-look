// Live smoke test: opens the deployed app in Chromium and uses the real NLM and
// FDA APIs. Runs daily on GitHub Actions so a broken API or deploy is noticed.
// Usage: node test/smoke.mjs [url]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const URL_ = process.argv[2] || 'https://perezamadorluisenrique-gif.github.io/same-pill-new-look/';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const step = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { console.log(`not ok - ${name}\n  ${e.message}`); process.exitCode = 1; }
};

await page.goto(URL_ + (URL_.includes('?') ? '&' : '?') + 'smoke=' + Date.now());

await step('looks up a real NDC in RxNav', async () => {
  await page.getByRole('button', { name: 'Add my first medicine' }).click();
  await page.getByRole('tab', { name: 'By NDC' }).click();
  await page.locator('#ndc-input').fill('0378-5209-05');
  await page.getByRole('button', { name: 'Look it up' }).click();
  await page.locator('[data-action="save-pending"]').waitFor({ timeout: 30000 });
  const text = await page.locator('#lookup-out').textContent();
  assert.match(text, /amlodipine 5 MG Oral Tablet/);
  assert.match(text, /Mylan/);
  await page.locator('.recall-slot .recall').waitFor({ timeout: 30000 });
});

await step('compares a real refill', async () => {
  await page.locator('[data-action="save-pending"]').click();
  await page.getByRole('button', { name: 'Check a refill' }).click();
  await page.locator('#ndc-input').fill('31722-238-10');
  await page.getByRole('button', { name: 'Compare with my medicines' }).click();
  await page.locator('.verdict.v-new-look').waitFor({ timeout: 30000 });
});

await step('searches by name and loads every look', async () => {
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-go="looksSearch"]').click();
  await page.locator('#name-input').fill('amlodipine');
  await page.locator('form[data-form="name"] [type=submit]').click();
  await page.locator('#name-filter').fill('5 MG Oral Tablet');
  await page.locator('.option').filter({ has: page.locator('span', { hasText: /^amlodipine 5 MG Oral Tablet$/ }) }).first().click();
  await page.locator('.looks-grid').waitFor({ timeout: 60000 });
  const n = await page.locator('.look-card').count();
  assert.ok(n >= 10, `only ${n} looks`);
  console.log(`  amlodipine 5 mg: ${await page.locator('.looks-summary').textContent()}`);
});

await browser.close();
if (errors.length) { console.log('Page errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
