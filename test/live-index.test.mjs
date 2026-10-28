import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveWikidata} from '../src/live-wikidata.mjs';

const idx={version:'dump-2026-10-28',source:'Wikidata JSON dump',complete_scan:true,
 population:{real:5,fictional:15},qids:{real:['Q76543210','Q76543211'],fictional:['Q90000110','Q90000111']}};
const claim=id=>({mainsnak:{datavalue:{value:{id}}},rank:'normal'});
function makeFetch(){
 const calls=[];
 const fetchImpl=async raw=>{
  const url=new URL(raw);calls.push(url);
  if(url.hostname==='query.wikidata.org')throw Error('Index sampling must not call WDQS');
  const id=url.searchParams.get('ids');
  const fictional=id.startsWith('Q900');
  return Response.json({entities:{[id]:{id,type:'item',claims:{P31:[claim(fictional?'Q15632617':'Q5')]},
   labels:{en:{value:'Sample '+id}},sitelinks:{enwiki:{title:'Sample_'+id}}}}});
 };
 return {calls,fetchImpl};
}
test('full-dump reservoir selection draws a QID and refreshes its metadata live without WDQS',async()=>{
 const f=makeFetch();
 const randoms=[0,1]; // population-weighted choose real, then pick 2nd real QID
 const live=createLiveWikidata({index:idx,fetchImpl:f.fetchImpl,randomIndex:size=>randoms.shift(),now:()=>new Date('2026-10-28T00:00:00Z')});
 const r=await live.random({kind:'both',language:'en'});
 assert.equal(r.status,'ok');
 assert.equal(r.persona.qid,'Q76543211');
 assert.equal(r.source_mode,'wikidata_live');
 assert.equal(r.sampling_method,'wikidata_dump_reservoir');
 assert.equal(r.index_version,idx.version);
 assert.equal(r.eligible_population,20);
 assert.equal(r.selection_scope.includes('not all Wikidata'),true);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].hostname,'www.wikidata.org');
});
test('population weighting chooses fictional despite equal-sized reservoirs',async()=>{
 const f=makeFetch(),randoms=[5,0];
 const live=createLiveWikidata({index:idx,fetchImpl:f.fetchImpl,randomIndex:size=>randoms.shift()});
 const r=await live.random({kind:'both'});
 assert.equal(r.persona.kind,'fictional');
 assert.equal(r.persona.qid,'Q90000110');
 assert.equal(f.calls.length,1);
});
test('excluded and blocked QIDs are never fetched; no candidate returns no_match without network',async()=>{
 const f=makeFetch();
 const live=createLiveWikidata({index:idx,fetchImpl:f.fetchImpl,randomIndex:()=>0});
 const r=await live.random({kind:'real',exclude_qids:['Q76543210','Q76543211']});
 assert.equal(r.status,'no_match');
 assert.equal(f.calls.length,0);
 const second=await live.random({kind:'fictional',exclude_qids:['Q90000110']},{blockedQids:['Q90000111']});
 assert.equal(second.status,'no_match');
 assert.equal(f.calls.length,0);
});
test('unapproved index is never silently trusted',()=>{
 assert.throws(()=>createLiveWikidata({index:{...idx,complete_scan:false}}),/index|complete/i);
});
