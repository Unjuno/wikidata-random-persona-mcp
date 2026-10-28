import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapCatalog,buildSparql} from '../src/bootstrap-wikidata.mjs';
const stmt=id=>({mainsnak:{datavalue:{value:{id}}}});
const item=(qid,type)=>({id:qid,claims:{P31:[stmt(type)]},labels:{ja:{value:'人物'+qid}},descriptions:{en:{value:'Wikidata entity'}},sitelinks:{jawiki:{title:'人物'+qid},enwiki:{title:'Person_'+qid}}});
test('Wikidata query is scoped by direct P31 and never ORDER BY RAND',()=>{
 const q=buildSparql('Q15632617',300);
 assert.match(q,/wdt:P31 wd:Q15632617/);
 assert.match(q,/LIMIT 300/);
 assert.doesNotMatch(q,/ORDER BY RAND/i);
 assert.throws(()=>buildSparql('Q0',100),/type/i);
});
test('bootstrap gathers distinct real and fictional entries beyond six',async()=>{
 const results={Q5:Array.from({length:24},(_,i)=>'Q'+(i+100)),Q15632617:Array.from({length:24},(_,i)=>'Q'+(i+300))};
 const seen=[];
 const out=await bootstrapCatalog({perKind:10,classes:[{id:'Q5',kind:'real'},{id:'Q15632617',kind:'fictional'}],
  queryIds:async id=>results[id],getEntities:async ids=>{
   seen.push(...ids);
   return Object.fromEntries(ids.map(qid=>[qid,item(qid,Number(qid.slice(1))<200?'Q5':'Q15632617')]));
  },randomIndex:()=>0,sleep:async()=>{}});
 assert.equal(out.catalog.entries.length,20);
 assert.equal(out.catalog.entries.filter(x=>x.kind==='real').length,10);
 assert.equal(out.catalog.entries.filter(x=>x.kind==='fictional').length,10);
 assert.equal(new Set(out.catalog.entries.map(x=>x.qid)).size,20);
 assert.ok(seen.includes('Q123')&&seen.includes('Q323'));
 assert.ok(out.catalog.entries.every(x=>x.sources.some(s=>s.purpose==='identity')));
});
test('bootstrap fails rather than publish mislabeled fictional characters',async()=>{
 const error=await bootstrapCatalog({perKind:4,classes:[{id:'Q5',kind:'real'},{id:'Q15632617',kind:'fictional'}],
  queryIds:async id=>id==='Q5'?['Q10','Q11']:['Q20','Q21'],
  getEntities:async ids=>Object.fromEntries(ids.map(qid=>[qid,item(qid,'Q5')])),
  sleep:async()=>{}}).catch(e=>e);
 assert.match(String(error),/both real and fictional/);
});

test('bootstrap accepts slim Wikidata metadata because scoped query proved P31',async()=>{
 const qids={Q5:['Q10','Q11'],Q15632617:['Q20','Q21']};
 const r=await bootstrapCatalog({perKind:2,classes:[{id:'Q5',kind:'real'},{id:'Q15632617',kind:'fictional'}],
  queryIds:async id=>qids[id],getEntities:async ids=>Object.fromEntries(ids.map(qid=>{
   const entry=item(qid,'Q5');delete entry.claims;return [qid,entry];
  })),sleep:async()=>{}});
 assert.equal(r.catalog.entries.length,4);
});
