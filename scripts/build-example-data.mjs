// Builds example-data.json, the slice of recorded API responses that example
// mode answers from. Run after refreshing test/fixtures/recorded.json.
import { readFileSync, writeFileSync } from 'node:fs';

const { recordedAt, responses } = JSON.parse(readFileSync('test/fixtures/recorded.json', 'utf8'));
const KEEP_PROPS = new Set(['COLOR', 'COLORTEXT', 'SHAPE', 'SHAPETEXT', 'IMPRINT_CODE', 'SIZE', 'SCORE', 'LABELER']);
const wanted = [
  /drugs\.json\?name=(amlodipine|norvasc|levothyroxine|amlodipin)$/,
  /spellingsuggestions\.json\?name=amlodipin$/,
  /rxcui\/(197361|212549|966221|310429)\/properties\.json$/,
  /rxcui\/(197361|966221)\/related\.json\?tty=SBD$/,
  /rxcui\/(197361|212549|966221)\/related\.json\?tty=SCD\+GPCK$/,
  /ndcproperties\.json\?id=(197361|212549|966221)&ndcstatus=active$/,
  /ndcproperties\.json\?id=(00378520905|31722023810|00378020801|00378180304|00069153041)&ndcstatus=ALL$/,
  /enforcement\.json\?search=openfda\.package_ndc:%22(0378-1803-04|0378-5209-05|0069-1530-41)%22/,
];

function trim(body) {
  const list = body?.ndcPropertyList?.ndcProperty;
  if (!list) return body;
  return {
    ndcPropertyList: {
      ndcProperty: list.map((e) => ({
        ndcItem: e.ndcItem, ndc9: e.ndc9, ndc10: e.ndc10, rxcui: e.rxcui, splSetIdItem: e.splSetIdItem,
        packagingList: e.packagingList ? { packaging: (e.packagingList.packaging || []).slice(0, 1) } : undefined,
        propertyConceptList: { propertyConcept: (e.propertyConceptList?.propertyConcept || []).filter((p) => KEEP_PROPS.has(p.propName)) },
      })),
    },
  };
}

const out = {};
for (const [url, r] of Object.entries(responses)) {
  if (wanted.some((re) => re.test(url))) out[url] = { status: r.status, body: trim(r.body) };
}
writeFileSync('example-data.json', JSON.stringify({ recordedAt, responses: out }));
console.log('example-data.json:', Object.keys(out).length, 'responses');
