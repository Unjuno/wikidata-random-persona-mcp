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
