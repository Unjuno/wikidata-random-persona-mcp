/** Immutable reviewed snapshot; suspension list is independent of catalog versions. */
import {validateCatalog,isQid,randomPersona,getPersona} from './core.mjs';
export function createCatalogStore(catalog, blockedQids=[]) {
  validateCatalog(catalog);
  if(!Array.isArray(blockedQids)||!blockedQids.every(isQid)) throw Error('Invalid block list');
  const blocked=new Set(blockedQids);
  const full=structuredClone(catalog);
  const active={...full,entries:full.entries.filter(e=>!blocked.has(e.qid))};
  const summary=Object.freeze({catalog_version:full.version,entries:active.entries.length,blocked:full.entries.length-active.entries.length});
  return Object.freeze({summary,
    random(params={},chooseIndex){
      // Use the full snapshot only to validate arguments when no rows remain.
      if(!active.entries.length){randomPersona(full,params,()=>0);return {status:'no_match',catalog_version:full.version,reason:'no eligible persona'};}
      return randomPersona(active,params,chooseIndex);
    },
    get(params={}){
      if(!active.entries.length){getPersona(full,params);return {status:'not_found',catalog_version:full.version,qid:params.qid};}
      return getPersona(active,params);
    }
  });
}
