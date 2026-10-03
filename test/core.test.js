const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const { exampleFetch, EXAMPLE_NDCS } = require('../examples.js');

test('parses hyphenated NDCs to 11 digits', () => {
  assert.deepEqual(C.parseNdcInput('0378-5209-05').ids, ['00378520905']);
  assert.deepEqual(C.parseNdcInput('31722-238-10').ids, ['31722023810']);
  assert.deepEqual(C.parseNdcInput('12345-6789-1').ids, ['12345678901']);
});

test('offers all three readings of a bare 10-digit NDC', () => {
  assert.deepEqual(C.parseNdcInput('3172223810').ids, ['03172223810', '31722023810', '31722238100']);
});

test('reads NDCs out of UPC-A, EAN-13, GTIN-14 and GS1 DataMatrix', () => {
  assert.ok(C.parseNdcInput('331722238104').ids.includes('31722023810')); // UPC-A
  assert.ok(C.parseNdcInput('0331722238104').ids.includes('31722023810')); // EAN-13
  assert.ok(C.parseNdcInput('00331722238104').ids.includes('31722023810')); // GTIN-14
  assert.ok(C.parseNdcInput('0100331722238104172801311012345').ids.includes('31722023810')); // GS1
  assert.ok(C.parseNdcInput('(01)00331722238104(17)280131').ids.includes('31722023810'));
});

test('rejects things that are not NDCs', () => {
  assert.equal(C.parseNdcInput(''), null);
  assert.equal(C.parseNdcInput('hello'), null);
  assert.equal(C.parseNdcInput('12345'), null);
  assert.equal(C.parseNdcInput('9780306406157'), null); // a book ISBN
});

test('looks up a product and its name', async () => {
  const p = await C.lookupNdc(EXAMPLE_NDCS.savedAmlodipine, exampleFetch);
  assert.equal(p.labeler, 'Mylan Pharmaceuticals Inc.');
  assert.deepEqual(p.colors, ['blue']);
  assert.equal(p.shape, 'round');
  assert.equal(p.imprint, 'M;A9');
  assert.equal(p.clinicalName, 'amlodipine 5 MG Oral Tablet');
});

test('finds a product from a bare 10-digit NDC', async () => {
  const p = await C.lookupNdc('3172223810', exampleFetch);
  assert.equal(p.ndc11, '31722023810');
});

test('a 10-digit NDC that matches two products asks which one', async () => {
  const fetchTwo = async (url) => {
    const id = new URL(url).searchParams.get('id');
    if (url.includes('ndcproperties') && (id === '03172223810' || id === '31722023810')) {
      return exampleFetch(url.replace(/id=\d+/, 'id=' + (id === '31722023810' ? '31722023810' : '00378520905')));
    }
    return exampleFetch(url);
  };
  const p = await C.lookupNdc('3172223810', fetchTwo);
  assert.equal(p.alternatives.length, 2);
});

test('unknown NDCs raise a clear error', async () => {
  await assert.rejects(C.lookupNdc('11111-1111-11', exampleFetch), C.NotFoundError);
});

test('flags a refill from a new maker that looks different', async () => {
  const a = await C.lookupNdc(EXAMPLE_NDCS.savedAmlodipine, exampleFetch);
  const b = await C.lookupNdc(EXAMPLE_NDCS.refillAmlodipine, exampleFetch);
  const r = C.compareProducts(a, b);
  assert.equal(r.verdict, 'new-look');
  assert.ok(r.makerChanged);
  assert.deepEqual(r.changes.map((c) => c.field), ['color', 'imprint', 'size']);
});

test('flags a different medicine', async () => {
  const a = await C.lookupNdc(EXAMPLE_NDCS.savedAmlodipine, exampleFetch);
  const b = await C.lookupNdc(EXAMPLE_NDCS.savedFurosemide, exampleFetch);
  assert.equal(C.compareProducts(a, b).verdict, 'different-medicine');
});

test('same product code is the same product', async () => {
  const a = await C.lookupNdc(EXAMPLE_NDCS.savedAmlodipine, exampleFetch);
  assert.equal(C.compareProducts(a, { ...a }).verdict, 'same-product');
});

test('new maker with the same look is called out separately', () => {
  const base = { colors: ['white'], shape: 'round', imprint: 'A;1', size: '8 mm', score: '1', clinicalRxcui: '1' };
  const r = C.compareProducts({ ...base, labeler: 'X', ndc9: '1-1' }, { ...base, labeler: 'Y', ndc9: '2-2', imprint: 'a 1' });
  assert.equal(r.verdict, 'new-maker-same-look');
});

test('draws an svg pill for every shape', () => {
  for (const shape of Object.values(C.SHAPE_CODES)) {
    const svg = C.pillSvg({ colors: ['blue', 'white'], shape, imprint: 'M;A9', score: '2', size: '8 mm' });
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  }
});

test('pharmacist note names both makers', async () => {
  const a = await C.lookupNdc(EXAMPLE_NDCS.savedAmlodipine, exampleFetch);
  const b = await C.lookupNdc(EXAMPLE_NDCS.refillAmlodipine, exampleFetch);
  const note = C.pharmacistNote(a, b, C.compareProducts(a, b), 'Mom');
  assert.match(note, /Mylan/);
  assert.match(note, /Camber/);
  assert.match(note, /for Mom/);
});
