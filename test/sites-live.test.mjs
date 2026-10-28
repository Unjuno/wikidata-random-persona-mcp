import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../dist/server/index.js';
const url='https://random-persona-mcp.unjuno.chatgpt.site/mcp';
function post(worker,name,args={}) {
 return worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:12,method:'tools/call',params:{name,arguments:args}})}));
}
const remote={
 status:'ok',
 persona:{qid:'Q98765432',name:'Sample source from Wikidata',kind:'real',description:'Published Wikidata person',
  sources:[{url:'https://en.wikipedia.org/wiki/Example',language:'en',purpose:'article'},{url:'https://www.wikidata.org/wiki/Q98765432',language:'mul',purpose:'identity'}]},
 source_mode:'wikidata_live',fetched_at:'2026-10-28T00:00:00Z'
};
test('Sites MCP calls live Wikidata source instead of static 300-entry list',async()=>{
 let draws=0,lookups=0;
 const worker=createWorker({liveSource:{
  random:async()=>{draws++;return remote;},
  get:async()=>{lookups++;return remote;}
 }});
 const draw=(await (await post(worker,'random_persona',{kind:'real'})).json()).result.structuredContent;
 assert.equal(draw.persona.qid,'Q98765432');
 assert.equal(draw.source_mode,'wikidata_live');
 const looked=(await (await post(worker,'get_persona',{qid:'Q98765432'})).json()).result.structuredContent;
 assert.equal(looked.persona.qid,'Q98765432');
 assert.deepEqual([draws,lookups],[1,1]);
});
test('a Wikidata outage has clearly marked catalog fallback and does not pretend an unknown ID is absent',async()=>{
 const worker=createWorker({liveSource:{
  random:async()=>{throw Error('upstream unavailable');},
  get:async()=>{throw Error('upstream unavailable');}
 }});
 const draw=(await (await post(worker,'random_persona',{kind:'real'})).json()).result.structuredContent;
 assert.equal(draw.status,'ok');
 assert.equal(draw.source_mode,'catalog_fallback');
 assert.equal(draw.fallback_reason,'wikidata_unavailable');
 const lookup=(await (await post(worker,'get_persona',{qid:'Q98765432'})).json()).result.structuredContent;
 assert.equal(lookup.status,'upstream_unavailable');
});
test('client validation occurs before live Wikidata requests',async()=>{
 let hits=0;
 const worker=createWorker({liveSource:{random:async()=>{hits++;return remote;},get:async()=>{hits++;return remote;}}});
 const bad=(await (await post(worker,'get_persona',{qid:'Q123',url:'https://evil.example'})).json()).result;
 assert.equal(bad.isError,true);
 const badRandom=(await (await post(worker,'random_persona',{kind:'fictional',exclude_qids:['Q0']})).json()).result;
 assert.equal(badRandom.isError,true);
 assert.equal(hits,0);
});
