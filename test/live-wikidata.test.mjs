import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveWikidata} from '../src/live-wikidata.mjs';

const claim=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const record=(id,type,article=true)=>({id,type:'item',claims:{P31:[claim(type)]},labels:{ja:{value:'人物'+id}},descriptions:{ja:{value:'Wikidata人物'}},sitelinks:article?{jawiki:{title:'人物_'+id},enwiki:{title:'Person_'+id}}:{}});
function fake(entities,{status=200}={}){
 const calls=[];
 const fetchImpl=async(input,opts)=>{
  const url=new URL(input);calls.push({url,opts});
  if(status!==200)return Response.json({error:'throttle'},{status,headers:{'Retry-After':'60'}});
  if(url.hostname==='query.wikidata.org'){
   const cls=url.searchParams.get('query').match(/wd:(Q\d+)/)?.[1];
   return Response.json({results:{bindings:Object.values(entities).filter(e=>e.claims.P31.some(c=>c.mainsnak.datavalue.value.id===cls)).map(e=>({item:{value:'http://www.wikidata.org/entity/'+e.id}}))}});
  }
  if(url.hostname==='www.wikidata.org'){
   const ids=url.searchParams.get('ids').split('|');
   return Response.json({entities:Object.fromEntries(ids.filter(x=>entities[x]).map(x=>[x,entities[x]]))});
  }
  throw Error('Unapproved test URL: '+input);
 };
 return {fetchImpl,calls};
}
test('live random draws from Wikidata queries, including QIDs missing from the 300 catalog',async()=>{
 const qid='Q87654321',f=fake({[qid]:record(qid,'Q5')});
 const source=createLiveWikidata({fetchImpl:f.fetchImpl,randomIndex:()=>0,now:()=>new Date('2026-10-28T00:00:00.000Z')});
 const result=await source.random({kind:'real',language:'ja'});
 assert.equal(result.persona.qid,qid);
 assert.equal(result.source_mode,'wikidata_live');
 assert.equal(result.fetched_at,'2026-10-28T00:00:00.000Z');
 assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].url.hostname,'query.wikidata.org');
 assert.equal(f.calls[1].url.hostname,'www.wikidata.org');
 assert.equal(f.calls[1].url.searchParams.get('sitefilter'),'jawiki|enwiki');
});
test('fictional filtering, excluded QIDs and source priority',async()=>{
 const a='Q90000001',b='Q90000002',f=fake({[a]:record(a,'Q15632617'),[b]:record(b,'Q15632617')});
 const source=createLiveWikidata({fetchImpl:f.fetchImpl,randomIndex:()=>0});
 const result=await source.random({kind:'fictional',language:'en',exclude_qids:[a]});
 assert.equal(result.persona.qid,b);
 assert.equal(result.persona.kind,'fictional');
 assert.equal(result.persona.sources[0].language,'en');
});
test('get resolves arbitrary Wikidata QIDs and suppresses ineligible or suspended QIDs',async()=>{
 const q='Q12345001',bad='Q12345002';
 const f=fake({[q]:record(q,'Q5'),[bad]:record(bad,'Q42')});
 const source=createLiveWikidata({fetchImpl:f.fetchImpl});
 assert.equal((await source.get({qid:q})).persona.qid,q);
 assert.equal((await source.get({qid:bad})).status,'not_found');
 assert.equal((await source.get({qid:q},{blockedQids:[q]})).status,'not_found');
 assert.equal(f.calls.length,2);
});
test('invalid input does not contact Wikimedia',async()=>{
 const f=fake({});
 const source=createLiveWikidata({fetchImpl:f.fetchImpl});
 await assert.rejects(()=>source.get({qid:'https://example.com'}),/QID|invalid/i);
 await assert.rejects(()=>source.random({kind:'real',exclude_qids:['Q0']}),/QID|invalid/i);
 assert.equal(f.calls.length,0);
});
test('a 429 stops Wikidata calls and raises an upstream error',async()=>{
 const f=fake({},{status:429}),source=createLiveWikidata({fetchImpl:f.fetchImpl});
 await assert.rejects(()=>source.random({kind:'real'}),/429|upstream|Wikidata|rate/i);
 assert.equal(f.calls.length,1);
});

