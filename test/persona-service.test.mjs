import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonaService} from '../src/persona-service.mjs';
const persona={
 qid:'Q42',kind:'real',name:'Douglas Adams',description:'British writer',
 sources:[
  {url:'https://en.wikipedia.org/wiki/Douglas_Adams',language:'en',purpose:'article'},
  {url:'https://www.wikidata.org/wiki/Q42',language:'mul',purpose:'identity'}
 ]
};
const other={
 ...persona,qid:'Q101',kind:'fictional',name:'Example fictional persona',
 sources:[
  {url:'https://en.wikipedia.org/wiki/Example',language:'en',purpose:'article'},
  {url:'https://www.wikidata.org/wiki/Q101',language:'mul',purpose:'identity'}
 ]
};
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

test('wrong kind, excluded QIDs and blocked entries cannot escape any data layer',async()=>{
 const calls={live:0,cache:0,store:0};
 const {service}=fixture({
  liveSource:{random:async()=>{calls.live++;return {status:'ok',persona,source_mode:'wikidata_live'};}},
  cache:{random:async()=>{calls.cache++;return {status:'ok',persona};}},
  store:{
   summary:{catalog_version:'test'},get:()=>({status:'not_found'}),
   random:()=>{calls.store++;return {status:'ok',persona:other};}
  }
 });
 // Both live and cached responses violate the requested fictional category.
 const first=await service.random({kind:'fictional'});
 assert.equal(first.persona.qid,other.qid);
 assert.equal(first.source_mode,'catalog_fallback');
 assert.deepEqual(calls,{live:1,cache:1,store:1});
 const {service:excluded}=fixture({
  liveSource:{random:async()=>({status:'ok',persona,source_mode:'wikidata_live'})},
  cache:{random:async()=>({status:'ok',persona})},
  store:{summary:{catalog_version:'test'},get:()=>({status:'not_found'}),
   random:()=>({status:'ok',persona:other})}
 });
 const second=await excluded.random({kind:'both',exclude_qids:['Q42']});
 assert.equal(second.persona.qid,'Q101');
 const {metrics,service:blocked}=fixture({blockedQids:['Q42']});
 const result=await blocked.get({qid:'Q42'});
 assert.equal(result.status,'not_found');
 assert.equal(result.source_mode,'blocked');
 assert.deepEqual(metrics,{live:0,cacheReads:0,catalogReads:0,cacheWrites:0});
});
test('untrusted cache links and mismatched identity handoff cannot become a persona',async()=>{
 const invalid={...persona,sources:[
  {url:'https://evil.example/steal',language:'en',purpose:'article'},
  {url:'https://www.wikidata.org/wiki/Q42',language:'mul',purpose:'identity'}
 ]};
 const {service}=fixture({
  liveSource:{random:async()=>{throw Error('unavailable');},get:async()=>{throw Error('unavailable');}},
  cache:{random:async()=>({status:'ok',persona:invalid}),get:async()=>({status:'ok',persona:invalid})}
 });
 const first=await service.random();
 assert.equal(first.source_mode,'catalog_fallback');
 const got=await service.get({qid:'Q42'});
 assert.equal(got.status,'upstream_unavailable');
 const {service:handoff}=fixture({
  liveSource:{random:async()=>({status:'ok',persona,
   agent_handoff:{subject_qid:'Q999'},source_mode:'wikidata_live'})},
  cache:{random:async()=>({status:'no_match'})}
 });
 assert.equal((await handoff.random()).source_mode,'catalog_fallback');
});
