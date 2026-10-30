import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveWikidata} from '../src/live-wikidata.mjs';

const claim=id=>({rank:'normal',mainsnak:{datavalue:{value:{id}}}});
const item=(qid,type)=>({
 id:qid,type:'item',claims:{P31:[claim(type)]},
 labels:{en:{value:'Example '+qid}},
 descriptions:{en:{value:'Verified fixture'}},
 sitelinks:{enwiki:{title:'Example_'+qid}}
});
test('bounded batch discovery returns multiple live Wikidata personas in two API calls',async()=>{
 const entities=Object.fromEntries(['Q901','Q902','Q903'].map(id=>[id,item(id,'Q5')]));
 const calls=[];
 const fetchImpl=async raw=>{
  const u=new URL(raw);calls.push(u);
  if(u.hostname==='query.wikidata.org')return Response.json({results:{bindings:
   Object.keys(entities).map(id=>({item:{value:'http://www.wikidata.org/entity/'+id}}))}});
  if(u.hostname==='www.wikidata.org')return Response.json({entities});
  throw Error('unexpected');
 };
 const src=createLiveWikidata({fetchImpl,randomIndex:()=>0});
 const result=await src.discoverBatch({kind:'real',language:'en',exclude_qids:['Q902']});
 assert.equal(result.status,'ok');
 assert.equal(result.source_mode,'wikidata_live');
 assert.deepEqual(result.personas.map(p=>p.qid),['Q901','Q903']);
 assert.equal(calls.length,2);
 assert.match(calls[0].searchParams.get('query'),/LIMIT 4 OFFSET/);
 assert.equal(calls[1].searchParams.get('ids'),'Q901|Q903');
});
test('batch discovery fails closed on invalid inputs and refuses an unbounded query',async()=>{
 let calls=0;
 const src=createLiveWikidata({fetchImpl:async()=>{calls++;return Response.json({});}});
 await assert.rejects(()=>src.discoverBatch({kind:'all'}),/kind|Invalid/i);
 await assert.rejects(()=>src.discoverBatch({kind:'real',exclude_qids:['Q0']}),/QID|Invalid/i);
 assert.equal(calls,0);
});
