import test from 'node:test';
import assert from 'node:assert/strict';
import {SITE_ORIGIN,PREVIEW_MARKER,verifyPublishedSite} from '../src/site-release-check.mjs';
const fingerprint='a'.repeat(64);
const validHealth={status:'ok',release_fingerprint:fingerprint,mode:'wikidata_live_with_catalog_fallback'};
function stub({sha=fingerprint,html='<html><body '+PREVIEW_MARKER+'></body></html>',ping=200,healthCode=200}={}){
 const calls=[];
 const fetchImpl=async(url,request)=>{
  calls.push({url,request});
  assert.ok(url.startsWith(SITE_ORIGIN+'/'));
  assert.equal(request.cache,'no-store');
  assert.ok(request.signal);
  if(url.endsWith('/healthz'))return Response.json({...validHealth,release_fingerprint:sha},{status:healthCode});
  if(url.endsWith('/'))return new Response(html,{status:200,headers:{'Content-Type':'text/html'}});
  if(url.endsWith('/mcp')){
   assert.equal(request.method,'POST');
   assert.equal(request.headers['Content-Type'],'application/json');
   assert.deepEqual(JSON.parse(request.body),{jsonrpc:'2.0',id:1,method:'ping'});
   return ping===200?Response.json({jsonrpc:'2.0',id:1,result:{resultType:'complete'}}):
    new Response('blocked',{status:ping});
  }
  throw Error('unexpected URL');
 };
 return {fetchImpl,calls};
}
test('current Site fingerprint, updated UI and anonymous protocol are distinct green gates',async()=>{
 const {fetchImpl,calls}=stub();
 const result=await verifyPublishedSite({expectedFingerprint:fingerprint,fetchImpl});
 assert.equal(calls.length,3);
 assert.equal(result.deployment.status,'PASS');
 assert.equal(result.anonymous_mcp.status,'PASS');
 assert.equal(result.host_persona.status,'UNCERTAIN');
 assert.equal(result.published_fingerprint,fingerprint);
 assert.equal(result.published_preview_marker,true);
});
test('stale production release is not mistaken for green GitHub CI',async()=>{
 const {fetchImpl}=stub({sha:'b'.repeat(64),html:'<html>旧カードデモ</html>'});
 const r=await verifyPublishedSite({expectedFingerprint:fingerprint,fetchImpl});
 assert.equal(r.deployment.status,'FAIL');
 assert.equal(r.deployment.reason,'stale_worker_fingerprint');
 assert.equal(r.published_preview_marker,false);
});
test('even matching Worker fingerprint cannot conceal old cached LP assets',async()=>{
 const {fetchImpl}=stub({html:'<html>旧バージョン</html>'});
 const r=await verifyPublishedSite({expectedFingerprint:fingerprint,fetchImpl});
 assert.deepEqual(r.deployment,{status:'FAIL',reason:'stale_or_mismatched_landing_page'});
});
test('HTTP 401/403 are access blockers, never evidence of anonymous access',async()=>{
 for(const http of [401,403]){
  const {fetchImpl}=stub({ping:http});
  const r=await verifyPublishedSite({expectedFingerprint:fingerprint,fetchImpl});
  assert.equal(r.deployment.status,'PASS');
  assert.equal(r.anonymous_mcp.status,'FAIL');
  assert.equal(r.anonymous_mcp.http_status,http);
  assert.equal(r.anonymous_mcp.reason,'anonymous_mcp_access_denied');
 }
});
test('unhealthy, invalid and unreachable Site are not advertised as a successful release',async()=>{
 const sick=stub({healthCode:500});
 const r=await verifyPublishedSite({expectedFingerprint:fingerprint,fetchImpl:sick.fetchImpl});
 assert.equal(r.deployment.status,'FAIL');
 const offline=await verifyPublishedSite({expectedFingerprint:fingerprint,
  fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(offline.deployment.status,'UNCERTAIN');
 assert.equal(offline.anonymous_mcp.status,'UNCERTAIN');
});
test('untrusted expected fingerprint and generic HTTP 200 are rejected',async()=>{
 await assert.rejects(verifyPublishedSite({expectedFingerprint:'123'}),/fingerprint/);
 const {fetchImpl}=stub();
 const fake=async(url,init)=>url.endsWith('/mcp')?
  new Response('<html>login page</html>',{status:200}):fetchImpl(url,init);
 const r=await verifyPublishedSite({expectedFingerprint:fingerprint,fetchImpl:fake});
 assert.equal(r.anonymous_mcp.status,'FAIL');
 assert.equal(r.anonymous_mcp.reason,'unexpected_anonymous_mcp_response');
});
