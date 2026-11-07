import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import buildInfo from '../dist/server/build-info.mjs';
import {generateSiteReleaseManifest} from '../src/site-release-bundle.mjs';

test('existing-Site release manifest identifies the exact built worker and ALL hidden configuration',async()=>{
 const commit='a'.repeat(40);
 const report=await generateSiteReleaseManifest({commit});
 assert.equal(report.format,'random-persona-existing-site-release-v1');
 assert.equal(report.publication_status,'build_only_not_deployed');
 assert.equal(report.source_commit,commit);
 assert.equal(report.target.site_url,'https://random-persona-mcp.unjuno.chatgpt.site');
 assert.equal(report.target.project_id,'appgprj_6ae19a38eb4c819192ec364286d5b1af');
 assert.deepEqual(report.target.capabilities,['mcp']);
 assert.equal(report.worker_entry,'dist/server/index.js');
 assert.equal(report.release_fingerprint,buildInfo.fingerprint);
 assert.match(report.release_fingerprint,/^[0-9a-f]{64}$/);
 assert.ok(report.file_count>=15);
 assert.equal(report.files.length,report.file_count);
 assert.equal(report.total_bytes,report.files.reduce((n,f)=>n+f.bytes,0));
 assert.deepEqual(report.files.map(f=>f.path),
  [...report.files.map(f=>f.path)].sort((a,b)=>a.localeCompare(b,'en')));
 for(const row of report.files){
  assert.match(row.path,/^dist\//);
  assert.ok(row.bytes>0);
  assert.match(row.sha256,/^[0-9a-f]{64}$/);
  const bytes=await readFile(new URL('../'+row.path,import.meta.url));
  assert.equal(row.bytes,bytes.length);
  assert.equal(row.sha256,createHash('sha256').update(bytes).digest('hex'));
 }
 assert.ok(report.files.some(f=>f.path==='dist/.openai/hosting.json'),
  'Hidden hosting.json must not be omitted from downloadable release');
 assert.ok(report.files.some(f=>f.path==='dist/server/site-assets.mjs'),
  'Bundled landing page and images must be present');
});
test('bundle guard rejects unknown commit and mismatched Site project',async()=>{
 await assert.rejects(generateSiteReleaseManifest({commit:'short'}),/Commit must/);
 const root=await mkdtemp(join(tmpdir(),'random-persona-build-'));
 try{
  await cp(resolve(import.meta.dirname,'../dist'),join(root,'dist'),{recursive:true});
  await mkdir(join(root,'.openai'),{recursive:true});
  await writeFile(join(root,'.openai','hosting.json'),JSON.stringify({
   project_id:'a-different-site',capabilities:['mcp']
  }));
  await assert.rejects(generateSiteReleaseManifest({root}),/target differs/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('bundle rejects symlinks rather than accidentally including external files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'random-persona-symlink-'));
 try{
  await mkdir(join(root,'dist'),{recursive:true});
  await symlink(resolve(import.meta.dirname,'../package.json'),
   join(root,'dist','unexpected-symlink.mjs'));
  await assert.rejects(generateSiteReleaseManifest({root}),/must not contain symlinks/);
 }finally{await rm(root,{recursive:true,force:true});}
});
