/** Public, anonymous, standard MCP contract. The existing ChatGPT Site is not involved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createPublicMcpApp} from '../src/public-mcp.mjs';

const identity={
 qid:'Q90000999',name:'Open Wikidata example',kind:'fictional',
 description:'A verified fictional example',
 sources:[
  {url:'https://en.wikipedia.org/wiki/Example',language:'en',purpose:'article'},
  {url:'https://www.wikidata.org/wiki/Q90000999',language:'mul',purpose:'identity'}
 ]
};
const result={status:'ok',persona:identity,catalog_version:'wikidata-live',source_mode:'wikidata_live'};
const live={random:async()=>result,get:async()=>result};
function makeApp(other={}){
 return createPublicMcpApp({
  liveSource:live,allowedHosts:['public.example','127.0.0.1'],
  allowedOrigins:['https://chatgpt.com','https://claude.ai'],
  maxCallsPerMinute:20,
  ...other
 });
}
const endpoint='https://public.example/mcp';
const rpc=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
const post=(app,body,headers={})=>app.fetch(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...headers},body:JSON.stringify(body)}));

test('public health is anonymous and does not mistake fallback entries for draw universe',async()=>{
 const app=makeApp();
 const response=await app.fetch(new Request('https://public.example/healthz'));
 assert.equal(response.status,200);
 const health=await response.json();
 assert.equal(health.authentication,'none');
 assert.equal(health.mode,'wikidata_live_with_catalog_fallback');
 assert.equal(health.fallback_catalog.entries,300);
 assert.equal(health.entries,undefined);
 assert.equal(health.mcp_endpoint,'/mcp');
 await app.close();
});

test('public endpoint is usable with no API key, bearer header, OAuth or cookies',async()=>{
 const app=makeApp();
 const init=await post(app,rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'anonymous-client',version:'1'}}));
 assert.equal(init.status,200);
 const initJson=await init.json();
 assert.equal(initJson.result.serverInfo.name,'random-persona-public');
 const listed=await (await post(app,rpc('tools/list'))).json();
 assert.deepEqual(listed.result.tools.map(x=>x.name).sort(),['get_persona','random_persona']);
 const called=await (await post(app,rpc('tools/call',{name:'random_persona',arguments:{kind:'both',language:'ja'}}))).json();
 const data=called.result.structuredContent;
 assert.equal(data.persona.qid,identity.qid);
 assert.equal(data.source_mode,'wikidata_live');
 assert.match(data.roleplay_prompt,/Open Wikidata example/);
 assert.match(data.roleplay_prompt,/https:\/\/en.wikipedia.org\/wiki\/Example/);
 assert.match(data.roleplay_prompt,/仮想対話/);
 const got=await (await post(app,rpc('tools/call',{name:'get_persona',arguments:{qid:identity.qid}}))).json();
 assert.equal(got.result.structuredContent.persona.qid,identity.qid);
 await app.close();
});

test('public MCP exposes a reusable prompt without requiring users to write a long persona prompt',async()=>{
 const app=makeApp();
 const prompts=(await (await post(app,rpc('prompts/list'))).json()).result.prompts;
 assert.ok(prompts.some(x=>x.name==='start_random_persona'));
 const selected=(await (await post(app,rpc('prompts/get',{name:'start_random_persona',arguments:{kind:'fictional'}}))).json()).result;
 assert.match(selected.messages[0].content.text,/random_persona/);
 assert.match(selected.messages[0].content.text,/Wikipedia/);
 await app.close();
});

test('outages fall back visibly and do not turn uncataloged QIDs into false not_found',async()=>{
 const app=makeApp({liveSource:{random:async()=>{throw Error('Wikidata offline');},get:async()=>{throw Error('Wikidata offline');}}});
 const random=await (await post(app,rpc('tools/call',{name:'random_persona',arguments:{kind:'real'}}))).json();
 const outcome=random.result.structuredContent;
 assert.equal(outcome.status,'ok');
 assert.equal(outcome.source_mode,'catalog_fallback');
 assert.equal(outcome.fallback_reason,'wikidata_unavailable');
 assert.ok(outcome.roleplay_prompt.includes(outcome.persona.qid));
 const get=await (await post(app,rpc('tools/call',{name:'get_persona',arguments:{qid:'Q90000999'}}))).json();
 assert.equal(get.result.structuredContent.status,'upstream_unavailable');
 await app.close();
});

test('public no-auth surface strictly validates origins, hosts, request body and preflight',async()=>{
 const app=makeApp();
 assert.equal((await post(app,rpc('ping'),{Origin:'https://attacker.example'})).status,403);
 assert.equal((await app.fetch(new Request('https://attacker.example/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}))).status,403);
 const preflight=await app.fetch(new Request(endpoint,{method:'OPTIONS',headers:{Origin:'https://chatgpt.com','Access-Control-Request-Method':'POST'}}));
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('access-control-allow-origin'),'https://chatgpt.com');
 const denied=await app.fetch(new Request(endpoint,{method:'OPTIONS',headers:{Origin:'https://attacker.example'}}));
 assert.equal(denied.status,403);
 const big=await app.fetch(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(131073)}));
 assert.equal(big.status,413);
 const wrong=await app.fetch(new Request(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}));
 assert.equal(wrong.status,415);
 const nope=await app.fetch(new Request('https://public.example/secret'));
 assert.equal(nope.status,404);
 await app.close();
});

test('anonymous tool calls are throttled per instance without requiring accounts',async()=>{
 let time=500000;
 const app=makeApp({now:()=>time,maxCallsPerMinute:2});
 const ping=()=>post(app,rpc('ping'));
 assert.equal((await ping()).status,200);
 assert.equal((await ping()).status,200);
 const blocked=await ping();
 assert.equal(blocked.status,429);
 assert.ok(Number(blocked.headers.get('retry-after'))>=1);
 time+=60000;
 assert.equal((await ping()).status,200);
 await app.close();
});

test('real MCP SDK client connects over loopback TCP without credentials and sees prompts/tools',async t=>{
 const app=makeApp();
 const server=createServer(async (req,res)=>{
  try{
   const chunks=[];for await (const chunk of req)chunks.push(chunk);
   const headers=new Headers(req.headers);
   headers.set('host','public.example');
   const out=await app.fetch(new Request('https://public.example'+req.url,{
    method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})
   }));
   res.writeHead(out.status,Object.fromEntries(out.headers));
   res.end(Buffer.from(await out.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(String(error));}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await app.close();await new Promise(resolve=>server.close(resolve));});
 const client=new Client({name:'public-client',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp')));
  const {tools}=await client.listTools();
  assert.deepEqual(tools.map(x=>x.name).sort(),['get_persona','random_persona']);
  assert.ok(tools.every(x=>x.annotations.readOnlyHint));
  const {prompts}=await client.listPrompts();
  assert.ok(prompts.some(x=>x.name==='start_random_persona'));
  const random=await client.callTool({name:'random_persona',arguments:{kind:'both'}});
  assert.equal(random.structuredContent.persona.qid,identity.qid);
  assert.match(random.structuredContent.roleplay_prompt,/https:\/\/en.wikipedia.org/);
 }finally{await client.close();}
});
