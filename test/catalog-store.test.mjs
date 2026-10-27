import test from 'node:test';
import assert from 'node:assert/strict';
import sample from '../data/catalog.json' with {type:'json'};
import {createCatalogStore} from '../src/catalog-store.mjs';
test('blocked identities cannot be retrieved or randomly selected',()=>{
 const s=createCatalogStore(sample,['Q42']);assert.equal(s.get({qid:'Q42'}).status,'not_found');
 assert.notEqual(s.random({},()=>0).persona.qid,'Q42');
});
test('block list survives swapping to an earlier catalog snapshot',()=>{
 const old={...sample,version:'older'};const s=createCatalogStore(old,['Q42']);assert.equal(s.get({qid:'Q42'}).status,'not_found');
});
test('all blocked yields no_match, not a server error',()=>{
 const s=createCatalogStore(sample,sample.entries.map(x=>x.qid));assert.equal(s.random().status,'no_match');assert.equal(s.summary.entries,0);
});
test('immutable snapshot ignores later caller mutations',()=>{
 const c=structuredClone(sample);const blocked=['Q42'];const s=createCatalogStore(c,blocked);c.entries=[];blocked.length=0;
 assert.equal(s.summary.entries,5);assert.equal(s.get({qid:'Q42'}).status,'not_found');
});
test('invalid block-list and invalid inputs fail even when all entries are blocked',()=>{
 assert.throws(()=>createCatalogStore(sample,['http://evil']));
 const s=createCatalogStore(sample,sample.entries.map(x=>x.qid));assert.throws(()=>s.random({kind:'invalid'}));assert.throws(()=>s.get({qid:'bad'}));
});
