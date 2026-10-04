// Records real NLM RxNav and openFDA responses into test/fixtures/recorded.json,
// so tests run against what the APIs actually return. Run where those hosts are
// reachable (the "Record fixtures" workflow does this on GitHub's runners).
import { writeFileSync } from 'node:fs';

const RX = 'https://rxnav.nlm.nih.gov/REST';
const FDA = 'https://api.fda.gov';
const out = {};

const errors = [];
async function get(url) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    out[url] = { status: res.status, body };
    await new Promise((r) => setTimeout(r, 120)); // stay well under the APIs' rate limits
    return body;
  } catch (e) {
    errors.push(`${url}: ${e.message}`);
    return null;
  }
}

const concepts = (drugs) => (drugs?.drugGroup?.conceptGroup || []).flatMap((g) => g.conceptProperties || []);

try {
// Name search, brand mapping and every listed look for a few common medicines.
const names = ['amlodipine', 'norvasc', 'omeprazole', 'levothyroxine', 'metformin', 'atorvastatin', 'lisinopril'];
const picks = {
  amlodipine: /^amlodipine 5 MG Oral Tablet$/i,
  norvasc: /amlodipine 5 MG Oral Tablet \[Norvasc\]/i,
  omeprazole: /^omeprazole 20 MG Delayed Release Oral Capsule$/i,
  levothyroxine: /^levothyroxine sodium 0\.05 MG Oral Tablet$/i,
  metformin: /^metformin hydrochloride 500 MG Oral Tablet$/i,
  atorvastatin: /^atorvastatin 20 MG Oral Tablet$/i,
  lisinopril: /^lisinopril 10 MG Oral Tablet$/i,
};
for (const n of names) {
  const d = await get(`${RX}/drugs.json?name=${n}`);
  const c = concepts(d).find((x) => picks[n].test(x.name));
  if (!c) { console.log('no pick for', n); continue; }
  await get(`${RX}/rxcui/${c.rxcui}/properties.json`);
  const all = await get(`${RX}/ndcproperties.json?id=${c.rxcui}&ndcstatus=active`);
  await get(`${RX}/rxcui/${c.rxcui}/related.json?tty=SBD`);
  await get(`${RX}/rxcui/${c.rxcui}/related.json?tty=SCD+GPCK`);
  // A couple of single-NDC lookups per drug, as the app does them.
  const items = all?.ndcPropertyList?.ndcProperty || [];
  for (const e of items.slice(0, 2)) {
    await get(`${RX}/ndcproperties.json?id=${e.ndcItem}&ndcstatus=ALL`);
    await get(`${FDA}/drug/enforcement.json?search=openfda.package_ndc:%22${e.ndc10}%22+openfda.product_ndc:%22${e.ndc9}%22&limit=5`);
  }
}
// Misspellings.
await get(`${RX}/drugs.json?name=amlodipin`);
await get(`${RX}/spellingsuggestions.json?name=amlodipin`);
// Original example products.
for (const id of ['00378520905', '31722023810', '00378020801']) await get(`${RX}/ndcproperties.json?id=${id}&ndcstatus=ALL`);
for (const id of ['197361', '310429']) await get(`${RX}/rxcui/${id}/properties.json`);
// A real ongoing drug recall that names its NDC, to test the recall card.
const rec = await get(`${FDA}/drug/enforcement.json?search=status:%22Ongoing%22+AND+_exists_:openfda.product_ndc&sort=report_date:desc&limit=3`);
for (const r of rec?.results || []) {
  const ndc9 = r.openfda?.product_ndc?.[0];
  if (!ndc9) continue;
  await get(`${RX}/ndcproperties.json?id=${ndc9}&ndcstatus=ALL`);
  const pk = r.openfda?.package_ndc?.[0];
  if (pk) await get(`${FDA}/drug/enforcement.json?search=openfda.package_ndc:%22${pk}%22+openfda.product_ndc:%22${ndc9}%22&limit=5`);
}

} catch (e) { errors.push('script: ' + e.stack); }
writeFileSync('test/fixtures/recorded.json', JSON.stringify({ recordedAt: new Date().toISOString(), errors, responses: out }, null, 1));
console.log('recorded', Object.keys(out).length, 'responses');
