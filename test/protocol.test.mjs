/** Real TCP + official SDK; no network mocks. Runs in CI after npm install. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createNodeApp} from '../src/server.mjs';
import catalog from '../data/catalog.json' with {type:'json'};
const knownQid=catalog.entries[0].qid;
const realQid=catalog.entries.find(e=>e.kind==='real').qid;
async function setup(t){
 const {server,close}=createNodeApp();server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=new URL(`http://127.0.0.1:${server.address().port}/mcp`);t.after(close);return {url,server};
}
test('MCP: official client discovers tools and calls both over HTTP',async t=>{
 const {url}=await setup(t);const client=new Client({name:'integration-test',version:'1.0.0'});
 try{
  await client.connect(new StreamableHTTPClientTransport(url));
  const {tools}=await client.listTools();assert.deepEqual(tools.map(x=>x.name).sort(),['get_persona','random_persona']);
  for(const tool of tools){assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.openWorldHint,false);assert.equal(tool.inputSchema.additionalProperties,false);}
  for(const kind of ['real','fictional']){
   const r=await client.callTool({name:'random_persona',arguments:{kind,language:'ja'}});assert.ok(!r.isError);assert.equal(r.structuredContent.persona.kind,kind);assert.ok(r.structuredContent.persona.sources.length>=2);assert.deepEqual(JSON.parse(r.content[0].text),r.structuredContent);
  }
  const known=await client.callTool({name:'get_persona',arguments:{qid:knownQid}});assert.equal(known.structuredContent.persona.qid,knownQid);
  const notFound=await client.callTool({name:'get_persona',arguments:{qid:'Q999999999'}});assert.equal(notFound.structuredContent.status,'not_found');
  const exclusion=await client.callTool({name:'random_persona',arguments:{kind:'real',exclude_qids:[realQid]}});assert.notEqual(exclusion.structuredContent.persona.qid,realQid);
  const concurrent=await Promise.all(Array.from({length:10},()=>client.callTool({name:'random_persona',arguments:{}})));assert.equal(concurrent.length,10);
 }finally{await client.close();}
});
test('MCP: invalid arguments fail instead of becoming arbitrary fetches',async t=>{
 const {url}=await setup(t);const client=new Client({name:'bad-input-test',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(url));
  for(const args of [{qid:'https://evil.example'},{qid:knownQid,url:'https://evil.example'}]){let rejected=false;try{const r=await client.callTool({name:'get_persona',arguments:args});rejected=r.isError===true;}catch{rejected=true;}assert.equal(rejected,true);}
 }finally{await client.close();}
});
test('MCP: legacy initialize and tools/list remain compatible',async t=>{
 const {url}=await setup(t);
 const request=async(method,params)=>{
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});
  assert.equal(r.status,200);const text=await r.text();return r.headers.get('content-type').includes('text/event-stream')?JSON.parse(text.split('\n').find(x=>x.startsWith('data:')).slice(5)):JSON.parse(text);
 };
 const init=await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-test',version:'1'}});assert.ok(init.result.serverInfo);
 const list=await request('tools/list',{});assert.equal(list.result.tools.length,2);
});
test('HTTP: actual adapter rejects large requests and hostile origins',async t=>{
 const {url}=await setup(t);
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(131073)});assert.equal(r.status,413);
 const denied=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'});assert.equal(denied.status,403);
 const malformed=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:'{'});assert.equal(malformed.status,400);
});
