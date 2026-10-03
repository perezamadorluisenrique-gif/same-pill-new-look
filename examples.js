/*
 * Example records for the demo, copied from NLM RxNav responses (retrieved
 * October 2026). Example mode answers lookups from these instead of the
 * network, so the whole app can be tried offline. Two of these products are
 * discontinued; they remain good examples of the same generic in two looks.
 */
(function (root) {
  'use strict';

  const concept = (pairs) => ({ propertyConcept: pairs.map(([propName, propValue]) => ({ propName, propValue })) });

  const NDC = {
    // amlodipine 5 mg, Mylan: blue, round, "M / A9"
    '00378520905': {
      ndcItem: '00378520905', ndc9: '0378-5209', ndc10: '0378-5209-05', rxcui: '197361',
      splSetIdItem: 'a4ab4f05-1c18-442a-8618-c2c92e589703',
      packagingList: { packaging: ['500 TABLET in 1 BOTTLE, PLASTIC (0378-5209-05)'] },
      propertyConceptList: concept([
        ['COLORTEXT', 'BLUE'], ['COLOR', 'C48333'], ['IMPRINT_CODE', 'M;A9'],
        ['LABELER', 'Mylan Pharmaceuticals Inc.'], ['SCORE', '1'], ['SHAPE', 'C48348'], ['SIZE', '8 mm'],
      ]),
    },
    // amlodipine 5 mg, Camber: white, round, "238 / IG"
    '31722023810': {
      ndcItem: '31722023810', ndc9: '31722-238', ndc10: '31722-238-10', rxcui: '197361',
      splSetIdItem: '7aaf923d-5b82-4a85-bb10-5850087da487',
      packagingList: { packaging: ['1000 TABLET in 1 BOTTLE (31722-238-10)'] },
      propertyConceptList: concept([
        ['COLORTEXT', 'WHITE'], ['COLOR', 'C48325'], ['IMPRINT_CODE', '238;IG'],
        ['LABELER', 'Camber Pharmaceuticals Inc.'], ['SCORE', '1'], ['SHAPE', 'C48348'], ['SIZE', '6 mm'],
      ]),
    },
    // furosemide 20 mg, Mylan: white, round, "M2", scored
    '00378020801': {
      ndcItem: '00378020801', ndc9: '0378-0208', ndc10: '0378-0208-01', rxcui: '310429',
      splSetIdItem: '5c50b5a3-9b39-4cad-8be5-c2a8dd3f7df5',
      packagingList: { packaging: ['100 TABLET in 1 BOTTLE, PLASTIC (0378-0208-01)'] },
      propertyConceptList: concept([
        ['COLORTEXT', 'WHITE'], ['COLOR', 'C48325'], ['IMPRINT_CODE', 'M2'],
        ['LABELER', 'Mylan Pharmaceuticals Inc.'], ['SCORE', '1'], ['SHAPE', 'C48348'], ['SIZE', '6 mm'],
      ]),
    },
  };

  const RXCUI = {
    '197361': { rxcui: '197361', name: 'amlodipine 5 MG Oral Tablet', tty: 'SCD' },
    '310429': { rxcui: '310429', name: 'furosemide 20 MG Oral Tablet', tty: 'SCD' },
  };

  // Map any lookup id (11-digit, hyphenated product code) to an entry.
  function findEntry(id) {
    if (NDC[id]) return NDC[id];
    return Object.values(NDC).find((e) => e.ndc9 === id || e.ndc10 === id) || null;
  }

  /** A stand-in for fetch() that answers RxNav URLs from the records above. */
  async function exampleFetch(url) {
    const u = new URL(url);
    let body = null;
    if (u.pathname.endsWith('/ndcproperties.json')) {
      const e = findEntry(u.searchParams.get('id'));
      body = e ? { ndcPropertyList: { ndcProperty: [e] } } : {};
    } else {
      const m = u.pathname.match(/\/rxcui\/(\d+)\/properties\.json$/);
      if (m) body = RXCUI[m[1]] ? { properties: RXCUI[m[1]] } : {};
    }
    await new Promise((r) => setTimeout(r, 250));
    return {
      ok: body !== null,
      status: body !== null ? 200 : 404,
      json: async () => body,
    };
  }

  const EXAMPLE_NDCS = {
    savedAmlodipine: '0378-5209-05',
    refillAmlodipine: '31722-238-10',
    savedFurosemide: '0378-0208-01',
  };

  const api = { exampleFetch, EXAMPLE_NDCS, EXAMPLE_ENTRIES: NDC };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SPNL_EXAMPLES = api;
})(typeof self !== 'undefined' ? self : this);
