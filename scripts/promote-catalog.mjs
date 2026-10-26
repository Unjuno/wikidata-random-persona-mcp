import { readFileSync, writeFileSync } from 'node:fs';
import { validateCatalog } from '../src/core.mjs';
if (!process.argv.includes('--reviewed')) {
  console.error('Refusing to publish without explicit --reviewed flag after inspecting candidate diff.');
  process.exit(2);
}
const candidate = JSON.parse(readFileSync('data/catalog.pending.json', 'utf8'));
validateCatalog(candidate);
const counts = [candidate.entries.filter(x => x.kind === 'real').length, candidate.entries.filter(x => x.kind === 'fictional').length];
if (counts.some(x => x < 1)) throw new Error('Both real and fictional entries required');
const publishable = { ...candidate, version: candidate.version.replace(/^candidate-/, 'published-') };
writeFileSync('data/catalog.json', JSON.stringify(publishable, null, 2) + '\n');
console.log(`Promoted ${publishable.version} (reviewed=${true})`);
