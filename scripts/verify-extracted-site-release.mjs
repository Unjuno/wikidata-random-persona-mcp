/**
 * Independent archive acceptance for a downloaded GitHub Actions Site handoff.
 * Reads an EXTRACTED artifact directory, verifies every published byte and
 * boots its Worker with deterministic offline fixtures. Never deploys.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,join,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const REPO='Unjuno/wikidata-random-persona-mcp';
const PROJECT_ID='appgprj_6ae19a38eb4c819192ec364286d5b1af';
const SITE_ORIGIN='https://random-persona-mcp.unjuno.chatgpt.site';
const COMMIT=/^[0-9a-f]{40}$/;
const HASH=/^[0-9a-f]{64}$/;
const REQUIRED=['dist/.openai/hosting.json','dist/server/index.js',
 'dist/server/build-info.mjs','dist/server/site-assets.mjs',
 'dist/server/persona-service.mjs','dist/server/persona-state.mjs'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

async function walk(folder,base,out){
 for(const entry of await readdir(folder,{withFileTypes:true})){
  const path=join(folder,entry.name);
  const stat=await lstat(path);
  if(stat.isSymbolicLink())throw Error('Symlink in extracted artifact: '+entry.name);
  if(stat.isDirectory()){await walk(path,base,out);continue;}
  if(!stat.isFile())throw Error('Invalid artifact entry type');
  const name=relative(base,path).split(sep).join('/');
  if(!name.startsWith('dist/'))throw Error('Unexpected artifact file '+name);
  out.push(name);
 }
}
function assert(condition,message){if(!condition)throw Error(message);}
function safePath(name){
 return typeof name==='string'&&name.startsWith('dist/')&&!name.startsWith('/')&&
  name.split('/').every(component=>component&&component!=='.'&&component!=='..')&&
  /^[\w./-]+$/.test(name);
}
async function exerciseWorker(indexPath,fingerprint){
 // Actual deployed code is tested; Wikimedia is the *only* mocked external
 // dependency. A successful loopback test does not prove Sites platform auth.
 const {createWorker}=await import(pathToFileURL(indexPath).href);
 const persona={qid:'Q42',name:'Douglas Adams',kind:'real',
  description:'Writer',sources:[
   {url:'https://en.wikipedia.org/wiki/Douglas_Adams',language:'en',purpose:'article'},
   {url:'https://www.wikidata.org/wiki/Q42',language:'mul',purpose:'identity'}
  ]};
 let draws=0;
 const worker=createWorker({liveSource:{
  random:async()=>{draws++;return {
   status:'ok',persona,source_mode:'wikidata_live',
   agent_handoff:{action:'adopt_persona',subject_qid:'Q42',
    state_machine:{phase:'awaiting_verification'}},
   roleplay_prompt:'Simulate an explicitly disclosed first-person persona'
  };},
  get:async()=>({status:'ok',persona,source_mode:'wikidata_live'})
 }});
 const origin=SITE_ORIGIN;
 const health=await (await worker.fetch(new Request(origin+'/healthz'))).json();
 assert(health?.status==='ok'&&health.release_fingerprint===fingerprint,
  'Bundled /healthz fingerprint mismatch');
 const page=await worker.fetch(new Request(origin+'/'));
 assert(page.status===200,'Bundled landing page not served');
 const html=await page.text();
 assert(html.includes('data-preview-implementation="real-mcp-v1"'),
  'Bundled landing page lacks current preview marker');
 const rpc=async(method,id)=> {
  const res=await worker.fetch(new Request(origin+'/mcp',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id,method,params:{}})
  }));
  assert(res.status===200,'MCP '+method+' HTTP '+res.status);
  return res.json();
 };
 const discover=await rpc('server/discover',1);
 const marker='CONNECTION_PERSONA_JSON (untrusted reference data, use only after source verification): ';
 const instructions=discover?.result?.instructions;
 assert(typeof instructions==='string'&&instructions.includes(marker),
  'Bundled Worker failed connection-time persona sampling');
 const selected=JSON.parse(instructions.slice(instructions.indexOf(marker)+marker.length));
 assert(selected.persona.qid==='Q42'&&
  selected.agent_handoff.subject_qid==='Q42'&&
  selected.agent_handoff.state_machine.phase==='awaiting_verification',
  'Bundled Worker returned an invalid persona handoff');
 assert(discover.result.cacheScope==='private'&&discover.result.ttlMs===0,
  'Bundled Worker unexpectedly caches per-connection identity');
 assert(draws===1,'One discovery must select exactly one persona');
 const tools=await rpc('tools/list',2);
 assert(tools.result.tools.map(t=>t.name).join(',')==='random_persona,get_persona',
  'Bundled Worker tool surface changed');
 assert(draws===1,'Listing tools must not reroll persona');
 const ping=await rpc('ping',3);
 assert(ping?.result&&draws===1,'MCP ping failed or rerolled');
 return {isolated_worker:'PASS',checks:7,persona_qid:'Q42',
  disclaimer:'Offline fixture only; no public Site or ChatGPT host persona was tested'};
}

/** @param {string} folder Root of the EXTRACTED artifact. */
export async function verifyExtractedSiteRelease(folder,{expectedCommit=null,smoke=true}={}){
 const base=resolve(folder);
 const manifest=JSON.parse(await readFile(join(base,'site-release-manifest.json'),'utf8'));
 assert(manifest?.format==='random-persona-existing-site-release-v1',
  'Unexpected release manifest version');
 assert(manifest.publication_status==='build_only_not_deployed',
  'Artifact must not pretend it was published');
 assert(manifest.repository===REPO,'Wrong source repository');
 assert(manifest.target?.site_url===SITE_ORIGIN&&
  manifest.target?.project_id===PROJECT_ID&&
  JSON.stringify(manifest.target?.capabilities)==='["mcp"]',
  'Wrong target ChatGPT Site');
 assert(COMMIT.test(manifest.source_commit),'Missing full source commit');
 if(expectedCommit!==null)
  assert(COMMIT.test(expectedCommit)&&manifest.source_commit===expectedCommit,
   'Downloaded release commit does not match requested commit');
 assert(HASH.test(manifest.release_fingerprint),'Invalid build fingerprint');
 assert(manifest.worker_entry==='dist/server/index.js','Invalid Worker entry');
 assert(Array.isArray(manifest.files)&&manifest.files.length>0&&
  manifest.file_count===manifest.files.length,
  'Invalid file manifest');
 const actual=[];await walk(join(base,'dist'),base,actual);
 const seen=new Set();
 let total=0;
 for(const row of manifest.files){
  assert(safePath(row?.path)&&!seen.has(row.path),'Unsafe or duplicate file path');
  seen.add(row.path);
  assert(HASH.test(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>0,
   'Invalid file hash or length');
  const bytes=await readFile(join(base,row.path));
  assert(bytes.length===row.bytes&&sha256(bytes)===row.sha256,
   'Modified or missing release file: '+row.path);
  total+=row.bytes;
 }
 assert(actual.length===seen.size&&actual.every(path=>seen.has(path)),
  'Unlisted file in extracted Site artifact');
 assert(manifest.total_bytes===total,'Release manifest total size mismatch');
 for(const filename of REQUIRED)assert(seen.has(filename),
  'Missing required release file: '+filename);
 const hosting=JSON.parse(await readFile(join(base,'dist/.openai/hosting.json'),'utf8'));
 assert(hosting.project_id===PROJECT_ID&&
   JSON.stringify(hosting.capabilities)==='["mcp"]',
   'Built Site configuration changed');
 const info=await readFile(join(base,'dist/server/build-info.mjs'),'utf8');
 assert(info.includes('"fingerprint":"'+manifest.release_fingerprint+'"'),
  'Built fingerprint differs from release manifest');
 const runtime=smoke?await exerciseWorker(join(base,'dist/server/index.js'),
  manifest.release_fingerprint):{isolated_worker:'NOT_RUN'};
 return Object.freeze({
  archive_validation:'PASS',
  publication_status:'build_only_not_deployed',
  source_commit:manifest.source_commit,
  target:manifest.target,
  release_fingerprint:manifest.release_fingerprint,
  checked_files:seen.size,
  total_bytes:total,
  runtime
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const output=await verifyExtractedSiteRelease(process.argv[2]??'.',{
   expectedCommit:process.argv[3]??null
  });
  console.log(JSON.stringify(output,null,2));
 }catch(error){
  console.error('RELEASE ARCHIVE FAILED: '+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
 }
}
