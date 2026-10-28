import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promotePersonaIndex,sha256} from '../src/catalog-files.mjs';
import {validatePersonaIndex} from '../src/persona-index.mjs';

const stmt=id=>({mainsnak:{datavalue:{value:{id}}},rank:'normal'});
const row=(n,cls)=>({type:'item',id:'Q'+n,claims:{P31:[stmt(cls)]},labels:{en:{value:'Person'+n}},sitelinks:{enwiki:{title:'Person_'+n}}});
const sample=[...Array.from({length:15},(_,i)=>row(1000+i,'Q5')),...Array.from({length:15},(_,i)=>row(2000+i,'Q15632617'))];
const gzip=gzipSync('[\n'+sample.map(x=>JSON.stringify(x)).join(',\n')+'\n]\n');
test('streaming CLI creates a compact validated QID index without metadata or article bodies',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qid-index-cli-')),dest=join(dir,'candidate.json');
 const r=spawnSync(process.execPath,['scripts/sample-wikidata-index.mjs','--gzip','--per-kind','10','--out',dest],{input:gzip,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const index=JSON.parse(readFileSync(dest,'utf8'));
 validatePersonaIndex(index);
 assert.equal(index.qids.real.length,10);
 assert.equal(index.qids.fictional.length,10);
 assert.deepEqual(index.population,{real:15,fictional:15});
 assert.equal(JSON.stringify(index).includes('Person_'),false);
 assert.match(r.stdout,/sha256/);
});
test('truncated gzip and invalid JSON never replace an existing candidate',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qid-index-cli-')),dest=join(dir,'candidate.json');
 writeFileSync(dest,'approved bytes');
 for(const input of [Buffer.from('not gzip'),gzip.subarray(0,gzip.length-7)]){
  const r=spawnSync(process.execPath,['scripts/sample-wikidata-index.mjs','--gzip','--per-kind','10','--out',dest],{input,encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.equal(readFileSync(dest,'utf8'),'approved bytes');
 }
});
test('promotion requires explicit review, exact bytes, and preserves suspension list',()=>{
 const dir=mkdtempSync(join(tmpdir(),'qid-index-promo-'));
 const index={version:'dump-2026-10-28',source:'Wikidata JSON dump',complete_scan:true,population:{real:3,fictional:5},
  qids:{real:['Q10','Q11'],fictional:['Q20','Q21']}};
 const bytes=JSON.stringify(index)+'\n',digest=sha256(bytes);
 writeFileSync(join(dir,'persona-index.pending.json'),bytes);
 writeFileSync(join(dir,'blocked-qids.json'),'["Q42"]\n');
 assert.throws(()=>promotePersonaIndex({dir,expectedSha256:digest}),/review/i);
 assert.throws(()=>promotePersonaIndex({dir,reviewed:true,expectedSha256:'0'.repeat(64)}),/digest/i);
 assert.equal(existsSync(join(dir,'persona-index.json')),false);
 const result=promotePersonaIndex({dir,reviewed:true,expectedSha256:digest});
 assert.equal(result.qids.real.length,2);
 assert.equal(readFileSync(join(dir,'blocked-qids.json'),'utf8'),'["Q42"]\n');
 assert.equal(JSON.parse(readFileSync(join(dir,'persona-index.json'))).complete_scan,true);
 assert.equal(result.version.startsWith('approved-dump-'),true);
});
