/** Live Wikidata lookup for the Sites runtime. No article bodies or persistent state. */
import {isQid, secureRandomIndex, randomPersona, getPersona} from './core.mjs';
import {normalizeEntity} from './wikidata.mjs';
import {createIndexSelector} from './persona-index.mjs';

const USER_AGENT='RandomPersonaMCP/0.4 (+https://github.com/Unjuno/wikidata-random-persona-mcp)';
const MAX_JSON_BYTES=2*1024*1024;
const HUMAN_CLASS='Q5';
// Direct P31 categories only; this does not resolve every Wikidata P279 subclass.
export const FICTIONAL_CLASSES=Object.freeze([
 {qid:'Q15632617',offsetMax:2000},
 {qid:'Q95074',offsetMax:150},
 {qid:'Q80447738',offsetMax:200},
 {qid:'Q87576284',offsetMax:200},
 {qid:'Q1114461',offsetMax:200}
]);
const FICTIONAL_IDS=new Set([...FICTIONAL_CLASSES.map(x=>x.qid),
 'Q15711870','Q3658341','Q15773347','Q2593744','Q3542731',
 'Q28020127','Q30061312','Q89050913']);
const LANGUAGES=new Set(['ja','en']);
const KINDS=new Set(['real','fictional','both']);
const stamp=()=>new Date();
function validObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function validateDraw(arg) {
 if(!validObject(arg)||!KINDS.has(arg.kind??'both')||!LANGUAGES.has(arg.language??'ja')||
    !Array.isArray(arg.exclude_qids??[])||(arg.exclude_qids??[]).length>20||
    !(arg.exclude_qids??[]).every(isQid))throw Error('Invalid random QID/kind/language arguments');
}
function validateGet(arg) {
 if(!validObject(arg)||!isQid(arg.qid)||!LANGUAGES.has(arg.language??'ja'))throw Error('Invalid QID/language arguments');
}
function validBlocked(options){
 const blocked=options?.blockedQids??[];
 if(!Array.isArray(blocked)||!blocked.every(isQid))throw Error('Invalid blocked QIDs');
 return new Set(blocked);
}
function chooseBounded(fn,size){
 const n=fn(size);
 if(!Number.isSafeInteger(n)||n<0||n>=size)throw Error('Invalid random source');
 return n;
}
function responseFor(result,now,other={}) {
 return {...result,source_mode:'wikidata_live',fetched_at:now().toISOString(),
  selection_scope:'Wikidata direct P31 categories with bounded OFFSET; not uniform across all Wikidata items',...other};
}
function noMatch(qid) {
 return {status:'not_found',qid,catalog_version:'wikidata-live',source_mode:'wikidata_live'};
}
function kindOf(entity) {
 const claims=Array.isArray(entity?.claims?.P31)?entity.claims.P31:[];
 const active=claims.filter(c=>c&&c.rank!=='deprecated');
 const preferred=active.filter(c=>c.rank==='preferred');
 const classes=new Set((preferred.length?preferred:active).map(c=>c?.mainsnak?.datavalue?.value?.id).filter(Boolean));
 if(classes.has('Q4167410')||classes.has('Q13406463'))return null;
 const human=classes.has('Q5'),fictional=[...classes].some(id=>FICTIONAL_IDS.has(id));
 if(human&&fictional)return null; // Contradictory claims are not a safe persona identity.
 if(human)return 'real';
 if(fictional)return 'fictional';
 return null;
}
async function boundedJson(response){
 const reader=response.body?.getReader();
 if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_JSON_BYTES)throw Error('Wikidata response too large');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 let size=0;
 const chunks=[];
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>MAX_JSON_BYTES){await reader.cancel();throw Error('Wikidata response too large');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const out=new Uint8Array(size);
 let pos=0;
 for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
}
export function createLiveWikidata({fetchImpl=(...args)=>globalThis.fetch(...args),randomIndex=secureRandomIndex,now=stamp,timeoutMs=10000,maxRequestsPerMinute=60,maxConcurrent=4,index=null,maxlagSeconds=15}={}) {
 if(typeof fetchImpl!=='function'||typeof randomIndex!=='function'||typeof now!=='function')throw Error('Invalid Wikidata client configuration');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isInteger(maxRequestsPerMinute)||maxRequestsPerMinute<1||!Number.isInteger(maxConcurrent)||maxConcurrent<1)throw Error('Invalid Wikidata request limits');
 if(!Number.isInteger(maxlagSeconds)||maxlagSeconds<5||maxlagSeconds>30)throw Error('Invalid Wikidata maxlag threshold');
 const indexedSelector=index===null?null:createIndexSelector(index);
 const fullIndex=indexedSelector?.index??null;
 // Defensive, isolate-local budgets; platform-wide quotas belong at the Sites boundary.
 let windowStart=0,requests=0,inFlight=0,cooldownUntil=0;
 async function readJson(url){
  if(!(url instanceof URL)||url.protocol!=='https:'||url.username||url.password||
    !['www.wikidata.org','query.wikidata.org'].includes(url.hostname)||
    (url.hostname==='www.wikidata.org'&&url.pathname!=='/w/api.php')||
    (url.hostname==='query.wikidata.org'&&url.pathname!=='/sparql'))throw Error('Unapproved Wikimedia URL');
  const time=now().getTime();
  if(time<cooldownUntil)throw Error('Wikidata Retry-After cooldown');
  if(time-windowStart>=60000){windowStart=time;requests=0;}
  if(requests>=maxRequestsPerMinute||inFlight>=maxConcurrent)throw Error('Wikidata local request budget exceeded');
  requests++;inFlight++;
  const controller=new AbortController();
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Wikidata timeout'));},timeoutMs);});
  const operation=(async()=>{
   const response=await fetchImpl(url.toString(),{
    method:'GET',redirect:'manual',
    headers:{'Accept':'application/json','User-Agent':USER_AGENT,'Api-User-Agent':USER_AGENT},
    signal:controller.signal
   });
   if(!response.ok) {
    if(response.status===429||response.status===503){
     const header=response.headers.get('retry-after')??'60';
     const seconds=/^\d+$/.test(header)?Number(header):(Date.parse(header)-now().getTime())/1000;
     cooldownUntil=now().getTime()+Math.max(1,Number.isFinite(seconds)?seconds:60)*1000;
     void response.body?.cancel().catch(()=>{});
     throw Error('Wikidata rate limited: '+response.status);
    }
    void response.body?.cancel().catch(()=>{});
    throw Error('Wikidata upstream HTTP '+response.status);
   }
   if(Number(response.headers.get('content-length'))>MAX_JSON_BYTES){void response.body?.cancel().catch(()=>{});throw Error('Wikidata response too large');}
   const body=await boundedJson(response);
   if(body?.error?.code==='no-such-entity'&&isQid(body.error.id)&&url.hostname==='www.wikidata.org'&&url.searchParams.get('ids')===body.error.id)return {entities:{[body.error.id]:{id:body.error.id,missing:''}}};
   if(body?.error){
    if(body.error.code==='maxlag'){
     cooldownUntil=now().getTime()+60000;
     throw Error('Wikidata upstream error: maxlag');
    }
    throw Error('Wikidata upstream error');
   }
   return body;
  })();
  try{return await Promise.race([operation,deadline]);}
  finally{clearTimeout(timer);inFlight--;}

 }
 async function fetchEntities(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>20||!ids.every(isQid))throw Error('Invalid Wikidata QID batch');
  const u=new URL('https://www.wikidata.org/w/api.php');
  u.search=new URLSearchParams({
   action:'wbgetentities',ids:ids.join('|'),props:'labels|descriptions|sitelinks|claims',
   sitefilter:'jawiki|enwiki',languages:'ja|en',format:'json',maxlag:String(maxlagSeconds)
  });
  const data=await readJson(u);
  if(!validObject(data?.entities))throw Error('Wikidata returned no entity map');
  return data.entities;
 }
 async function get({qid,language='ja'}={},options={}){
  validateGet({qid,language});
  if(validBlocked(options).has(qid))return noMatch(qid);
  const entities=await fetchEntities([qid]);
  const entity=entities[qid];
  if(!validObject(entity)||entity.id!==qid)throw Error('Wikidata identity response mismatch');
  if(Object.hasOwn(entity,'missing'))return noMatch(qid);
  const kind=kindOf(entity);
  if(!kind)return noMatch(qid);
  const entry=normalizeEntity(entity,{qid,kind});
  if(!entry)return noMatch(qid);
  return responseFor(getPersona({version:'wikidata-live',entries:[entry]},{qid,language}),now);
 }
 /** Small multi-subject discovery for owner-owned background ingestion, never a public tool.
  * Uses exactly one bounded WDQS query and at most one 4-entity metadata batch.
  */
 async function discoverBatch({kind='real',language='ja',exclude_qids=[]}={},options={}){
  validateDraw({kind,language,exclude_qids});
  if(kind==='both')throw Error('Invalid discovery kind: choose one category');
  const blocked=validBlocked(options);
  const classInfo=kind==='real'?{qid:HUMAN_CLASS,offsetMax:10000}:
   FICTIONAL_CLASSES[chooseBounded(randomIndex,FICTIONAL_CLASSES.length)];
  const offset=chooseBounded(randomIndex,classInfo.offsetMax+1);
  const q='SELECT ?item WHERE { ?item wdt:P31 wd:'+classInfo.qid+' . } LIMIT 4 OFFSET '+offset;
  const search=new URL('https://query.wikidata.org/sparql');
  search.search=new URLSearchParams({query:q,format:'json'});
  const results=await readJson(search);
  const bindings=results?.results?.bindings;
  if(!Array.isArray(bindings))throw Error('Invalid Wikidata discovery response');
  const excluded=new Set([...blocked,...exclude_qids]);
  const ids=[...new Set(bindings.map(r=>r?.item?.value?.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9][0-9]{0,11})$/)?.[1]).filter(id=>id&&!excluded.has(id)))].slice(0,4);
  if(!ids.length)return responseFor({status:'no_match',personas:[]},now,{sampling_method:'bounded_wdqs_offset'});
  const entities=await fetchEntities(ids);
  const personas=[];
  for(const qid of ids){
   const entity=entities[qid];
   if(!entity||kindOf(entity)!==kind)continue;
   const entry=normalizeEntity(entity,{qid,kind});
   if(!entry)continue;
   try{
    const current=getPersona({version:'wikidata-live',entries:[entry]},{qid,language});
    if(current.status==='ok')personas.push(current.persona);
   }catch{/* Reject malformed or unsupported Wikimedia records, never fabricate a persona. */}
  }
  return responseFor({
   status:personas.length?'ok':'no_match',personas
  },now,{sampling_method:'bounded_wdqs_offset'});
 }
 async function random({kind='both',language='ja',exclude_qids=[]}={},options={}){
  validateDraw({kind,language,exclude_qids});
  const blocked=validBlocked(options);
  if(fullIndex){
   const attempted=new Set(blocked);
   for(let attempt=0;attempt<3;attempt++){
    const candidate=indexedSelector.choose({kind,exclude_qids},randomIndex,attempted);
    if(!candidate)break;
    // Re-read the chosen QID from Wikidata, never trust stale dump metadata for dialogue.
    const current=await get({qid:candidate.qid,language},{blockedQids:[...blocked]});
    if(current.status==='ok'&&current.persona.kind===candidate.kind){
     return {...current,
      sampling_method:'wikidata_dump_reservoir',
      index_version:fullIndex.version,
      eligible_population:fullIndex.population.real+fullIndex.population.fictional,
      selection_scope:'Wikidata complete-dump reservoir of eligible direct-P31 items; not all Wikidata subclasses'};
    }
    attempted.add(candidate.qid);
   }
   return responseFor({status:'no_match',catalog_version:'wikidata-live',reason:'No currently eligible dump-index candidates'},now,{
    sampling_method:'wikidata_dump_reservoir',index_version:fullIndex.version
   });
  }
  const desired=kind==='both'?(chooseBounded(randomIndex,2)===0?'real':'fictional'):kind;
  const classInfo=desired==='real'?{qid:HUMAN_CLASS,offsetMax:10000}:
   FICTIONAL_CLASSES[chooseBounded(randomIndex,FICTIONAL_CLASSES.length)];
  const offset=chooseBounded(randomIndex,classInfo.offsetMax+1);
  const q='SELECT ?item WHERE { ?item wdt:P31 wd:'+classInfo.qid+' . } LIMIT 4 OFFSET '+offset;
  const search=new URL('https://query.wikidata.org/sparql');
  search.search=new URLSearchParams({query:q,format:'json'});
  const results=await readJson(search);
  const bindings=results?.results?.bindings;
  if(!Array.isArray(bindings))throw Error('Invalid Wikidata query results');
  const excluded=new Set([...exclude_qids,...blocked]);
  const ids=[...new Set(bindings.map(r=>r?.item?.value?.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9][0-9]{0,11})$/)?.[1]).filter(x=>x&&!excluded.has(x)))].slice(0,4);
  if(!ids.length)return responseFor({status:'no_match',catalog_version:'wikidata-live',reason:'No eligible live candidates'},now);
  const entities=await fetchEntities(ids);
  const entries=[];
  for(const id of ids){
   const entity=entities[id];
   if(!entity||kindOf(entity)!==desired)continue;
   const entry=normalizeEntity(entity,{qid:id,kind:desired});
   if(entry)entries.push(entry);
  }
  if(!entries.length)return responseFor({status:'no_match',catalog_version:'wikidata-live',reason:'No eligible live candidates with articles'},now);
  return responseFor(randomPersona({version:'wikidata-live',entries},{kind:desired,language,exclude_qids},randomIndex),now,{sampling_method:'bounded_wdqs_offset'});
 }
 return Object.freeze({random,get,discoverBatch});
}
