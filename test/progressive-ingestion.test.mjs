import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProgressiveIngestor} from '../src/progressive-ingestion.mjs';

const persona=(id,kind='real')=>({
 qid:id,kind,name:'Example '+id,description:'Fixture from Wikidata',
 sources:[
  {url:'https://en.wikipedia.org/wiki/Example_'+id,language:'en',purpose:'article'},
  {url:'https://www.wikidata.org/wiki/'+id,language:'mul',purpose:'identity'}
 ]
});
function storeFixture({sizeAfter=100000,existing=[]}={}){
 const saved=new Set(existing),statements=[];
 const db={prepare(sql){
  const request={sql,args:[]};statements.push(request);
  return {all:async()=>({results:[{capacity_probe:1}],meta:{size_after:sizeAfter}}),
   bind(...args){request.args=args;return {first:async()=>saved.has(args[0])?{exists:1}:null};}
  };
 }};
 const cache={put:async p=>{saved.add(p.qid);return true;}};
 return {db,cache,saved,statements};
}
test('bounded background collection adds new QIDs persistently and skips duplicates',async()=>{
 const f=storeFixture({existing:['Q101']});
 const kinds=[];
 const source={discoverBatch:async({kind})=>{
  kinds.push(kind);
  return {status:'ok',source_mode:'wikidata_live',personas:kind==='real'?
   [persona('Q101'),persona('Q102'),persona('Q103')]:
   [persona('Q201','fictional'),persona('Q202','fictional')]};
 }};
 const ingest=createProgressiveIngestor({db:f.db,source,cache:f.cache});
 const r=await ingest.runOnce({batches:2});
 assert.equal(r.status,'ok');
 assert.equal(r.added,4);
 assert.equal(r.known,1);
 assert.equal(r.attempted,5);
 assert.deepEqual(kinds,['real','fictional']);
 assert.ok(f.saved.has('Q102')&&f.saved.has('Q202'));
 assert.ok(f.statements.some(x=>x.sql.includes('capacity_probe')));
});
test('storage guard stops before 8 GB soft ceiling, with no Wikidata traffic',async()=>{
 const f=storeFixture({sizeAfter:8_000_000_000-200000});
 let calls=0;
 const ingest=createProgressiveIngestor({db:f.db,cache:f.cache,
  source:{discoverBatch:async()=>{calls++;return {status:'no_match'};}}});
 const r=await ingest.runOnce({batches:4});
 assert.equal(r.status,'capacity_reached');
 assert.equal(r.added,0);
 assert.equal(calls,0);
});
test('missing D1 size_after fails closed rather than pretending unlimited space',async()=>{
 let calls=0;
 const db={prepare(){return {all:async()=>({results:[{capacity_probe:1}],meta:{}})};}};
 const ingest=createProgressiveIngestor({db,cache:{put:async()=>{throw Error('not called');}},
  source:{discoverBatch:async()=>{calls++;return {status:'no_match'};}}});
 const r=await ingest.runOnce();
 assert.equal(r.status,'capacity_unverified');
 assert.equal(calls,0);
});
test('Wikidata throttle aborts current collection without repeated requests',async()=>{
 const f=storeFixture();
 let count=0;
 const ingest=createProgressiveIngestor({db:f.db,cache:f.cache,
  source:{discoverBatch:async()=>{count++;throw Error('Wikidata rate limited: 429');}}});
 const r=await ingest.runOnce({batches:6});
 assert.equal(r.status,'source_unavailable');
 assert.equal(count,1);
 assert.equal(r.added,0);
});
test('only truly live Wikimedia personas enter cache, and blocked QIDs never enter',async()=>{
 const f=storeFixture();
 const ing=createProgressiveIngestor({db:f.db,cache:f.cache,blockedQids:['Q700'],
  source:{discoverBatch:async()=>({status:'ok',source_mode:'catalog_fallback',
   personas:[persona('Q700'),persona('Q701')]})}});
 const r=await ing.runOnce({batches:1});
 assert.equal(r.added,0);
 assert.equal(f.saved.size,0);
 const ing2=createProgressiveIngestor({db:f.db,cache:f.cache,blockedQids:['Q700'],
  source:{discoverBatch:async()=>({status:'ok',source_mode:'wikidata_live',
   personas:[persona('Q700'),persona('Q701')]})}});
 const r2=await ing2.runOnce({batches:1});
 assert.equal(r2.added,1);
 assert.deepEqual([...f.saved],['Q701']);
});
test('per-run bounds and database prerequisites block unbounded background work',async()=>{
 const f=storeFixture();
 const ing=createProgressiveIngestor({db:f.db,cache:f.cache,
  source:{discoverBatch:async()=>({status:'no_match'})}});
 await assert.rejects(()=>ing.runOnce({batches:0}),/batch/i);
 await assert.rejects(()=>ing.runOnce({batches:1000000}),/batch/i);
 assert.throws(()=>createProgressiveIngestor({db:{},cache:f.cache,source:{}}),/D1|database/i);
});
