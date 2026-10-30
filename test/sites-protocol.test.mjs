/** Official SDK against the built Sites Fetch entry over real local HTTP. Upstream is fault-injected. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createWorker} from '../dist/server/index.js';
import catalog from '../data/catalog.json' with {type:'json'};
test('built Sites worker is compatible with the official MCP client',async t=>{
 let automaticDraws=0;
 const worker=createWorker({liveSource:{random:async()=>{automaticDraws++;throw Error('offline fixture');},get:async()=>{throw Error('offline fixture');}}});
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const headers=new Headers(req.headers);headers.set('host','random-persona-mcp.unjuno.chatgpt.site');
  const result=await worker.fetch(new Request('https://random-persona-mcp.unjuno.chatgpt.site'+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}));
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 for(const mode of ['legacy','auto']){
 const client=new Client({name:'sites-release-test',version:'1'},{versionNegotiation:{mode}});
 try{
  const before=automaticDraws;
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`)));
  assert.equal(automaticDraws,before+1,'connecting through the official MCP SDK must automatically draw a person');
  if(typeof client.getInstructions==='function'){
    assert.match(client.getInstructions()??'',/CONNECTION_PERSONA_JSON/);
  }
  const {tools}=await client.listTools();assert.deepEqual(tools.map(t=>t.name),['random_persona','get_persona']);
  assert.ok(tools.every(t=>t.annotations.readOnlyHint));
  const random=await client.callTool({name:'random_persona',arguments:{kind:'fictional'}});
  assert.equal(random.structuredContent.persona.kind,'fictional');assert.equal(random.structuredContent.source_mode,'catalog_fallback');
  const found=await client.callTool({name:'get_persona',arguments:{qid:catalog.entries[0].qid}});
  assert.equal(found.structuredContent.persona.qid,catalog.entries[0].qid);
 }finally{await client.close();}
 }
});
