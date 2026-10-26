/** Manual, bounded Wikidata refresh: creates a staging file, NEVER publishes automatically. */
import { readFileSync, writeFileSync } from 'node:fs';
import { validateCatalog } from '../src/core.mjs';
import { normalizeEntity } from '../src/wikidata.mjs';

const API = 'https://www.wikidata.org/w/api.php';
const UA = process.env.WIKIMEDIA_USER_AGENT ?? 'RandomPersonaMCP/0.1 (+https://github.com/Unjuno/wikidata-random-persona-mcp)';
const MAX_ATTEMPTS = 3;
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadBatch(ids) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'wbgetentities', ids: ids.join('|'),
    props: 'labels|descriptions|sitelinks|claims', languages: 'ja|en',
    format: 'json', formatversion: '1'
  }).toString();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      const data = await response.json();
      if (!data?.entities || typeof data.entities !== 'object') throw new Error('Invalid Wikimedia response');
      return data.entities;
    }
    if ((response.status === 429 || response.status >= 500) && attempt + 1 < MAX_ATTEMPTS) {
      const retrySeconds = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retrySeconds) && retrySeconds >= 1 ? Math.min(retrySeconds * 1000, 30000) : 1000 * (attempt + 1);
      await pause(delay);
      continue;
    }
    throw new Error(`Wikidata request failed: ${response.status}`);
  }
  throw new Error('retry attempts exhausted');
}

const seeds = JSON.parse(readFileSync('data/seeds.json', 'utf8')).entries;
if (!Array.isArray(seeds) || seeds.length === 0 || seeds.length > 2000) throw new Error('seed count must be 1-2000');
const seen = new Set();
for (const seed of seeds) {
  if (!/^Q[1-9][0-9]{0,11}$/.test(seed.qid) || !['real', 'fictional'].includes(seed.kind) || seen.has(seed.qid)) {
    throw new Error('invalid or duplicate seed');
  }
  seen.add(seed.qid);
}
const rows = [];
const rejected = [];
for (let i = 0; i < seeds.length; i += 10) {
  const batch = seeds.slice(i, i + 10);
  const entities = await loadBatch(batch.map(s => s.qid));
  for (const seed of batch) {
    const result = normalizeEntity(entities[seed.qid], seed);
    if (result) rows.push(result);
    else rejected.push(seed.qid);
  }
  if (i + 10 < seeds.length) await pause(1000);
}
const timestamp = new Date().toISOString();
const catalog = {
  version: `candidate-${timestamp.replace(/[:.]/g, '-')}`,
  source: 'Wikidata labels/sitelinks (CC0); linked Wikipedia articles are not mirrored',
  entries: rows
};
validateCatalog(catalog);
const counts = { real: rows.filter(x => x.kind === 'real').length, fictional: rows.filter(x => x.kind === 'fictional').length };
if (!counts.real || !counts.fictional) throw new Error('Both categories required before staging');
writeFileSync('data/catalog.pending.json', JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ staged: 'data/catalog.pending.json', version: catalog.version, counts, rejected }, null, 2));
console.log('Review the diff and samples, then run npm run catalog:promote; no automatic publishing occurs.');
