import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import mcp from '../api/mcp.mjs';
import health from '../api/healthz.mjs';

const domain='https://random-persona-open-mcp.vercel.app';
test('Vercel API health returns anonymous MCP state without Site authentication',async()=>{
 const response=await health.fetch(new Request(domain+'/api/healthz',{method:'GET'}));
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.authentication,'none');
 assert.equal(data.mcp_endpoint,'/mcp');
 assert.equal(data.fallback_catalog.entries,300);
});
test('rewritten public MCP endpoint rejects GET but does not require a bearer token',async()=>{
 const get=await mcp.fetch(new Request(domain+'/api/mcp',{method:'GET'}));
 assert.equal(get.status,405);
 assert.notEqual(get.status,401);
 const preflight=await mcp.fetch(new Request(domain+'/api/mcp',{
  method:'OPTIONS',headers:{Origin:'https://chatgpt.com','Access-Control-Request-Method':'POST'}
 }));
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('access-control-allow-origin'),'https://chatgpt.com');
});
test('Vercel project config deploys only the MCP API, not a duplicated landing page',()=>{
 const settings=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
 assert.equal(settings.framework,null);
 assert.ok(settings.rewrites.some(x=>x.source==='/mcp'&&x.destination==='/api/mcp'));
 assert.ok(settings.rewrites.some(x=>x.source==='/healthz'&&x.destination==='/api/healthz'));
 assert.ok(settings.redirects.some(x=>x.source==='/'&&x.destination==='https://random-persona-mcp.unjuno.chatgpt.site'));
 const ignore=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8');
 assert.match(ignore,/^public$/m);
 assert.match(ignore,/^sites$/m);
 assert.doesNotMatch(ignore,/^src$/m);
 assert.doesNotMatch(ignore,/^data$/m);
});
