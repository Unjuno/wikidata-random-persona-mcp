import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorker,runSiteCollection} from '../dist/server/index.js';

const base='https://random-persona-mcp.unjuno.chatgpt.site';
const persona=(qid,kind)=>({
 qid,kind,name:'Persona '+qid,description:'Verified sample',
 sources:[{url:'https://en.wikipedia.org/wiki/Example_'+qid,language:'en',purpose:'article'},
 {url:'https://www.wikidata.org/wiki/'+qid,language:'mul',purpose:'identity'}]
});
test('scheduled handler triggers bounded private collection without exposing HTTP ingestion',async()=>{
 let called=0;
 const fake={runOnce:async args=>{called++;assert.equal(args.batches,8);
  return {status:'ok',added:3,known:1};}};
 const worker=createWorker({scheduledCollector:fake});
 const tasks=[];
 await worker.scheduled({scheduledTime:0},{DB:{prepare(){}}},{
  waitUntil(p){tasks.push(p);}
 });
 await Promise.all(tasks);
 assert.equal(called,1);
 const response=await worker.fetch(new Request(base+'/ingest',{method:'POST',
  headers:{'Content-Type':'application/json'},body:'{}'}));
 assert.equal(response.status,404);
 const result=(await (await worker.fetch(new Request(base+'/healthz'))).json());
 assert.equal(result.status,'ok');
});
test('scheduled collection refuses to modify storage without provisioned D1',async()=>{
 let queries=0;
 const src={discoverBatch:async()=>{queries++;return {status:'no_match'}}};
 const outcome=await runSiteCollection({},{source:src,batches:1});
 assert.equal(outcome.status,'not_configured');
 assert.equal(queries,0);
});
test('privileged ingestion uses Sites D1 binding and strictly live Wikimedia data',async()=>{
 const statements=[];
 const db={prepare(sql){
  const action={sql,args:[]}; statements.push(action);
  return {
   all:async()=>({results:[{capacity_probe:1}],meta:{size_after:100000}}),
   bind(...args){action.args=args;return {
    first:async()=>null,
    run:async()=>({success:true,meta:{changes:1}})
   };}
  };
 }};
 const called=[];
 const src={discoverBatch:async({kind})=>{
  called.push(kind);
  return {status:'ok',source_mode:'wikidata_live',
   personas:[persona(kind==='real'?'Q911':'Q922',kind)]};
 }};
 const outcome=await runSiteCollection({DB:db},{source:src,batches:2});
 assert.equal(outcome.status,'ok');
 assert.equal(outcome.added,2);
 assert.deepEqual(called,['real','fictional']);
 const insert=statements.filter(x=>x.sql.includes('INSERT INTO persona_cache'));
 assert.equal(insert.length,2);
 assert.deepEqual(insert.map(x=>x.args[0]),['Q911','Q922']);
});
test('public fetch never calls the scheduled collector even if a forged RPC method is sent',async()=>{
 let calls=0;
 const worker=createWorker({scheduledCollector:{runOnce:async()=>{calls++;return {status:'ok'}}}});
 const response=await worker.fetch(new Request(base+'/mcp',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:42,method:'tools/call',
   params:{name:'collect_personas',arguments:{}}})
 }));
 const body=await response.json();
 assert.equal(body.result.isError,true);
 assert.equal(calls,0);
});
