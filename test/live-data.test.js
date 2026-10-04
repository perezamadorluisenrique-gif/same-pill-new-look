// Tests against real NLM RxNav and openFDA responses recorded by scripts/record-fixtures.mjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const I = require('../i18n.js');
const { fixtureFetch } = require('./fixture-fetch.js');

test('looks up real products and names them', async () => {
  const p = await C.lookupNdc('0378-5209-05', fixtureFetch);
  assert.equal(p.labeler, 'Mylan Pharmaceuticals Inc.');
  assert.deepEqual(p.colors, ['blue']);
  assert.equal(p.clinicalName, 'amlodipine 5 MG Oral Tablet');
});

test('a Pfizer (Norvasc) product maps to the generic clinical drug', async () => {
  const p = await C.lookupNdc('00069153041', fixtureFetch);
  assert.match(p.labeler, /Pfizer/);
  assert.equal(p.clinicalRxcui, '197361');
});

test('brand and generic compare as the same medicine', async () => {
  const brand = await C.lookupNdc('00069153041', fixtureFetch);
  const generic = await C.lookupNdc('31722-238-10', fixtureFetch);
  const r = C.compareProducts(brand, generic);
  assert.notEqual(r.verdict, 'different-medicine');
  assert.ok(r.makerChanged);
});

test('searches by generic name, single ingredients first', async () => {
  const r = await C.searchDrugs('amlodipine', fixtureFetch);
  assert.ok(r.options.length > 50);
  assert.ok(!r.options[0].name.includes(' / '));
  assert.ok(r.options.some((o) => o.name === 'amlodipine 5 MG Oral Tablet'));
  assert.ok(r.options.some((o) => o.brand === 'Norvasc'));
});

test('searches by brand name', async () => {
  const r = await C.searchDrugs('norvasc', fixtureFetch);
  assert.ok(r.options.every((o) => o.brand === 'Norvasc'));
});

test('suggests a spelling when nothing matches', async () => {
  const r = await C.searchDrugs('amlodipin', fixtureFetch);
  assert.equal(r.options.length, 0);
  assert.deepEqual(r.suggestions, ['amlodipine']);
});

test('finds every listed look of amlodipine 5 mg, brand included', async () => {
  const L = await C.getLooks('197361', fixtureFetch);
  assert.equal(L.name, 'amlodipine 5 MG Oral Tablet');
  assert.ok(L.groups.length >= 20, `only ${L.groups.length} looks`);
  assert.ok(L.makers >= 40);
  assert.ok(L.groups.some((g) => g.brand === 'Norvasc'));
  // Groups are sorted by how many labelers share the look.
  for (let i = 1; i < L.groups.length; i++) assert.ok(L.groups[i - 1].labelers.length >= L.groups[i].labelers.length);
  // Every group draws.
  for (const g of L.groups) assert.match(C.pillSvg(g.product), /^<svg/);
});

test('looks work for capsules and many strengths', async () => {
  for (const rx of ['198051', '966221', '861007', '617310', '314076']) {
    const L = await C.getLooks(rx, fixtureFetch);
    assert.ok(L.groups.length > 3, `${rx}: ${L.groups.length}`);
  }
  const ome = await C.getLooks('198051', fixtureFetch);
  assert.ok(ome.groups.some((g) => g.product.shape === 'capsule'));
});

test('finds an ongoing recall for the exact product code only', async () => {
  const levo = await C.lookupNdc('00378180304', fixtureFetch);
  const r = await C.checkRecalls(levo, fixtureFetch);
  assert.equal(r.ongoing.length, 1);
  assert.equal(r.ongoing[0].number, 'D-0124-2025');
  assert.match(r.ongoing[0].reason, /potent/i);
});

test('no recall listed returns empty lists', async () => {
  const p = await C.lookupNdc('0378-5209-05', fixtureFetch);
  assert.deepEqual(await C.checkRecalls(p, fixtureFetch), { ongoing: [], past: [] });
});

test('recalls recorded from the live feed match their own products', async () => {
  const lido = await C.checkRecalls({ ndc9: '51672-3008', ndc10: '51672-3008-5' }, fixtureFetch);
  assert.deepEqual(lido.ongoing.map((r) => r.number), ['D-0848-2026']);
  const chlor = await C.checkRecalls({ ndc9: '64980-599', ndc10: '64980-599-01' }, fixtureFetch);
  assert.deepEqual(chlor.ongoing.map((r) => r.number).sort(), ['D-0610-2026', 'D-0852-2026']);
});

test('a recall for a sibling strength on the same label does not count', async () => {
  // openFDA tags D-0866-2026 with 69680-165, but the recalled product is 69680-166.
  const r = await C.checkRecalls({ ndc9: '69680-165', ndc10: '69680-165-00' }, fixtureFetch);
  assert.deepEqual(r, { ongoing: [], past: [] });
});

test('Spanish text agrees in gender', async () => {
  const es = I.makeT('es');
  const a = await C.lookupNdc('0378-5209-05', fixtureFetch);
  const b = await C.lookupNdc('31722-238-10', fixtureFetch);
  assert.equal(C.describeLook(a, es), 'azul, redonda, con la marca “M / A9”');
  const r = C.compareProducts(a, b);
  assert.equal(C.whatChanged(r.changes, es), 'cambian el color y el tamaño de la pastilla');
  assert.match(C.pharmacistNote(a, b, r, 'mamá', es), /recogí un resurtido para mamá/);
});
