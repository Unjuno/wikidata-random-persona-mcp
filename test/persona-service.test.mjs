import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonaService} from '../src/persona-service.mjs';
const persona={qid:'Q42',kind:'real',name:'Douglas Adams'};
function fixture(overrides={}){
 const metrics={live:0,cacheReads:0,catalogReads:0,cacheWrites:0};
 const store={
  summary:{catalog_version:'catalog-fixture'},
  random:()=>{metrics.catalogReads++;return {status:'ok',persona,source_mode:'catalog_fallback'};},
  get:({qid})=>{metrics.catalogReads++;return {status:'not_found',qid};}
 };
 const liveSource={
  random:async()=>{metrics.live++;return {status:'ok',persona,source_mode:'wikidata_live'};},
  get:async()=>{metrics.live++;return {status:'ok',persona,source_mode:'wikidata_live'};}
 };
 const cache={
  put:async()=>{metrics.cacheWrites++;},
  random:async()=>{metrics.cacheReads++;return {status:'no_match'};},
  get:async()=>{metrics.cacheReads++;return {status:'not_found'};}
 };
 return {metrics,service:createPersonaService({
  store,liveSource,cache,blockedQids:[],
  ...overrides
 })};
}
test('successful Wikidata result never selects a hidden fallback catalog persona',async()=>{
 const {metrics,service}=fixture();
 const result=await service.call('random_persona',{kind:'both',language:'ja'});
 assert.equal(result.persona.qid,'Q42');
 assert.deepEqual(metrics,{live:1,cacheReads:0,catalogReads:0,cacheWrites:1});
 const looked=await service.get({qid:'Q42'});
 assert.equal(looked.persona.qid,'Q42');
 assert.deepEqual(metrics,{live:2,cacheReads:0,catalogReads:0,cacheWrites:2});
});
test('service prefers validated D1 references when Wikimedia is unavailable',async()=>{
 let localHits=0,cachedHits=0;
 const {service}=fixture({
  store:{
   summary:{catalog_version:'test'},
   random:()=>{localHits++;return {status:'ok',persona};},
   get:()=>{localHits++;return {status:'not_found'};}
  },
  liveSource:{random:async()=>{throw Error('HTTP 503');},get:async()=>{throw Error('timeout');}},
  cache:{random:async()=>{cachedHits++;return {status:'ok',persona};},
   get:async()=>({status:'ok',persona}),put:async()=>{throw Error('never called');}}
 });
 const r=await service.random({kind:'real'});
 assert.equal(r.source_mode,'d1_cache_fallback');
 assert.equal(r.fallback_reason,'wikidata_unavailable');
 assert.equal(r.upstream_failure_category,'wikimedia_rate_limited');
 assert.equal(localHits,0);
 assert.equal(cachedHits,1);
});
test('last-resort fallback is lazy and source mode remains transparent',async()=>{
 let localHits=0;
 const {service}=fixture({
  store:{
   summary:{catalog_version:'test'},
   random:()=>{localHits++;return {status:'ok',persona};},
   get:({qid})=>{localHits++;return {status:'not_found',qid};}
  },
  liveSource:{random:async()=>({status:'no_match'}),
   get:async()=>{throw Error('Wikidata timeout');}},
  cache:{random:async()=>({status:'no_match'}),get:async()=>({status:'not_found'})}
 });
 const draw=await service.random();
 assert.equal(draw.source_mode,'catalog_fallback');
 assert.equal(draw.fallback_reason,'no_live_match');
 assert.equal(localHits,1);
 const get=await service.get({qid:'Q300'});
 assert.equal(get.status,'upstream_unavailable');
 assert.equal(get.upstream_failure_category,'wikimedia_timeout');
 assert.equal(localHits,2);
});
test('bad arguments stop before any source is touched',async()=>{
 const {metrics,service}=fixture();
 await assert.rejects(service.random({kind:'fictional',exclude_qids:['Q42\n']}),/Invalid random/);
 await assert.rejects(service.random({kind:'bad'}),/Invalid random/);
 await assert.rejects(service.get({qid:'Q0'}),/Invalid QID/);
 await assert.rejects(service.call('unknown'),/Unknown tool/);
 await assert.rejects(service.get({qid:'Q42',url:'https://evil.example'}),/Invalid tool arguments/);
 assert.deepEqual(metrics,{live:0,cacheReads:0,catalogReads:0,cacheWrites:0});
});
test('unexpected live lookup identity is not passed to caller',async()=>{
 const {service}=fixture({
  liveSource:{get:async()=>({status:'ok',persona:{...persona,qid:'Q43'}}),random:async()=>({status:'no_match'})},
  cache:null
 });
 const result=await service.get({qid:'Q42'});
 assert.equal(result.status,'upstream_unavailable');
});
