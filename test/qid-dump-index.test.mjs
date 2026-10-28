import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {sampleDumpQidIndex} from '../src/dump-sampler.mjs';
import {validatePersonaIndex} from '../src/persona-index.mjs';
const claim=id=>({mainsnak:{datavalue:{value:{id}}},rank:'normal'});
const item=(id,cls)=>({
 id:'Q'+id,type:'item',claims:{P31:[claim(cls)]},
 labels:{en:{value:'Person '+id}},
 descriptions:{en:{value:'Fixture subject'}},
 sitelinks:{enwiki:{title:'Person_'+id}}
});
const stream=entries=>Readable.from(['[\n',...entries.map((x,i)=>JSON.stringify(x)+(i<entries.length-1?',':'')+'\n'),']\n']);
test('full-dump reservoir scans all entries and saves QIDs only',async()=>{
 const items=[
  ...Array.from({length:40},(_,i)=>item(i+100,'Q5')),
  ...Array.from({length:60},(_,i)=>item(i+200,'Q15632617'))
 ];
 const {index,counts}=await sampleDumpQidIndex(stream(items),{perKind:12,randomInt:()=>0,version:'dump-2026-10-28'});
 validatePersonaIndex(index);
 assert.equal(counts.seen,100);
 assert.deepEqual(index.population,{real:40,fictional:60});
 assert.equal(index.qids.real.length,12);
 assert.equal(index.qids.fictional.length,12);
 assert.equal(index.qids.real.at(-1),'Q139');
 assert.equal(index.qids.fictional.at(-1),'Q259');
 assert.equal(JSON.stringify(index).includes('Person_'),false);
 assert.equal(new Set([...index.qids.real,...index.qids.fictional]).size,24);
});
test('incomplete dump must never be accepted as an approved index',async()=>{
 await assert.rejects(()=>sampleDumpQidIndex(Readable.from(['[\n',JSON.stringify(item(300,'Q5'))+'\n']),{perKind:4}),/terminating bracket/);
 await assert.rejects(()=>sampleDumpQidIndex(Readable.from(['[\n',JSON.stringify(item(300,'Q5'))+',\n','{INVALID}\n',']\n']),{perKind:4}),/JSON/);
 await assert.rejects(()=>sampleDumpQidIndex(stream([item(301,'Q5')]),{perKind:4}),/both/i);
});
test('caps pool sizes and refuses a synthetically aborted reservoir',async()=>{
 await assert.rejects(()=>sampleDumpQidIndex(stream([]),{perKind:0}),/perKind/);
});
