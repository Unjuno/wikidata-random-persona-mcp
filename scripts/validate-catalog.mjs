import { readFileSync } from 'node:fs';
import { validateCatalog } from '../src/core.mjs';
const path = process.argv[2] ?? 'data/catalog.json';
const catalog = JSON.parse(readFileSync(path, 'utf8'));
validateCatalog(catalog);
const real = catalog.entries.filter(x => x.kind === 'real').length;
const fictional = catalog.entries.filter(x => x.kind === 'fictional').length;
if (!real || !fictional) throw new Error('Catalog must contain both real and fictional entries');
console.log(`VALID version=${catalog.version} entries=${catalog.entries.length} real=${real} fictional=${fictional}`);
