/** Persistent persona fallback using the existing ChatGPT Site's optional D1 binding.
 * Stores only Wikidata-identified, link-only structured metadata. Never article text/chats.
 * All SQL uses parameter binding. A database must be provisioned by Sites/Work first.
 */
import {validateCatalog,getPersona,isQid,secureRandomIndex} from './core.mjs';
const MAX_RANDOM_KEY=4294967295;
const LOOKAHEAD=32;
const SIX_HOURS_MS=6*60*60*1000;

function validRecord(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function isStoredRow(row){
 return validRecord(row)&&isQid(row.qid)&&Number.isSafeInteger(row.checked_at_ms)&&
  row.checked_at_ms>0&&Number.isSafeInteger(row.random_key)&&
  row.random_key>=0&&row.random_key<MAX_RANDOM_KEY&&typeof row.sources_json==='string';
}
function resultFromRow(row,language='ja'){
 if(!isStoredRow(row))return null;
 let sources;
 try{sources=JSON.parse(row.sources_json);}catch{return null;}
 const entry={qid:row.qid,kind:row.kind,name:row.name,description:row.description,sources};
 const local={version:'d1-prefetch-cache',entries:[entry]};
 try{
  validateCatalog(local);
  const result=getPersona(local,{qid:entry.qid,language});
  if(result.status!=='ok')return null;
  const timestamp=new Date(row.checked_at_ms).toISOString();
  return {...result,source_mode:'d1_cache_fallback',cache_checked_at:timestamp,
   selection_scope:'Locally prefetched Wikidata identity references; fixed cached sample, not all Wikidata'};
 }catch{return null;}
}
function normalizeOptions(opts){
 const blocked=opts?.blockedQids??[];
 if(!Array.isArray(blocked)||blocked.some(x=>!isQid(x)))throw Error('Invalid blocked QIDs');
 return new Set(blocked);
}
function validateParams({kind='both',language='ja',exclude_qids=[]}={}){
 if(!['real','fictional','both'].includes(kind)||!['ja','en'].includes(language)||
    !Array.isArray(exclude_qids)||exclude_qids.length>20||exclude_qids.some(x=>!isQid(x)))
  throw Error('Invalid cached persona selection');
 return {kind,language,exclude_qids};
}
export function createD1PersonaCache(db,{randomIndex=secureRandomIndex,now=()=>Date.now()}={}){
 if(!db||typeof db.prepare!=='function'||typeof randomIndex!=='function'||typeof now!=='function')
  throw Error('Sites D1 DB binding required');
 const pick=size=>{
  const n=randomIndex(size);
  if(!Number.isSafeInteger(n)||n<0||n>=size)throw Error('Invalid cached random index');
  return n;
 };
 const select=async(kind,threshold,operator)=>{
  const sql="SELECT qid, kind, name, description, sources_json, random_key, checked_at_ms "+
   "FROM persona_cache WHERE kind = ? AND random_key "+operator+" ? "+
   "ORDER BY random_key, qid LIMIT "+LOOKAHEAD;
  const rows=(await db.prepare(sql).bind(kind,threshold).all())?.results;
  if(!Array.isArray(rows))throw Error('Invalid D1 query result');
  return rows;
 };
 async function scan(kind,language,excluded){
  const key=pick(MAX_RANDOM_KEY);
  const first=await select(kind,key,'>=');
  const resultFrom=rows=>{
   for(const row of rows){
    if(excluded.has(row?.qid))continue;
    const result=resultFromRow(row,language);
    if(result&&result.persona.kind===kind)return result;
   }
   return null;
  };
  const selected=resultFrom(first);
  if(selected)return selected;
  // Wrap once to the beginning of the ordered random-key ring.
  const earlier=await select(kind,key,'<');
  return resultFrom(earlier);
 }
 async function get({qid,language='ja'}={},options={}){
  if(!isQid(qid)||!['ja','en'].includes(language))throw Error('Invalid cached QID/language');
  const blocked=normalizeOptions(options);
  if(blocked.has(qid))return {status:'not_found',qid,source_mode:'d1_cache_fallback'};
  const row=await db.prepare(
   "SELECT qid, kind, name, description, sources_json, random_key, checked_at_ms "+
   "FROM persona_cache WHERE qid = ? LIMIT 1"
  ).bind(qid).first();
  return resultFromRow(row,language)??{status:'not_found',qid,source_mode:'d1_cache_fallback'};
 }
 async function random(args={},options={}){
  const {kind,language,exclude_qids}=validateParams(args);
  const excluded=new Set([...exclude_qids,...normalizeOptions(options)]);
  const categories=kind==='both'?(pick(2)===0?['real','fictional']:['fictional','real']):[kind];
  for(const candidateKind of categories){
   const result=await scan(candidateKind,language,excluded);
   if(result)return result;
  }
  return {status:'no_match',source_mode:'d1_cache_fallback'};
 }
 async function put(persona){
  if(!validRecord(persona))throw Error('Invalid persona to cache');
  const entry={qid:persona.qid,kind:persona.kind,name:persona.name,description:persona.description??'',
   sources:persona.sources};
  validateCatalog({version:'d1-prefetch-cache',entries:[entry]});
  const timestamp=now();
  if(!Number.isSafeInteger(timestamp)||timestamp<=0)throw Error('Invalid cache timestamp');
  const key=pick(MAX_RANDOM_KEY);
  const sql="INSERT INTO persona_cache (qid, kind, name, description, sources_json, random_key, checked_at_ms) "+
   "VALUES (?, ?, ?, ?, ?, ?, ?) "+
   "ON CONFLICT(qid) DO UPDATE SET kind=excluded.kind, name=excluded.name, "+
   "description=excluded.description, sources_json=excluded.sources_json, "+
   "checked_at_ms=excluded.checked_at_ms "+
   "WHERE persona_cache.checked_at_ms < ?";
  const result=await db.prepare(sql).bind(
   entry.qid,entry.kind,entry.name,entry.description,JSON.stringify(entry.sources),key,timestamp,
   timestamp-SIX_HOURS_MS
  ).run();
  return result?.success!==false;
 }
 return Object.freeze({get,random,put});
}
