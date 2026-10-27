import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpApp, MAX_BODY_BYTES} from '../src/http.mjs';
const origin='http://localhost:3000';
function fixture(options={}) {
 let calls=0;
 const app=createHttpApp({mcp:{fetch:async r=>{calls++;return Response.json({body:await r.json()});},close:async()=>{}},summary:{catalog_version:'fixture',entries:6},allowedHosts:['localhost'],allowedOrigins:[origin],...options});
 return {app,calls:()=>calls};
}
function req(path='/mcp',options={}) {return new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',...options});}
test('HTTP: allowed POST and no-store response',async()=>{const f=fixture();const r=await f.app.fetch(req());assert.equal(r.status,200);assert.equal(f.calls(),1);assert.equal(r.headers.get('cache-control'),'no-store');});
test('HTTP: hostile host/Origin denied before dispatch',async()=>{
 for(const headers of [{'Host':'evil.example'},{'Origin':'https://evil.example'},{'Origin':'null'}]) {const f=fixture();assert.equal((await f.app.fetch(req('/mcp',{headers}))).status,403);assert.equal(f.calls(),0);}
});
test('HTTP: trusted Origin accepted; forwarded headers never grant access',async()=>{
 const f=fixture();assert.equal((await f.app.fetch(req('/mcp',{headers:{'Content-Type':'application/json',Origin:origin}}))).status,200);
 assert.equal((await f.app.fetch(new Request('https://evil.example/mcp',{method:'POST',headers:{'X-Forwarded-Host':'localhost'},body:'{}'}))).status,403);
});
test('HTTP: health and method routing',async()=>{
 const f=fixture();const r=await f.app.fetch(req('/healthz',{method:'GET',body:undefined}));assert.equal((await r.json()).entries,6);
 assert.equal((await f.app.fetch(req('/unknown'))).status,404);
 for(const method of ['GET','DELETE','PUT']) assert.equal((await f.app.fetch(req('/mcp',{method,body:method==='GET'?undefined:'{}'}))).status,405);
});
test('HTTP: content type and encoding restricted',async()=>{
 const f=fixture();assert.equal((await f.app.fetch(req('/mcp',{headers:{'Content-Type':'text/plain'}}))).status,415);
 assert.equal((await f.app.fetch(req('/mcp',{headers:{'Content-Type':'application/json','Content-Encoding':'gzip'}}))).status,415);
});
test('HTTP: body limit counts actual streamed bytes, without trusting Content-Length',async()=>{
 const f=fixture();const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(MAX_BODY_BYTES));c.enqueue(new Uint8Array(1));c.close();}});
 const r=await f.app.fetch(req('/mcp',{body,duplex:'half'}));assert.equal(r.status,413);assert.equal(f.calls(),0);
});
test('HTTP: oversized declared body rejected',async()=>{
 const f=fixture();const r=await f.app.fetch(req('/mcp',{headers:{'Content-Type':'application/json','Content-Length':String(MAX_BODY_BYTES+1)}}));assert.equal(r.status,413);assert.equal(f.calls(),0);
});
test('HTTP: exact body bound is accepted',async()=>{const f=fixture({maxBodyBytes:2});assert.equal((await f.app.fetch(req())).status,200);});
test('HTTP: handler exception hides internal details',async()=>{
 const f=fixture({mcp:{fetch:async()=>{throw Error('private path /credentials');}}});const r=await f.app.fetch(req());assert.equal(r.status,500);assert.ok(!(await r.text()).includes('credentials'));
});
