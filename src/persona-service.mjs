/** Persona application service.
 * Separates transport JSON-RPC, Wikidata selection and optional D1 storage.
 * No conversation state, external writes, secrets or arbitrary URL fetch.
 */
import {isQid,validateCatalog} from './core.mjs';
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const allowed=(args,keys)=>{
 if(!isObject(args)||Object.keys(args).some(key=>!keys.includes(key)))
  throw Error('Invalid tool arguments');
};
function validateRandom(args){
 allowed(args,['kind','language','exclude_qids']);
 const kind=args.kind??'both',language=args.language??'ja',exclude=args.exclude_qids??[];
 if(!['real','fictional','both'].includes(kind)||!['ja','en'].includes(language)||
    !Array.isArray(exclude)||exclude.length>20||exclude.some(x=>!isQid(x)))
  throw Error('Invalid random QID/kind/language arguments');
}
function validateGet(args){
 allowed(args,['qid','language']);
 if(!isQid(args.qid)||!['ja','en'].includes(args.language??'ja'))
  throw Error('Invalid QID/language arguments');
}
export function upstreamFailureCategory(error){
 const message=error instanceof Error?error.message:'';
 if(/maxlag/i.test(message))return 'wikimedia_maxlag';
 if(/rate limited|Retry-After|HTTP 429|HTTP 503/i.test(message))return 'wikimedia_rate_limited';
 if(/timeout|AbortError/i.test(message))return 'wikimedia_timeout';
 if(/response too large/i.test(message))return 'wikimedia_response_too_large';
 if(/request budget/i.test(message))return 'local_request_budget';
 return 'other_upstream_failure';
}
export function createPersonaService({store,liveSource,cache=null,blockedQids=[]}={}){
 if(!store||typeof store.random!=='function'||typeof store.get!=='function'||
    !liveSource||typeof liveSource!=='object'||
    !Array.isArray(blockedQids)||blockedQids.some(x=>!isQid(x)))
  throw TypeError('Invalid persona service dependencies');
 const blocked=new Set(blockedQids);
 // Every upstream/cache result crosses a trust boundary. Validate identity,
 // article/identity URLs, class, exclusions and the requested QID before use.
 function eligible(result,{kind='both',qid=null,exclude_qids=[]}={}){
  const p=result?.persona;
  if(result?.status!=='ok'||!isObject(p)||!isQid(p.qid)||
     blocked.has(p.qid)||exclude_qids.includes(p.qid)||
     (qid!==null&&p.qid!==qid)||
     (kind!=='both'&&p.kind!==kind)||
     (result.agent_handoff&&result.agent_handoff.subject_qid!==p.qid))
    return false;
  try{
   validateCatalog({version:'service-validation',entries:[{
    qid:p.qid,kind:p.kind,name:p.name,
    description:p.description??'',sources:p.sources
   }]});
   return true;
  }catch{return false;}
 }
 async function cacheLive(live){
  if(!cache||typeof cache.put!=='function'||live?.status!=='ok'||!live.persona)return;
  try{await cache.put(live.persona);}
  catch{console.warn('Sites D1 cache write unavailable; live result preserved');}
 }
 async function readCache(method,args){
  if(!cache||typeof cache[method]!=='function')return null;
  try{return await cache[method](args,{blockedQids});}
  catch{console.warn('Sites D1 cache read unavailable; bundled fallback retained');return null;}
 }
 async function random(args={}){
  validateRandom(args);
  const criteria={kind:args.kind??'both',exclude_qids:args.exclude_qids??[]};
  let reason='wikidata_unavailable',failureCategory;
  try{
   const live=await liveSource.random(args,{blockedQids});
   if(live?.status==='ok'){
    if(!eligible(live,criteria))
      throw Error('Unexpected Wikidata identity');
    await cacheLive(live);
    return live;
   }
   if(live?.status!=='no_match')throw Error('Unexpected Wikidata response');
   reason='no_live_match';
  }catch(error){
   failureCategory=upstreamFailureCategory(error);
   console.warn('Wikidata random unavailable: '+failureCategory);
  }
  const cached=await readCache('random',args);
  if(eligible(cached,criteria))return {
   ...cached,source_mode:'d1_cache_fallback',fallback_reason:reason,
   ...(failureCategory?{upstream_failure_category:failureCategory}:{})
  };
  // Do not choose, validate or scan the full emergency catalog on successful
  // live requests; it is a last-resort fallback only.
  const local=store.random(args);
  if(local.status==='ok'&&!eligible(local,criteria))
   throw Error('Reviewed fallback returned an ineligible identity');
  return {
   ...local,source_mode:'catalog_fallback',fallback_reason:reason,
   ...(failureCategory?{upstream_failure_category:failureCategory}:{})
  };
 }
 async function get(args={}){
  validateGet(args);
  if(blocked.has(args.qid))return {status:'not_found',qid:args.qid,source_mode:'blocked'};
  const criteria={qid:args.qid};
  const local=()=>store.get(args);
  try{
   const live=await liveSource.get(args,{blockedQids});
   if(live?.status==='ok'){
    if(!eligible(live,criteria))
      throw Error('Unexpected Wikidata identity mismatch');
    await cacheLive(live);
    return live;
   }
   if(live?.status==='not_found')return live;
   throw Error('Unexpected Wikidata response');
  }catch(error){
   const failureCategory=upstreamFailureCategory(error);
   console.warn('Wikidata lookup unavailable: '+failureCategory);
   const cached=await readCache('get',args);
   if(eligible(cached,criteria))return {
    ...cached,source_mode:'d1_cache_fallback',fallback_reason:'wikidata_unavailable',
    upstream_failure_category:failureCategory
   };
   const fallback=local();
   if(fallback.status==='ok'&&!eligible(fallback,criteria))
    throw Error('Reviewed fallback returned an ineligible identity');
   if(fallback.status==='ok')return {
    ...fallback,source_mode:'catalog_fallback',fallback_reason:'wikidata_unavailable',
    upstream_failure_category:failureCategory
   };
   return {
    status:'upstream_unavailable',qid:args.qid,
    catalog_version:store.summary.catalog_version,source_mode:'wikidata_unavailable',
    upstream_failure_category:failureCategory,
    reason:'Cannot verify a QID against Wikidata right now'
   };
  }
 }
 async function call(name,args={}){
  if(name==='random_persona')return random(args);
  if(name==='get_persona')return get(args);
  throw Error('Unknown tool');
 }
 return Object.freeze({random,get,call});
}
