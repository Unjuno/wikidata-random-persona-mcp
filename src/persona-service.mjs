/** Persona application service.
 * Separates transport JSON-RPC, Wikidata selection and optional D1 storage.
 * No conversation state, external writes, secrets or arbitrary URL fetch.
 */
import {isQid} from './core.mjs';
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
  let reason='wikidata_unavailable',failureCategory;
  try{
   const live=await liveSource.random(args,{blockedQids});
   if(live?.status==='ok'){
    if(!live.persona||!isQid(live.persona.qid)||
      !['real','fictional'].includes(live.persona.kind))
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
  if(cached?.status==='ok')return {
   ...cached,source_mode:'d1_cache_fallback',fallback_reason:reason,
   ...(failureCategory?{upstream_failure_category:failureCategory}:{})
  };
  // Do not choose, validate or scan the full emergency catalog on successful
  // live requests; it is a last-resort fallback only.
  const local=store.random(args);
  return {
   ...local,source_mode:'catalog_fallback',fallback_reason:reason,
   ...(failureCategory?{upstream_failure_category:failureCategory}:{})
  };
 }
 async function get(args={}){
  validateGet(args);
  const local=()=>store.get(args);
  try{
   const live=await liveSource.get(args,{blockedQids});
   if(live?.status==='ok'){
    if(!live.persona||live.persona.qid!==args.qid)
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
   if(cached?.status==='ok'&&cached.persona?.qid===args.qid)return {
    ...cached,source_mode:'d1_cache_fallback',fallback_reason:'wikidata_unavailable',
    upstream_failure_category:failureCategory
   };
   const fallback=local();
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
