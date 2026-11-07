/**
 * Deterministic, inspectable release manifest for the *existing* ChatGPT Site.
 * Produces a deployment handoff, NOT an automatic deployment.
 * Artifacts contain only static Worker source, generated assets, and the
 * existing hosting.json. No credentials, new Site IDs or external hosts.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative,join,sep} from 'node:path';

const PROJECT_ID='appgprj_6ae19a38eb4c819192ec364286d5b1af';
const SITE_URL='https://random-persona-mcp.unjuno.chatgpt.site';
const REPO='Unjuno/wikidata-random-persona-mcp';
const SHA256=/^[0-9a-f]{64}$/;
const COMMIT=/^[0-9a-f]{40}$/;
const required=[
 'dist/.openai/hosting.json',
 'dist/server/build-info.mjs',
 'dist/server/index.js',
 'dist/server/site-assets.mjs',
 'dist/server/web.mjs',
 'dist/server/core.mjs',
 'dist/server/persona-state.mjs',
 'dist/server/persona-service.mjs'
];
function sha256(data){return createHash('sha256').update(data).digest('hex');}
async function visit(dir,root,out){
 const entries=await readdir(dir,{withFileTypes:true});
 for(const entry of entries){
  const path=join(dir,entry.name);
  if(entry.isSymbolicLink())throw new Error('Release bundle must not contain symlinks');
  if(entry.isDirectory()){await visit(path,root,out);continue;}
  if(!entry.isFile())throw new Error('Unexpected release entry type');
  const name=relative(root,path).split(sep).join('/');
  if(!name.startsWith('dist/')||name.includes('../'))throw new Error('Unexpected release path');
  const bytes=await readFile(path);
  if(bytes.length===0)throw new Error('Empty release artifact: '+name);
  out.push(Object.freeze({path:name,bytes:bytes.length,sha256:sha256(bytes)}));
 }
}
/**
 * Verifies that a built dist/ is complete, deterministic and points to
 * exactly the existing Site project. Does not call any network API.
 */
export async function generateSiteReleaseManifest({
 root=resolve(import.meta.dirname,'..'),
 commit=null
}={}){
 if(commit!==null&&(!COMMIT.test(commit)||typeof commit!=='string'))
  throw new TypeError('Commit must be a full Git SHA-1 or null');
 const base=resolve(root);
 const files=[];
 await visit(resolve(base,'dist'),base,files);
 files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
 const paths=new Set(files.map(x=>x.path));
 for(const name of required)if(!paths.has(name))
  throw new Error('Missing required Site release file: '+name);
 const hosting=JSON.parse(await readFile(resolve(base,'dist/.openai/hosting.json'),'utf8'));
 if(hosting.project_id!==PROJECT_ID||
    !Array.isArray(hosting.capabilities)||
    hosting.capabilities.length!==1||
    hosting.capabilities[0]!=='mcp')
  throw new Error('Release target differs from approved existing ChatGPT Site');
 const sourceHosting=await readFile(resolve(base,'.openai/hosting.json'));
 const builtHosting=await readFile(resolve(base,'dist/.openai/hosting.json'));
 if(!sourceHosting.equals(builtHosting))
  throw new Error('Built manifest differs from the reviewed existing-site target');
 const moduleText=await readFile(resolve(base,'dist/server/build-info.mjs'),'utf8');
 const fingerprint=moduleText.match(/^export default (\{"fingerprint":"([0-9a-f]{64})"\});\s*$/)?.[2];
 if(!fingerprint||!SHA256.test(fingerprint))
  throw new Error('Invalid or missing deterministic build fingerprint');
 const html=await readFile(resolve(base,'public/index.html'),'utf8');
 if(!html.includes('data-preview-implementation="real-mcp-v1"'))
  throw new Error('Reviewed source lacks real MCP preview release marker');
 const totalBytes=files.reduce((n,x)=>n+x.bytes,0);
 return Object.freeze({
  format:'random-persona-existing-site-release-v1',
  publication_status:'build_only_not_deployed',
  repository:REPO,
  source_commit:commit,
  target:Object.freeze({
   site_url:SITE_URL,
   project_id:PROJECT_ID,
   capabilities:Object.freeze(['mcp'])
  }),
  worker_entry:'dist/server/index.js',
  release_fingerprint:fingerprint,
  file_count:files.length,
  total_bytes:totalBytes,
  files:Object.freeze(files)
 });
}
