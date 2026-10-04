// A fetch() stand-in that answers from responses recorded from the live APIs
// (see scripts/record-fixtures.mjs). Unrecorded URLs fail loudly.
const { responses } = require('./fixtures/recorded.json');

const norm = (url) => {
  const u = new URL(url);
  u.searchParams.delete('limit');
  return decodeURIComponent(u.toString());
};
const index = new Map(Object.entries(responses).map(([url, r]) => [norm(url), r]));

async function fixtureFetch(url) {
  const r = index.get(norm(url));
  if (!r) throw new Error(`No recorded response for ${url}`);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
}

module.exports = { fixtureFetch, has: (url) => index.has(norm(url)) };
