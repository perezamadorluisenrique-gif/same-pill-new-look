// End-to-end test: drives the real page in Chromium with every NLM and FDA
// request answered from test/fixtures/recorded.json. Saves screenshots to
// test/screenshots/. Run with `npm run e2e`.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = join(ROOT, 'test/screenshots');
mkdirSync(SHOTS, { recursive: true });
const { responses } = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/recorded.json'), 'utf8'));
const norm = (url) => { const u = new URL(url); u.searchParams.delete('limit'); return decodeURIComponent(u.toString()); };
const recorded = new Map(Object.entries(responses).map(([u, r]) => [norm(u), r]));

// Static server for the app.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const missing = [];
const axeSource = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: opts.locale || 'en-US', colorScheme: opts.scheme || 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.route(/https:\/\/(rxnav\.nlm\.nih\.gov|api\.fda\.gov)\//, async (route) => {
    const r = recorded.get(norm(route.request().url()));
    if (!r && route.request().url().startsWith('https://api.fda.gov/')) {
      // Not recorded: answer like openFDA does when nothing matches.
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":{"code":"NOT_FOUND"}}' });
    }
    if (!r && route.request().url().includes('/ndcproperties.json')) {
      // Not recorded: answer like RxNav does for an id it doesn't know.
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    }
    if (!r) { missing.push(route.request().url()); return route.fulfill({ status: 500, body: '{}' }); }
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.body) });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return page;
}

async function shot(page, name) {
  await page.evaluate(() => { const el = document.getElementById('toast'); if (el) el.hidden = true; });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  await page.screenshot({ path: join(SHOTS, `${name}-top.png`) });
}
async function noOverflow(page, where) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 390, `${where}: page is ${w}px wide`);
}
async function axe(page, where) {
  await page.addScriptTag({ content: axeSource });
  const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
  assert.deepEqual(r, [], `${where}: accessibility violations`);
}
const step = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { console.log(`not ok - ${name}\n  ${e.message.split('\n').join('\n  ')}`); process.exitCode = 1; }
};

const page = await newPage();
await page.goto(BASE);

await step('home explains the app and passes accessibility checks', async () => {
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.match(await page.locator('h1').textContent(), /refill might look different/);
  await noOverflow(page, 'home');
  await axe(page, 'home');
  await shot(page, '01-home');
});

await step('adds a medicine by name through its looks', async () => {
  await page.getByRole('button', { name: 'Add my first medicine' }).click();
  await page.locator('#name-input').fill('amlodipine');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.locator('#name-filter').fill('5 MG Oral Tablet');
  await page.locator('.option').filter({ has: page.locator('span', { hasText: /^amlodipine 5 MG Oral Tablet$/ }) }).first().click();
  await page.locator('.looks-grid').waitFor();
  const n = await page.locator('.look-card').count();
  assert.ok(n >= 20, `only ${n} looks`);
  await shot(page, '02-pick-look');
  // The Mylan blue round "M A9" look.
  await page.locator('button.look-card', { hasText: 'M / A9' }).first().click();
  const makers = page.locator('[data-action="pick-maker"]');
  if (await makers.count()) await makers.filter({ hasText: 'Mylan' }).first().click();
  await page.locator('[data-action="save-pending"]').waitFor();
  await shot(page, '03-preview');
  await page.locator('[data-action="save-pending"]').click();
  await page.locator('.med').first().waitFor();
  assert.match(await page.locator('.med-name').first().textContent(), /amlodipine 5 MG Oral Tablet/);
});

await step('checks a refill from a new maker by its barcode number', async () => {
  await page.getByRole('button', { name: 'Check a refill' }).click();
  await page.locator('#ndc-input').fill('331722238104'); // UPC-A on a Camber bottle
  await page.getByRole('button', { name: 'Compare with my medicines' }).click();
  await page.locator('.verdict.v-new-look').waitFor();
  assert.match(await page.locator('.verdict h1').textContent(), /will look different/);
  assert.match(await page.locator('.verdict p').textContent(), /color and size are different/);
  await page.locator('.recall.ok').waitFor();
  await noOverflow(page, 'result');
  await axe(page, 'result');
  await shot(page, '04-result');
});

await step('confirming the refill updates the chart and keeps the old look', async () => {
  await page.getByRole('button', { name: /pharmacist confirmed/ }).click();
  await page.locator('.med').first().click();
  await page.locator('.timeline').waitFor();
  assert.equal(await page.locator('.timeline li').count(), 2);
  await shot(page, '05-details');
});

