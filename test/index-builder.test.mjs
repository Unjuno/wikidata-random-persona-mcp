import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
function sandbox(){
 const dir=mkdtempSync(join(tmpdir(),'persona-index-build-'));
 for(const folder of ['src','sites','scripts','public','data','.openai'])
  cpSync(join(root,folder),join(dir,folder),{recursive:true});
 for(const file of ['package.json','package-lock.json'])
  cpSync(join(root,file),join(dir,file));
 return dir;
}
function approve(dir,complete=true){
 const index={version:'approved-dump-fixture',source:'Wikidata JSON dump',complete_scan:complete,
  population:{real:1000,fictional:3000},
  qids:{real:['Q901','Q902'],fictional:['Q1001','Q1002']}};
 writeFileSync(join(dir,'data/persona-index.json'),JSON.stringify(index)+'\n');
 return index;
}
test('Sites builder loads approved QID index and labels fallback count separately',async()=>{
 const dir=sandbox(),approved=approve(dir);
 const build=spawnSync(process.execPath,['scripts/build-sites-worker.mjs'],{cwd:dir,encoding:'utf8'});
 assert.equal(build.status,0,build.stderr);
 const indexModule=readFileSync(join(dir,'dist/server/persona-index-data.mjs'),'utf8');
 assert.match(indexModule,/approved-dump-fixture/);
 const worker=(await import(pathToFileURL(join(dir,'dist/server/index.js')).href)).default;
 const response=await worker.fetch(new Request('https://random-persona-mcp.unjuno.chatgpt.site/healthz'));
 assert.equal(response.status,200);
 const health=await response.json();
 assert.equal(health.sampling_method,'wikidata_dump_reservoir');
 assert.equal(health.eligible_population,4000);
 assert.equal(health.index_version,approved.version);
 assert.equal(health.fallback_catalog.entries,300);
 assert.equal(health.entries,undefined);
});
test('builder fails closed if index is not a complete official dump',()=>{
 const dir=sandbox();approve(dir,false);
 const build=spawnSync(process.execPath,['scripts/build-sites-worker.mjs'],{cwd:dir,encoding:'utf8'});
 assert.notEqual(build.status,0);
 assert.match(build.stderr,/complete|index/i);
});
