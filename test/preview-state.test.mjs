import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPreviewState,transitionPreview,readPersonaReference,PREVIEW_STATES} from '../public/assets/preview-state.js';
const step=(state,type,persona)=>transitionPreview(state,{type,...(persona?{persona}:{})});
const source='https://en.wikipedia.org/wiki/Douglas_Adams';
const persona={qid:'Q42',name:'Douglas Adams',kind:'real',description:'writer',sources:[
  {purpose:'article',language:'en',url:source},
  {purpose:'identity',language:'mul',url:'https://www.wikidata.org/wiki/Q42'}
 ]};
const response=p=>({result:{structuredContent:{status:'ok',persona:p,source_mode:'wikidata_live'}}});

test('browser preview has explicit legal transitions and never claims to be an agent',()=>{
 assert.deepEqual(PREVIEW_STATES,['idle','loading','reference_ready','access_denied','rate_limited','empty','error']);
 const idle=initialPreviewState();
 assert.equal(idle.phase,'idle');
 const loading=step(idle,'REQUEST');
 assert.equal(loading.phase,'loading');
 assert.strictEqual(step(loading,'REQUEST'),loading);
 assert.throws(()=>step(idle,'READY',{qid:'Q42',name:'x',article_url:source}),/requires loading/);
 const ref=readPersonaReference(response(persona));
 const ready=step(loading,'READY',ref);
 assert.equal(ready.phase,'reference_ready');
 assert.equal(ready.persona.qid,'Q42');
 assert.equal(ready.persona.article_url,source);
 assert.equal(step(ready,'RESET').phase,'idle');
 assert.equal(step(ready,'REQUEST').phase,'loading');
});
test('browser preview distinguishes external access restrictions, throttling, no match and errors',()=>{
 const busy=step(initialPreviewState(),'REQUEST');
 assert.equal(step(busy,'ACCESS_DENIED').phase,'access_denied');
 assert.equal(step(busy,'RATE_LIMIT').phase,'rate_limited');
 assert.equal(step(busy,'NO_MATCH').phase,'empty');
 assert.equal(step(busy,'FAIL').phase,'error');
 for(const typ of ['ACCESS_DENIED','RATE_LIMIT','NO_MATCH','FAIL']){
  const next=step(busy,typ);
  assert.ok(next.message.length>0);
  assert.equal(step(next,'REQUEST').phase,'loading');
 }
});
test('browser preview rejects malformed and malicious source links',()=>{
 const bad=[
  'http://ja.wikipedia.org/wiki/X',
  'https://evil.example/wiki/X',
  'https://ja.wikipedia.org.evil.example/wiki/X',
  'https://ja.wikipedia.org/wiki/X?redirect=https://evil.example',
  'https://ja.wikipedia.org/wiki/X%2fY',
  'https://ja.wikipedia.org/',
  'javascript:alert(1)'
 ];
 for(const url of bad)assert.throws(()=>readPersonaReference(response({...persona,sources:[{purpose:'article',url}]})),/safe article link/,url);
 assert.throws(()=>readPersonaReference(response({...persona,qid:'Q0'})),/Invalid persona fields/);
 assert.throws(()=>readPersonaReference(response({...persona,kind:'unknown'})),/Invalid persona fields/);
 assert.throws(()=>readPersonaReference({result:{isError:true}}),/error/);
 assert.throws(()=>readPersonaReference({error:{code:-32600}}),/error/);
 assert.equal(readPersonaReference({result:{structuredContent:{status:'no_match'}}}),null);
});
