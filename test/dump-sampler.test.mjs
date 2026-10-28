import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {sampleDump,eligibleDumpEntity,parseDumpRecord} from '../src/dump-sampler.mjs';
const stmt=id=>({mainsnak:{datavalue:{value:{id}}},rank:'normal'});
const item=(n,id,options={})=>({type:'item',id:'Q'+n,claims:{P31:[stmt(id)]},labels:{en:{value:'Name '+n}},descriptions:{en:{value:'About '+n}},sitelinks:{enwiki:{title:'Name '+n},...(options.ja?{jawiki:{title:'人物 '+n}}:{})},...options.override});
const dump=entries=>Readable.from(['[\n',...entries.map((x,i)=>JSON.stringify(x)+(i<entries.length-1?',':'')+'\n'),']\n']);
test('dump JSON lines handle array commas and fail closed on corrupt JSON',()=>{
 assert.equal(parseDumpRecord('['),null);
 assert.equal(parseDumpRecord(']'),null);
 assert.deepEqual(parseDumpRecord(' {"id":"Q7"}, '),{id:'Q7'});
 assert.throws(()=>parseDumpRecord('{bad}'),/JSON/);
});
test('real and fictional are classified from Wikidata P31 rather than a six-ID seed',()=>{
 assert.equal(eligibleDumpEntity(item(30,'Q5')).kind,'real');
 assert.equal(eligibleDumpEntity(item(31,'Q15632617')).kind,'fictional');
 assert.equal(eligibleDumpEntity(item(32,'Q80447738')).kind,'fictional');
 assert.equal(eligibleDumpEntity(item(33,'Q87576284')).kind,'fictional');
 assert.equal(eligibleDumpEntity(item(34,'Q42')),null);
 assert.equal(eligibleDumpEntity(item(35,'Q5',{override:{sitelinks:{}}})),null);
 assert.equal(eligibleDumpEntity(item(36,'Q5',{override:{claims:{P31:[stmt('Q5'),stmt('Q15632617')]}}})),null);
});
test('sitelinks yield bilingual article URLs, QID identity URL, no article bodies',()=>{
 const e=eligibleDumpEntity(item(50,'Q15632617',{ja:true}));
 assert.equal(e.sources.length,3);
 assert.equal(e.sources[0].url,'https://ja.wikipedia.org/wiki/%E4%BA%BA%E7%89%A9_50');
 assert.equal(e.sources[1].url,'https://en.wikipedia.org/wiki/Name_50');
 assert.equal(e.sources[2].url,'https://www.wikidata.org/wiki/Q50');
 assert.equal(JSON.stringify(e).includes('claims'),false);
});
test('disallows namespace and fragment pages',()=>{
 assert.equal(eligibleDumpEntity(item(51,'Q5',{override:{sitelinks:{enwiki:{title:'Special:Random'}}}})),null);
 assert.equal(eligibleDumpEntity(item(52,'Q5',{override:{sitelinks:{enwiki:{title:'Alice#chapter'}}}})),null);
});
test('reservoir sampling scans beyond initial six and keeps both classifications',async()=>{
 const entries=[...Array.from({length:40},(_,i)=>item(100+i,'Q5',{ja:true})),...Array.from({length:40},(_,i)=>item(150+i,'Q15632617'))];
 const r=await sampleDump(dump(entries),{perKind:12,randomInt:()=>0,version:'candidate-demo'});
 assert.equal(r.catalog.entries.length,24);
 assert.equal(r.counts.real,40);
 assert.equal(r.counts.fictional,40);
 assert.equal(new Set(r.catalog.entries.map(x=>x.qid)).size,24);
 assert.equal(r.catalog.entries.filter(x=>x.kind==='real').length,12);
 assert.equal(r.catalog.entries.filter(x=>x.kind==='fictional').length,12);
 assert.ok(r.catalog.entries.some(x=>x.qid==='Q139'));
 assert.ok(r.catalog.entries.some(x=>x.qid==='Q189'));
});
test('deprecated classifications are not accepted',()=>{
 const e=item(201,'Q5');e.claims.P31[0].rank='deprecated';
 assert.equal(eligibleDumpEntity(e),null);
 assert.equal(eligibleDumpEntity({...e,id:'Q0'}),null);
});
test('incomplete or corrupted dump never creates a partial catalog',async()=>{
 await assert.rejects(sampleDump(dump([item(1,'Q5')]),{perKind:5}),/both real and fictional/);
 await assert.rejects(sampleDump(Readable.from(['[\n','{"id":"Q2"},\n','{broken}\n',']\n']),{perKind:5}),/JSON/);
 await assert.rejects(sampleDump(Readable.from(['[\n',JSON.stringify(item(20,'Q5'))+'\n']),{perKind:5}),/terminating bracket/);
});
test('invalid sample size is rejected',async()=>{
 await assert.rejects(sampleDump(dump([]),{perKind:0}),/perKind/);
});
