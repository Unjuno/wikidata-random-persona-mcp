import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promoteCatalog,sha256} from '../src/catalog-files.mjs';
function entry(qid,kind){return {qid,kind,name:qid,sources:[{url:'https://en.wikipedia.org/wiki/'+qid,language:'en',purpose:'article'},{url:'https://www.wikidata.org/wiki/'+qid,language:'mul',purpose:'identity'}]};}
function setup(source){
 const dir=mkdtempSync(join(tmpdir(),'wd-promote-'));
 const old={version:'old',entries:[entry('Q1','real'),entry('Q2','fictional')]};
 const next={version:'candidate-dump-1',source,entries:[entry('Q3','real'),entry('Q4','fictional')]};
 const bytes=JSON.stringify(next)+'\n';
 writeFileSync(join(dir,'catalog.json'),JSON.stringify(old));
 writeFileSync(join(dir,'catalog.pending.json'),bytes);
 return {dir,sha:sha256(bytes)};
}
test('default promotion refuses unverified metadata even if digest is reviewed',()=>{
 const {dir,sha}=setup('Wikidata JSON dump; sampled');
 assert.throws(()=>promoteCatalog({dir,reviewed:true,expectedSha256:sha}),/Metadata checked_at/);
});
test('explicitly approved Wikidata dump sitelinks can be promoted without checked_at',()=>{
 const {dir,sha}=setup('Wikidata JSON dump; sampled');
 const version=promoteCatalog({dir,reviewed:true,expectedSha256:sha,allowDumpSitelinks:true});
 assert.match(version,/published-/);
 assert.equal(JSON.parse(readFileSync(join(dir,'catalog.json'))).entries.length,2);
 assert.ok(existsSync(join(dir,'catalog.previous.json')));
});
test('no alternate source and no mismatched SHA can bypass provenance',()=>{
 const other=setup('Unapproved source');
 assert.throws(()=>promoteCatalog({dir:other.dir,reviewed:true,expectedSha256:other.sha,allowDumpSitelinks:true}),/provenance/i);
 const dump=setup('Wikidata JSON dump; sampled');
 assert.throws(()=>promoteCatalog({dir:dump.dir,reviewed:true,expectedSha256:'0'.repeat(64),allowDumpSitelinks:true}),/digest/i);
});
