/*
 * Example mode. Answers lookups from real NLM RxNav and openFDA responses
 * recorded in example-data.json (built by scripts/build-example-data.mjs), so the
 * whole app can be tried offline. A few core records are inlined as a fallback
 * for when that file can't load (for example in a sandboxed preview).
 */
(function (root) {
  'use strict';

  const concept = (pairs) => ({ propertyConcept: pairs.map(([propName, propValue]) => ({ propName, propValue })) });

  const INLINE = {
    'https://rxnav.nlm.nih.gov/REST/ndcproperties.json?id=00378520905&ndcstatus=ALL': { ndcPropertyList: { ndcProperty: [{
      ndcItem: '00378520905', ndc9: '0378-5209', ndc10: '0378-5209-05', rxcui: '197361', splSetIdItem: 'a4ab4f05-1c18-442a-8618-c2c92e589703',
      packagingList: { packaging: ['500 TABLET in 1 BOTTLE, PLASTIC (0378-5209-05)'] },
      propertyConceptList: concept([['COLORTEXT', 'BLUE'], ['COLOR', 'C48333'], ['IMPRINT_CODE', 'M;A9'], ['LABELER', 'Mylan Pharmaceuticals Inc.'], ['SCORE', '1'], ['SHAPE', 'C48348'], ['SIZE', '8 mm']]),
    }] } },
    'https://rxnav.nlm.nih.gov/REST/ndcproperties.json?id=31722023810&ndcstatus=ALL': { ndcPropertyList: { ndcProperty: [{
      ndcItem: '31722023810', ndc9: '31722-238', ndc10: '31722-238-10', rxcui: '197361', splSetIdItem: '7aaf923d-5b82-4a85-bb10-5850087da487',
      packagingList: { packaging: ['1000 TABLET in 1 BOTTLE (31722-238-10)'] },
      propertyConceptList: concept([['COLORTEXT', 'WHITE'], ['COLOR', 'C48325'], ['IMPRINT_CODE', '238;IG'], ['LABELER', 'Camber Pharmaceuticals Inc.'], ['SCORE', '1'], ['SHAPE', 'C48348'], ['SIZE', '6 mm']]),
    }] } },
    'https://rxnav.nlm.nih.gov/REST/ndcproperties.json?id=00378020801&ndcstatus=ALL': { ndcPropertyList: { ndcProperty: [{
      ndcItem: '00378020801', ndc9: '0378-0208', ndc10: '0378-0208-01', rxcui: '310429', splSetIdItem: '5c50b5a3-9b39-4cad-8be5-c2a8dd3f7df5',
      packagingList: { packaging: ['100 TABLET in 1 BOTTLE, PLASTIC (0378-0208-01)'] },
      propertyConceptList: concept([['COLORTEXT', 'WHITE'], ['COLOR', 'C48325'], ['IMPRINT_CODE', 'M2'], ['LABELER', 'Mylan Pharmaceuticals Inc.'], ['SCORE', '1'], ['SHAPE', 'C48348'], ['SIZE', '6 mm']]),
    }] } },
    'https://rxnav.nlm.nih.gov/REST/rxcui/197361/properties.json': { properties: { rxcui: '197361', name: 'amlodipine 5 MG Oral Tablet', tty: 'SCD' } },
    'https://rxnav.nlm.nih.gov/REST/rxcui/310429/properties.json': { properties: { rxcui: '310429', name: 'furosemide 20 MG Oral Tablet', tty: 'SCD' } },
  };

  const EXAMPLE_NDCS = {
    savedAmlodipine: '0378-5209-05',
    refillAmlodipine: '31722-238-10',
    savedFurosemide: '0378-0208-01',
    savedLevothyroxine: '0378-1803-04',
    searchName: 'amlodipine',
  };

  // Same URL with and without a limit parameter is the same request here.
  function norm(url) {
    const u = new URL(url);
    u.searchParams.delete('limit');
    // Match the app's NDC lookups, whatever ndcstatus they ask for.
    return decodeURIComponent(u.toString());
  }

  let recorded = null;
  let loading = null;
  function loadRecorded() {
    if (recorded) return Promise.resolve(recorded);
    if (!loading) {
      loading = (async () => {
        let data = null;
        try {
          if (typeof module === 'object' && module.exports && typeof require === 'function') {
            data = require('./example-data.json');
          } else {
            const res = await fetch('example-data.json');
            if (res.ok) data = await res.json();
          }
        } catch (e) { data = null; }
        const map = new Map();
        for (const [url, body] of Object.entries(INLINE)) map.set(norm(url), { status: 200, body });
        if (data && data.responses) {
          for (const [url, r] of Object.entries(data.responses)) map.set(norm(url), r);
        }
        recorded = map;
        return map;
      })();
    }
    return loading;
  }

  /** A stand-in for fetch() that answers from the recorded responses. */
  async function exampleFetch(url) {
    const map = await loadRecorded();
    let r = map.get(norm(url));
    // Products not in the examples answer like the real API does for unknown ids.
    if (!r) {
      const u = new URL(url);
      if (u.hostname === 'api.fda.gov') r = { status: 404, body: { error: { code: 'NOT_FOUND' } } };
      else if (u.pathname.endsWith('/ndcproperties.json')) r = { status: 200, body: {} };
      else if (u.pathname.endsWith('/drugs.json')) r = { status: 200, body: { drugGroup: { name: null } } };
      else if (u.pathname.endsWith('/spellingsuggestions.json')) r = { status: 200, body: { suggestionGroup: { suggestionList: null } } };
      else if (u.pathname.includes('/related.json')) r = { status: 200, body: { relatedGroup: {} } };
      else r = { status: 404, body: {} };
    }
    await new Promise((res) => setTimeout(res, 180));
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  }

  const api = { exampleFetch, EXAMPLE_NDCS, loadRecorded };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SPNL_EXAMPLES = api;
})(typeof self !== 'undefined' ? self : this);
