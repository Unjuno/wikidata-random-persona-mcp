import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,rm,writeFile,readFile,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {generateSiteReleaseManifest} from '../src/site-release-bundle.mjs';
import {verifyExtractedSiteRelease} from '../scripts/verify-extracted-site-release.mjs';

const commit='d'.repeat(40);
async function workspace(fn){
 const root=await mkdtemp(join(tmpdir(),'persona-artifact-QA-'));
 try{
  await cp(resolve(import.meta.dirname,'../dist'),join(root,'dist'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}\n');
  const manifest=await generateSiteReleaseManifest({commit});
  await writeFile(join(root,'site-release-manifest.json'),JSON.stringify(manifest));
  return await fn(root,manifest);
 }finally{await rm(root,{recursive:true,force:true});}
}
test('exact extracted release really boots its bundled MCP and draws a persona during connect',async()=>{
 await workspace(async root=>{
  const report=await verifyExtractedSiteRelease(root,{expectedCommit:commit});
  assert.equal(report.archive_validation,'PASS');
  assert.equal(report.publication_status,'build_only_not_deployed');
  assert.equal(report.source_commit,commit);
  assert.equal(report.target.project_id,'appgprj_6ae19a38eb4c819192ec364286d5b1af');
  assert.equal(report.runtime.isolated_worker,'PASS');
  assert.equal(report.runtime.persona_qid,'Q42');
  assert.equal(report.runtime.checks,7);
  assert.ok(report.checked_files>=15);
 });
});
test('modified and unlisted artifacts fail even if manifest metadata looks valid',async()=>{
 await workspace(async root=>{
  const entry=join(root,'dist/server/index.js');
  const original=await readFile(entry);
  await writeFile(entry,'TAMPERED');
  await assert.rejects(verifyExtractedSiteRelease(root,{expectedCommit:commit,smoke:false}),
   /Modified or missing release file/);
  await writeFile(entry,original);
  const rogue=join(root,'dist/server/rogue.mjs');
  await writeFile(rogue,'export default 1;');
  await assert.rejects(verifyExtractedSiteRelease(root,{expectedCommit:commit,smoke:false}),
   /Unlisted file/);
 });
});
test('wrong source commit and hostile Site target fail independently',async()=>{
 await workspace(async(root,m)=>{
  await assert.rejects(verifyExtractedSiteRelease(root,{
   expectedCommit:'a'.repeat(40),smoke:false
  }),/commit does not match/);
  const file=join(root,'site-release-manifest.json');
  await writeFile(file,JSON.stringify({...m,target:{...m.target,project_id:'other'}}));
  await assert.rejects(verifyExtractedSiteRelease(root,{smoke:false}),
   /Wrong target ChatGPT Site/);
 });
});
test('symlink-based artifacts cannot escape root or be submitted as a release',async()=>{
 await workspace(async root=>{
  const rogue=join(root,'dist/server/rogue-symlink');
  await symlink(resolve(import.meta.dirname,'../package.json'),rogue);
  try{
   await assert.rejects(verifyExtractedSiteRelease(root,{smoke:false}),/Symlink/);
  }finally{await unlink(rogue);}
 });
});
