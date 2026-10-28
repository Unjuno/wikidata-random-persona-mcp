import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const stmt=id=>({mainsnak:{datavalue:{value:{id}}},rank:'normal'});
const item=(n,id)=>({type:'item',id:'Q'+n,labels:{en:{value:'Name '+n}},claims:{P31:[stmt(id)]},sitelinks:{enwiki:{title:'Name '+n}}});
const fixture=[...Array.from({length:10},(_,i)=>item(i+10,'Q5')),...Array.from({length:10},(_,i)=>item(i+100,'Q15632617'))];
const gz=gzipSync('[\n'+fixture.map(x=>JSON.stringify(x)).join(',\n')+'\n]\n');
test('CLI consumes gzip stream and stages >6 Wikidata-derived entries',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wiki-dump-')); const dest=join(dir,'pending.json');
 const p=spawnSync(process.execPath,['scripts/sample-wikidata-dump.mjs','--gzip','--per-kind','7','--out',dest],{cwd:process.cwd(),input:gz,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const catalog=JSON.parse(readFileSync(dest,'utf8'));
 assert.equal(catalog.entries.length,14);
 assert.equal(catalog.entries.filter(x=>x.kind==='real').length,7);
 assert.equal(catalog.entries.filter(x=>x.kind==='fictional').length,7);
});
test('CLI never writes candidate when incoming gzip is invalid',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wiki-dump-')); const dest=join(dir,'pending.json');
 const p=spawnSync(process.execPath,['scripts/sample-wikidata-dump.mjs','--gzip','--out',dest],{cwd:process.cwd(),input:Buffer.from('not gzip'),encoding:'utf8'});
 assert.notEqual(p.status,0);
 assert.equal(existsSync(dest),false);
});
