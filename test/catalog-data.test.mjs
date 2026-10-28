import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
import {validateCatalog} from '../src/core.mjs';
test('reviewed runtime catalog matches its advertised provenance and both kinds',()=>{
 validateCatalog(catalog);
 assert.ok(catalog.entries.some(e=>e.kind==='real'));
 assert.ok(catalog.entries.some(e=>e.kind==='fictional'));
 const wikidataSitelinks=/^Wikidata (?:JSON dump; sampled|direct P31 category query;)/.test(catalog.source??'');
 for(const e of catalog.entries)for(const s of e.sources){
  if(s.checked_at!==undefined)assert.ok(Number.isFinite(Date.parse(s.checked_at)));
  else assert.ok(wikidataSitelinks,'unchecked links require explicit Wikidata provenance');
 }
 if(wikidataSitelinks)assert.ok(catalog.entries.length>6,'Wikidata ingestion must replace the six-item demo');
 assert.match(catalog.version,/^published-/);
});
