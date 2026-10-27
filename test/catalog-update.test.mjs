import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sample from './fixtures/catalog.json' with {type:'json'};
import {requestMetadata, verifyArticle, refreshCatalog} from '../src/catalog-update.mjs';
import {promoteCatalog, sha256, withCatalogLock} from '../src/catalog-files.mjs';
const source=sample.entries[0].sources[0];
const timestamp='2026-10-28T00:00:00.000Z';
const metadata=(props={wikibase_item:'Q42'},extras={})=>({query:{pages:[{ns:0,pageid:1,title:'Douglas Adams',fullurl:source.url,pageprops:props,...extras}]}});
test('metadata: validates item identity and records a successful check time',async()=>{
 const s=await verifyArticle(source,'Q42',{request:async url=>{assert.equal(url.searchParams.get('prop'),'info|pageprops');assert.ok(!url.search.includes('extracts'));return metadata();},now:()=>new Date(timestamp)});
 assert.equal(s.checked_at,timestamp);assert.equal(s.url,source.url);
});
for(const [name,data] of [['wrong identity',metadata({wikibase_item:'Q1'})],['disambiguation',metadata({wikibase_item:'Q42',disambiguation:''})],['missing',metadata({}, {missing:true})],['non-article',metadata({wikibase_item:'Q42'}, {ns:14})],['section redirect',{...metadata(),query:{...metadata().query,redirects:[{tofragment:'Character'}]}}],['outside host',metadata({wikibase_item:'Q42'},{fullurl:'https://evil.example/wiki/A'})]]){
 test(`metadata: rejects ${name}`,async()=>assert.equal(await verifyArticle(source,'Q42',{request:async()=>data}),null));
}
test('metadata: query redirects are allowed only when final page keeps the QID',async()=>{
 const changed=metadata();changed.query.pages[0].fullurl='https://en.wikipedia.org/wiki/Douglas_Adams_(writer)';changed.query.redirects=[{from:'A',to:'B'}];
 assert.ok(await verifyArticle(source,'Q42',{request:async()=>changed}));
});
test('network: URL allowlist is checked before any fetch',async()=>{
 let n=0;await assert.rejects(()=>requestMetadata(new URL('https://evil.example/w/api.php'),{fetchImpl:async()=>{n++;}}),/endpoint/);assert.equal(n,0);
});
test('network: 429 waits for Retry-After; no clipped early retry',async()=>{
 let n=0;const delays=[];await requestMetadata(new URL('https://www.wikidata.org/w/api.php'),{fetchImpl:async()=>++n===1?new Response('',{status:429,headers:{'Retry-After':'10'}}):Response.json({ok:true}),sleep:async ms=>delays.push(ms)});
 assert.equal(n,2);assert.deepEqual(delays,[10000]);
});
test('network: long Retry-After aborts this run instead of retrying early',async()=>{
 let n=0;await assert.rejects(()=>requestMetadata(new URL('https://www.wikidata.org/w/api.php'),{fetchImpl:async()=>{n++;return new Response('',{status:429,headers:{'Retry-After':'600'}});},sleep:async()=>assert.fail('must not sleep and retry early')}),/Retry-After/);assert.equal(n,1);
});
test('network: maxlag in HTTP 200 is retried; max attempts is bounded',async()=>{
 let n=0;const delays=[];await assert.rejects(()=>requestMetadata(new URL('https://www.wikidata.org/w/api.php'),{fetchImpl:async()=>{n++;return Response.json({error:{code:'maxlag'}});},sleep:async ms=>delays.push(ms)}),/exhausted/);
 assert.equal(n,3);assert.deepEqual(delays,[5000,5000]);
});
test('refresh: invalid duplicate seeds rejected before network',async()=>{
 let n=0;await assert.rejects(()=>refreshCatalog([{qid:'Q42',kind:'real'},{qid:'Q42',kind:'real'}],{request:async()=>{n++;}}),/seed/);assert.equal(n,0);
});
function staged(t){
 const dir=mkdtempSync(join(tmpdir(),'persona-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'catalog.json'),JSON.stringify(sample));writeFileSync(join(dir,'blocked-qids.json'),'["Q42"]');
 const candidate=structuredClone(sample);candidate.version='candidate-fixture';for(const e of candidate.entries)for(const s of e.sources)s.checked_at=timestamp;
 const text=JSON.stringify(candidate);writeFileSync(join(dir,'catalog.pending.json'),text);return {dir,text};
}
test('promotion: requires reviewed flag and exact reviewed bytes',t=>{
 const {dir,text}=staged(t);const original=readFileSync(join(dir,'catalog.json'),'utf8');
 assert.throws(()=>promoteCatalog({dir,expectedSha256:sha256(text)}),/reviewed/);
 assert.throws(()=>promoteCatalog({dir,reviewed:true,expectedSha256:'0'.repeat(64)}),/digest/);
 assert.equal(readFileSync(join(dir,'catalog.json'),'utf8'),original);
});
test('promotion: backs up active version and never rewrites independent block list',t=>{
 const {dir,text}=staged(t);promoteCatalog({dir,reviewed:true,expectedSha256:sha256(text)});
 assert.equal(JSON.parse(readFileSync(join(dir,'catalog.previous.json'))).version,sample.version);
 assert.equal(JSON.parse(readFileSync(join(dir,'catalog.json'))).version,'published-fixture');
 assert.equal(readFileSync(join(dir,'blocked-qids.json'),'utf8'),'["Q42"]');
});
test('promotion: rejects catalog without metadata verification',t=>{
 const {dir}=staged(t);const text=JSON.stringify(sample);writeFileSync(join(dir,'catalog.pending.json'),text);
 assert.throws(()=>promoteCatalog({dir,reviewed:true,expectedSha256:sha256(text)}),/checked_at/);
});
test('catalog writes: lock refuses concurrent publisher and is released',async t=>{
 const {dir}=staged(t);await withCatalogLock(dir,async()=>{await assert.rejects(()=>withCatalogLock(dir,async()=>{}),/already/);});
 await withCatalogLock(dir,async()=>{});
});
test('network: HTTP-date Retry-After is respected',async()=>{
 let n=0;const delays=[];await requestMetadata(new URL('https://www.wikidata.org/w/api.php'),{now:()=>Date.parse(timestamp),fetchImpl:async()=>++n===1?new Response('',{status:503,headers:{'Retry-After':'Wed, 28 Oct 2026 00:00:12 GMT'}}):Response.json({ok:true}),sleep:async ms=>delays.push(ms)});
 assert.deepEqual(delays,[12000]);assert.equal(n,2);
});
test('network: oversized metadata response aborts without retry',async()=>{
 let n=0;await assert.rejects(()=>requestMetadata(new URL('https://www.wikidata.org/w/api.php'),{fetchImpl:async()=>{n++;return new Response(' '.repeat(2097153));},sleep:async()=>assert.fail('no retry')}),/large/);assert.equal(n,1);
});
test('refresh: stages verified identities with language fallback and no article bodies',async()=>{
 const seeds=[{qid:'Q42',kind:'real'},{qid:'Q51746',kind:'fictional'}];const calls=[];
 const entities={
  Q42:{id:'Q42',labels:{en:{value:'Douglas Adams'}},claims:{P31:[{mainsnak:{datavalue:{value:{id:'Q5'}}}}]},sitelinks:{jawiki:{title:'fixture 日本語'},enwiki:{title:'Douglas Adams'}}},
  Q51746:{id:'Q51746',labels:{en:{value:'Fictional fixture'}},claims:{P31:[]},sitelinks:{enwiki:{title:'Fictional fixture'}}}
 };
 const request=async url=>{calls.push(url);
  if(url.hostname==='www.wikidata.org')return {entities};
  if(url.hostname==='ja.wikipedia.org')return {query:{pages:[{ns:0,missing:true}]}};
  const isReal=url.searchParams.get('titles')==='Douglas Adams';
  return {query:{pages:[{ns:0,fullurl:`https://en.wikipedia.org/wiki/${isReal?'Douglas_Adams':'Fictional_fixture'}`,pageprops:{wikibase_item:isReal?'Q42':'Q51746'}}]}};
 };
 const r=await refreshCatalog(seeds,{request,sleep:async()=>{},now:()=>new Date(timestamp)});
 assert.equal(r.catalog.entries.length,2);assert.equal(r.rejected.length,0);assert.equal(calls.length,4);
 for(const e of r.catalog.entries){assert.equal(e.sources[0].language,'en');assert.ok(e.sources.every(s=>s.checked_at===timestamp));assert.ok(!('article_body' in e));}
 assert.ok(calls.every(u=>!u.searchParams.has('extracts')));
});
test('refresh: upstream failure is propagated, not turned into an approved partial catalog',async()=>{
 await assert.rejects(()=>refreshCatalog([{qid:'Q42',kind:'real'}],{request:async()=>{throw Error('upstream unavailable');}}),/upstream unavailable/);
});
