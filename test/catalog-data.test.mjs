import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
import {validateCatalog} from '../src/core.mjs';
test('bundled runtime catalog has verified source timestamps and both kinds',()=>{
 validateCatalog(catalog);
 assert.ok(catalog.entries.some(e=>e.kind==='real'));
 assert.ok(catalog.entries.some(e=>e.kind==='fictional'));
 for(const e of catalog.entries)for(const s of e.sources)assert.ok(Number.isFinite(Date.parse(s.checked_at)));
 assert.match(catalog.version,/^published-/);
});