await step('flags an ongoing FDA recall when adding a recalled product', async () => {
  await page.locator('[data-go="home"]').first().click();
  await page.getByRole('button', { name: 'Add a medicine' }).click();
  await page.getByRole('tab', { name: 'By NDC' }).click();
  await page.locator('#ndc-input').fill('0378-1803-04');
  await page.getByRole('button', { name: 'Look it up' }).click();
  await page.locator('.recall.bad').waitFor();
  assert.match(await page.locator('.recall.bad').textContent(), /D-0124-2025/);
  await shot(page, '06-recall');
});

await step('switches to Spanish', async () => {
  await page.locator('#lang-btn').click();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'es');
  assert.match(await page.locator('h1').textContent(), /Agregar un medicamento/);
});

await step('pharmacy link and QR sticker open the comparison', async () => {
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-go="pharmacy"]').click();
  await page.locator('#ph-from').fill('0378-5209-05');
  await page.locator('#ph-to').fill('31722-238-10');
  await page.locator('#ph-note').fill('Mismo medicamento, otro fabricante.');
  await page.locator('form[data-form="pharm"] [type=submit]').click();
  await page.locator('.sticker .qr').waitFor();
  await shot(page, '07-pharmacy');
  const url = await page.locator('#share-url').inputValue();
  assert.match(url, /\?from=0378-5209-05&to=31722-238-10&note=/);
  const p2 = await newPage({ locale: 'es-MX' });
  await p2.goto(url.replace(/^https?:\/\/[^/]+\/(.*?)\?/, `${BASE}?`));
  await p2.locator('.verdict.v-new-look').waitFor();
  assert.match(await p2.locator('.shared').textContent(), /Mismo medicamento/);
  assert.match(await p2.locator('.verdict h1').textContent(), /se verá distinto/);
  await noOverflow(p2, 'shared');
  await axe(p2, 'shared');
  await shot(p2, '08-shared-es');
  await p2.context().close();
});

await step('every look gallery from the menu', async () => {
  await page.locator('#lang-btn').click();
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-go="looksSearch"]').click();
  await page.locator('#name-input').fill('levothyroxine');
  await page.locator('form[data-form="name"] [type=submit]').click();
  await page.locator('#name-filter').fill('0.05 MG Oral Tablet');
  await page.locator('.option').filter({ has: page.locator('span', { hasText: /^levothyroxine sodium 0\.05 MG Oral Tablet$/ }) }).first().click();
  await page.locator('.looks-grid').waitFor();
  assert.ok(await page.locator('.look-card').count() >= 5);
  assert.equal(await page.locator('button.look-card').count(), 0, 'browse mode should not offer picking');
  await shot(page, '09-looks');
});

await step('settings: large text, backup and erase', async () => {
  await page.locator('#menu-btn').click();
  await page.locator('#menu [data-go="settings"]').click();
  await page.getByRole('button', { name: 'Large' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.text), 'large');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a backup file' }).click()]);
  const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
  assert.equal(backup.app, 'same-pill-new-look');
  assert.equal(backup.meds.length, 1);
  await page.getByRole('button', { name: 'Delete everything on this device' }).click();
  await page.getByRole('button', { name: 'Yes, remove it' }).click();
  await page.getByRole('button', { name: 'Add my first medicine' }).waitFor();
});

await step('example mode works end to end in dark mode', async () => {
  const p3 = await newPage({ scheme: 'dark' });
  await p3.goto(BASE);
  await p3.getByRole('button', { name: 'Try an example' }).click();
  await p3.locator('.med').nth(2).waitFor();
  await p3.locator('.badge.alert').waitFor(); // levothyroxine has an ongoing recall
  await shot(p3, '10-example-home-dark');
  await p3.getByRole('button', { name: 'Check a refill' }).click();
  await p3.locator('[data-fill]').click();
  await p3.locator('.verdict.v-new-look').waitFor();
  await axe(p3, 'result dark');
  await shot(p3, '11-result-dark');
  await p3.context().close();
});

await browser.close();
server.close();
if (missing.length) { console.log('Unrecorded requests:\n  ' + [...new Set(missing)].join('\n  ')); process.exitCode = 1; }
if (errors.length) { console.log('Page errors:\n  ' + errors.join('\n  ')); process.exitCode = 1; }
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