test('Retry-After and isolate budget prevent subsequent upstream requests',async()=>{
 let clock=Date.parse('2026-10-28T00:00:00Z');
 const f=fake({},{status:429});
 const source=createLiveWikidata({fetchImpl:f.fetchImpl,now:()=>new Date(clock)});
 await assert.rejects(()=>source.get({qid:'Q42'}),/429/);
 await assert.rejects(()=>source.get({qid:'Q42'}),/cooldown/);
 assert.equal(f.calls.length,1);
 clock+=61000;
 await assert.rejects(()=>source.get({qid:'Q42'}),/429/);
 assert.equal(f.calls.length,2);
 const g=fake({Q42:record('Q42','Q5')});
 const limited=createLiveWikidata({fetchImpl:g.fetchImpl,maxRequestsPerMinute:1});
 await limited.get({qid:'Q42'});
 await assert.rejects(()=>limited.get({qid:'Q42'}),/budget/);
 assert.equal(g.calls.length,1);
});
test('missing entity is distinct from malformed or mismatched identity response',async()=>{
 for(const entities of [{},{Q42:record('Q99','Q5')}]){
  const s=createLiveWikidata({fetchImpl:async()=>Response.json({entities})});
  await assert.rejects(()=>s.get({qid:'Q42'}),/mismatch/);
 }
 const s=createLiveWikidata({fetchImpl:async()=>Response.json({entities:{Q42:{id:'Q42',missing:''}}})});
 assert.equal((await s.get({qid:'Q42'})).status,'not_found');
});
test('ambiguous, deprecated and disambiguation classifications are not returned',async()=>{
 for(const claims of [[claim('Q5'),claim('Q15632617')],[{...claim('Q5'),rank:'deprecated'}],[claim('Q5'),claim('Q4167410')]]){
  const entity=record('Q42','Q5');entity.claims.P31=claims;
  const f=fake({Q42:entity}),s=createLiveWikidata({fetchImpl:f.fetchImpl});
  assert.equal((await s.get({qid:'Q42'})).status,'not_found');
 }
});
test('upstream body limit, invalid JSON and a hanging fetch fail boundedly',async()=>{
 for(const response of [new Response(' '.repeat(2*1024*1024+1)),new Response('{bad')]){
  const s=createLiveWikidata({fetchImpl:async()=>response});
  await assert.rejects(()=>s.get({qid:'Q42'}));
 }
 const s=createLiveWikidata({fetchImpl:()=>new Promise(()=>{}),timeoutMs:15});
 await assert.rejects(()=>s.get({qid:'Q42'}),/timeout/);
});
test('concurrent request budget is released after completion',async()=>{
 let finish;
 const source=createLiveWikidata({maxConcurrent:1,fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});
 const first=source.get({qid:'Q42'});
 await assert.rejects(()=>source.get({qid:'Q42'}),/budget/);
 finish(Response.json({entities:{Q42:record('Q42','Q5')}}));await first;
});
test('exact no-such-entity API errors become not_found, unrelated errors do not',async()=>{
 for(const id of ['Q999999999999','Q42']){
  const s=createLiveWikidata({fetchImpl:async()=>Response.json({error:{code:'no-such-entity',id}})});
  if(id==='Q999999999999')assert.equal((await s.get({qid:id})).status,'not_found');
  else await assert.rejects(()=>s.get({qid:'Q999999999999'}),/upstream/);
 }
});
test('Worker-compatible manual redirect policy rejects redirects without following Location',async()=>{
 let count=0;
 const s=createLiveWikidata({fetchImpl:async(_url,options)=>{
  count++;assert.equal(options.redirect,'manual');
  return new Response(null,{status:302,headers:{location:'https://evil.example/article'}});
 }});
 await assert.rejects(()=>s.get({qid:'Q42'}),/HTTP 302/);assert.equal(count,1);
});
test('oversized candidate lists cannot amplify the entity metadata batch',async()=>{
 const entities=Object.fromEntries(Array.from({length:12},(_,i)=>['Q'+(90001000+i),record('Q'+(90001000+i),'Q5')]));
 const f=fake(entities),s=createLiveWikidata({fetchImpl:f.fetchImpl,randomIndex:()=>0});
 await s.random({kind:'real'});
 assert.match(f.calls[0].url.searchParams.get('query'),/LIMIT 4 OFFSET/);
 assert.equal(f.calls[1].url.searchParams.get('ids').split('|').length,4);
});


test('read-only entity lookup tolerates modest replica lag while retaining a maxlag limit',async()=>{
 const observed=[];
 const source=createLiveWikidata({
  fetchImpl:async url=>{
   const lag=Number(new URL(url).searchParams.get('maxlag'));
   observed.push(lag);
   if(lag<8)return Response.json({error:{code:'maxlag',info:'Query replica lagged 7.3 seconds'}});
   return Response.json({entities:{Q42:record('Q42','Q5')}});
  }
 });
 const found=await source.get({qid:'Q42'});
 assert.equal(found.status,'ok');
 assert.equal(found.persona.qid,'Q42');
 assert.deepEqual(observed,[15]); // Bounded tolerance, no maxlag disabling.
});
test('Wikidata read-side maxlag threshold must be bounded and explicit',()=>{
 assert.throws(()=>createLiveWikidata({maxlagSeconds:0}),/maxlag/i);
 assert.throws(()=>createLiveWikidata({maxlagSeconds:1000}),/maxlag/i);
});
