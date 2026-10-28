/** Manual live smoke test. Uses only two bounded Wikidata queries and metadata reads. */
import assert from 'node:assert/strict';
import {createLiveWikidata} from '../src/live-wikidata.mjs';
const source=createLiveWikidata({randomIndex:()=>0,timeoutMs:20000});
for(const kind of ['real','fictional']){
 const r=await source.random({kind,language:'ja'});
 assert.equal(r.status,'ok',kind+' live Wikidata sample unavailable: '+JSON.stringify(r));
 assert.equal(r.persona.kind,kind);
 assert.equal(r.source_mode,'wikidata_live');
 assert.ok(r.persona.sources.some(s=>s.purpose==='article'));
 console.log(JSON.stringify({operation:'random',kind,qid:r.persona.qid,sources:r.persona.sources.length,fetched_at:r.fetched_at}));
}
const fetched=await source.get({qid:'Q42',language:'ja'});
assert.equal(fetched.status,'ok');
assert.equal(fetched.persona.qid,'Q42');
console.log(JSON.stringify({operation:'get',qid:fetched.persona.qid,source_mode:fetched.source_mode}));
