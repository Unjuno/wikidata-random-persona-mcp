import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1PersonaCache} from '../src/d1-persona-cache.mjs';

const entry={
 qid:'Q42',name:'ダグラス・アダムズ',kind:'real',description:'作家',
 sources:[
  {url:'https://en.wikipedia.org/wiki/Douglas_Adams',language:'en',purpose:'article'},
  {url:'https://www.wikidata.org/wiki/Q42',language:'mul',purpose:'identity'}
 ]
};
function fakeStorage(bytes){
 const calls=[];
 const db={prepare(sql){
  calls.push(sql);
  if(sql.includes('capacity_probe'))return {all:async()=>({results:[{capacity_probe:1}],meta:
   bytes===null?{}:{size_after:bytes}})};
  if(sql.includes('INSERT INTO persona_cache'))return {bind(){return {run:async()=>({success:true})}}};
  throw Error('Unexpected query '+sql);
 }};
 return {db,calls};
}
test('enforced D1 soft limit blocks opportunistic writes near 8GB without deleting existing records',async()=>{
 const f=fakeStorage(8_000_000_000-500000);
 const cache=createD1PersonaCache(f.db,{enforceStorageLimit:true,randomIndex:()=>0});
 const saved=await cache.put(entry);
 assert.equal(saved,false);
 assert.ok(!f.calls.some(sql=>sql.includes('INSERT INTO persona_cache')));
});
test('opportunistic write succeeds with verified headroom and no external identity auth',async()=>{
 const f=fakeStorage(1000000);
 const cache=createD1PersonaCache(f.db,{enforceStorageLimit:true,randomIndex:()=>0});
 assert.equal(await cache.put(entry),true);
 assert.equal(f.calls.filter(sql=>sql.includes('INSERT INTO persona_cache')).length,1);
});
test('absence of reliable storage size fails closed on managed ingestion writes',async()=>{
 const f=fakeStorage(null);
 const cache=createD1PersonaCache(f.db,{enforceStorageLimit:true,randomIndex:()=>0});
 assert.equal(await cache.put(entry),false);
 assert.equal(f.calls.some(sql=>sql.includes('INSERT INTO persona_cache')),false);
});
