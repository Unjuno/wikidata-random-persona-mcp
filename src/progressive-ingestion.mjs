/** Bounded, append-only Wikidata ingestion for a privileged Sites automation.
 * There is deliberately NO HTTP endpoint, login, API token or background timer here.
 * Sites/Work must provide a D1 binding and explicitly configure the schedule.
 */
import {isQid,validateCatalog} from './core.mjs';
import {createD1PersonaCache} from './d1-persona-cache.mjs';

const DEFAULT_SOFT_LIMIT=8_000_000_000;
const SITE_D1_LIMIT=10_000_000_000;
const SAFETY_MARGIN=1_000_000;
const MAX_BATCHES=16;
const MAX_ITEMS_PER_BATCH=4;

export function createProgressiveIngestor({
 db,source,cache,blockedQids=[],softLimitBytes=DEFAULT_SOFT_LIMIT
}={}){
 if(!db||typeof db.prepare!=='function')throw Error('Sites D1 database required');
 if(!source||typeof source.discoverBatch!=='function')throw Error('Wikidata discoverBatch source required');
 if(!Array.isArray(blockedQids)||blockedQids.some(id=>!isQid(id)))throw Error('Invalid blocked QIDs');
 if(!Number.isSafeInteger(softLimitBytes)||softLimitBytes<=SAFETY_MARGIN||
    softLimitBytes>SITE_D1_LIMIT)throw Error('Invalid D1 capacity limit');
 const store=cache??createD1PersonaCache(db);
 if(typeof store.put!=='function')throw Error('D1 cache writer required');
 const blocked=new Set(blockedQids);
 const progress=()=>({added:0,known:0,attempted:0,skipped:0,batches_completed:0});
 async function checkSize(){
  try{
   const probe=await db.prepare('SELECT 1 AS capacity_probe').all();
   const size=probe?.meta?.size_after;
   return Number.isSafeInteger(size)&&size>=0?size:null;
  }catch{return null;}
 }
 async function runOnce({batches=8}={}){
  if(!Number.isSafeInteger(batches)||batches<1||batches>MAX_BATCHES)
   throw Error('Invalid batch count: must be 1..16');
  const counts=progress();
  let lastSize=null;
  const finish=(status)=>({
   status,...counts,storage_bytes:lastSize,soft_limit_bytes:softLimitBytes,
   note:'Progressive Wikidata metadata only; no article bodies or chats saved'
  });
  const observed=new Set();
  for(let n=0;n<batches;n++){
   lastSize=await checkSize();
   if(lastSize===null)return finish('capacity_unverified');
   if(lastSize+SAFETY_MARGIN>=softLimitBytes)return finish('capacity_reached');
   const kind=n%2===0?'real':'fictional';
   let page;
   try{page=await source.discoverBatch({kind,language:'ja'},{blockedQids});}
   catch{return finish('source_unavailable');}
   if(!page||!['ok','no_match'].includes(page.status))return finish('source_unavailable');
   if(page.status==='no_match'){counts.batches_completed++;continue;}
   if(page.source_mode!=='wikidata_live'){
    counts.skipped++;counts.batches_completed++;continue;
   }
   if(!Array.isArray(page.personas)||page.personas.length>MAX_ITEMS_PER_BATCH)
    return finish('invalid_source_batch');
   for(const persona of page.personas){
    counts.attempted++;
    if(!persona||!isQid(persona.qid)||blocked.has(persona.qid)||observed.has(persona.qid)){
     counts.skipped++;continue;
    }
    observed.add(persona.qid);
    try{validateCatalog({version:'scheduled-wikidata',entries:[persona]});}
    catch{counts.skipped++;continue;}
    let prior;
    try{
     prior=await db.prepare('SELECT 1 AS exists FROM persona_cache WHERE qid = ? LIMIT 1')
      .bind(persona.qid).first();
    }catch{return finish('cache_unavailable');}
    try{
     const ok=await store.put(persona);
     if(ok!==true)return finish('cache_unavailable');
     if(prior)counts.known++;else counts.added++;
    }catch{return finish('cache_unavailable');}
   }
   counts.batches_completed++;
  }
  return finish('ok');
 }
 return Object.freeze({runOnce});
}
