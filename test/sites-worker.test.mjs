import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
const knownQid=catalog.entries[0].qid;
const {createWorker} = await import('../dist/server/index.js');
// Existing protocol tests use a deterministic offline fixture; separate tests verify Wikidata-live preference.
const worker=createWorker({liveSource:{random:async()=>{throw Error('test upstream offline');},get:async()=>{throw Error('test upstream offline');}}});
const url = 'https://random-persona-mcp.unjuno.chatgpt.site/mcp';
const post = body => worker.fetch(new Request(url, {method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site','content-type':'application/json'},body:JSON.stringify(body)}));
const rpc = (method, params = {}, id = 1) => ({jsonrpc:'2.0',method,params,id});

test('Sites MCP discovery and exactly two tools', async () => {
  const discover = await (await post(rpc('server/discover'))).json();
  assert.deepEqual(discover.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(discover.result.capabilities.prompts,{});
  const initialized=await (await post(rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}))).json();
  assert.match(initialized.result.instructions,/first person/i);
  assert.deepEqual(initialized.result.capabilities.prompts,{});
  const listed = await (await post(rpc('tools/list'))).json();
  assert.deepEqual(listed.result.tools.map(tool => tool.name), ['random_persona','get_persona']);
  assert.ok(listed.result.tools.every(t=>t.securitySchemes?.length===1&&t.securitySchemes[0].type==='noauth'));
  const prompts=await (await post(rpc('prompts/list'))).json();
  assert.deepEqual(prompts.result.prompts.map(p=>p.name),['start_persona_mode']);
  const activation=await (await post(rpc('prompts/get',{name:'start_persona_mode',arguments:{kind:'fictional',language:'ja'}}))).json();
  assert.match(activation.result.messages[0].content.text,/一人称/);
  const bad=await (await post(rpc('prompts/get',{name:'start_persona_mode',arguments:{kind:'arbitrary'}}))).json();
  assert.equal(bad.error.code,-32602);
});
test('Sites MCP calls real and fictional selection and QID lookup', async () => {
  for (const kind of ['real','fictional']) {
    const response = await post(rpc('tools/call', {name:'random_persona',arguments:{kind,language:'ja'}}));
    const result = (await response.json()).result.structuredContent;
    assert.equal(result.status, 'ok');
    assert.equal(result.persona.kind, kind);
    assert.ok(result.persona.sources.some(source => source.purpose === 'article'));
    assert.equal(result.agent_handoff.subject_qid,result.persona.qid);
  }
  const found = await (await post(rpc('tools/call', {name:'get_persona',arguments:{qid:knownQid}}))).json();
  assert.equal(found.result.structuredContent.persona.qid, knownQid);
});
test('Sites MCP rejects malformed arguments and reports missing IDs', async () => {
  const invalid = await (await post(rpc('tools/call', {name:'get_persona',arguments:{qid:knownQid,url:'https://evil.example'}}))).json();
  assert.equal(invalid.result.isError, true);
  const absent = await (await post(rpc('tools/call', {name:'get_persona',arguments:{qid:'Q999999999'}}))).json();
  assert.equal(absent.result.structuredContent.status, 'upstream_unavailable'); // Can't establish nonexistence while Wikidata is offline.
});
test('Sites edge guards host, origin, methods, content, and streamed body size', async () => {
  let response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'evil.example','content-type':'application/json'},body:'{}'}));
  assert.equal(response.status,403);
  response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site',origin:'https://evil.example','content-type':'application/json'},body:'{}'}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  const preflight=await worker.fetch(new Request(url,{method:'OPTIONS',headers:{origin:'https://external.example','access-control-request-method':'POST'}}));
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
  response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site'},body:'{}'}));
  assert.equal(response.status,415);
  const body = new ReadableStream({start(controller){controller.enqueue(new Uint8Array(131073));controller.close();}});
  response = await worker.fetch(new Request(url,{method:'POST',headers:{host:'random-persona-mcp.unjuno.chatgpt.site','content-type':'application/json'},body,duplex:'half'}));
  assert.equal(response.status,413);
});

test('batch, invalid IDs and notifications never trigger live fetches',async()=>{
 let calls=0;
 const isolated=createWorker({liveSource:{random:async()=>{calls++;throw Error('unexpected');}}});
 const send=body=>isolated.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const call=rpc('tools/call',{name:'random_persona'});
 for(const body of [[call,call],{...call,id:{}},{...call,id:null}]){
  assert.equal((await (await send(body)).json()).error.code,-32600);
 }
 delete call.id;
 assert.equal((await send(call)).status,202);
 assert.equal(calls,0);
});
test('MCP request budget returns 429 with Retry-After and resets',async()=>{
 let clock=100000;
 const limited=createWorker({now:()=>clock,maxRequestsPerMinute:1});
 const send=()=>limited.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rpc('ping'))}));
 assert.equal((await send()).status,200);
 const blocked=await send();assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');
 clock+=60000;assert.equal((await send()).status,200);
});
test('a stalled request body is bounded by the read deadline',async()=>{
 const bounded=createWorker({requestTimeoutMs:15});
 const body=new ReadableStream({start(){}});
 const response=await bounded.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'}));
 assert.equal(response.status,408);
});
