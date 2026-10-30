import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../dist/server/index.js';
const url='https://random-persona-mcp.unjuno.chatgpt.site/mcp';
const request=(worker,name,args={})=>worker.fetch(new Request(url,{
 method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}})
}));
const persona={
 qid:'Q999888777',name:'大規模キャッシュの人物',kind:'fictional',description:'架空の人物',
 sources:[{url:'https://en.wikipedia.org/wiki/Example',language:'en',purpose:'article'},
 {url:'https://www.wikidata.org/wiki/Q999888777',language:'mul',purpose:'identity'}]
};
const cached={
 status:'ok',persona,catalog_version:'d1-prefetch-cache',source_mode:'d1_cache_fallback',
 cache_checked_at:'2026-10-29T00:00:00Z',guidance:'資料を確認して仮想対話',
 roleplay_prompt:'対象: 大規模キャッシュの人物。資料を確認して仮想対話してください。'
};
const offline={random:async()=>{throw Error('Wikidata upstream error: maxlag');},get:async()=>{throw Error('Wikidata upstream error: maxlag');}};
test('when Wikidata fails, D1 cache is used before the bundled 300-person fallback',async()=>{
 const calls={random:0,get:0};
 const worker=createWorker({liveSource:offline,cacheSource:{
  random:async()=>{calls.random++;return cached;},
  get:async()=>{calls.get++;return cached;}
 }});
 const drawn=(await (await request(worker,'random_persona',{kind:'fictional'})).json()).result.structuredContent;
 assert.equal(drawn.status,'ok');
 assert.equal(drawn.persona.qid,persona.qid);
 assert.equal(drawn.source_mode,'d1_cache_fallback');
 assert.equal(drawn.upstream_failure_category,'wikimedia_maxlag');
 assert.match(drawn.roleplay_prompt,/大規模キャッシュの人物/);
 const found=(await (await request(worker,'get_persona',{qid:persona.qid})).json()).result.structuredContent;
 assert.equal(found.persona.qid,persona.qid);
 assert.equal(found.source_mode,'d1_cache_fallback');
 assert.deepEqual(calls,{random:1,get:1});
});
test('D1 empty or offline falls back to the existing bundled catalog and maintains 300-count label',async()=>{
 const worker=createWorker({liveSource:offline,cacheSource:{
  random:async()=>({status:'no_match'}),
  get:async()=>({status:'not_found'})
 }});
 const result=(await (await request(worker,'random_persona',{kind:'real'})).json()).result.structuredContent;
 assert.equal(result.status,'ok');
 assert.equal(result.source_mode,'catalog_fallback');
 assert.equal(result.fallback_reason,'wikidata_unavailable');
 const health=await (await worker.fetch(new Request('https://random-persona-mcp.unjuno.chatgpt.site/healthz'))).json();
 assert.equal(health.fallback_catalog.entries,300);
 assert.equal(health.cache_storage,'d1');
});
test('Wikidata success takes precedence and fills cache opportunistically',async()=>{
 const calls=[];
 const worker=createWorker({
  liveSource:{random:async()=>({...cached,source_mode:'wikidata_live'}),get:async()=>({...cached,source_mode:'wikidata_live'})},
  cacheSource:{random:async()=>{throw Error('Cache should not be used for live success');},
   get:async()=>{throw Error('Cache should not be used for live success');},
   put:async entry=>{calls.push(entry.qid);return true;}}
 });
 const data=(await (await request(worker,'random_persona',{kind:'fictional'})).json()).result.structuredContent;
 assert.equal(data.source_mode,'wikidata_live');
 assert.deepEqual(calls,[persona.qid]);
});
test('D1 failure does not hide the original Wikidata outage or break bundled fallback',async()=>{
 const worker=createWorker({liveSource:offline,cacheSource:{
  random:async()=>{throw Error('D1 unavailable');},
  get:async()=>{throw Error('D1 unavailable');}
 }});
 const output=(await (await request(worker,'random_persona',{kind:'real'})).json()).result.structuredContent;
 assert.equal(output.status,'ok');
 assert.equal(output.source_mode,'catalog_fallback');
 assert.equal(output.upstream_failure_category,'wikimedia_maxlag');
});
test('D1 access is optional; the existing Site runs with no database binding',async()=>{
 const worker=createWorker({liveSource:offline});
 const output=(await (await request(worker,'random_persona',{kind:'fictional'})).json()).result.structuredContent;
 assert.equal(output.source_mode,'catalog_fallback');
 const health=await (await worker.fetch(new Request('https://random-persona-mcp.unjuno.chatgpt.site/healthz'))).json();
 assert.equal(health.cache_storage,'not_configured');
});
