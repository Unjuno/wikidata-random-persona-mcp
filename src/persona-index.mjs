/** Reviewed QID-only reservoir from a complete Wikidata JSON dump.
 * Pure, runtime-neutral code. Article text, images and model calls are excluded.
 */
import {isQid,secureRandomIndex} from './core.mjs';
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const assert=(value,message)=>{if(!value)throw Error(message);};
const MAX_POOL=250000;
const MAX_POPULATION=4294967295;

export function validatePersonaIndex(index){
 assert(isRecord(index),'Invalid persona index');
 assert(typeof index.version==='string'&&index.version.length>0&&index.version.length<=120,'Invalid index version');
 assert(index.source==='Wikidata JSON dump','Unapproved persona index source');
 assert(index.complete_scan===true,'Persona index requires a complete Wikidata dump scan');
 assert(isRecord(index.population)&&isRecord(index.qids),'Invalid persona index population/pools');
 const seen=new Set();
 let total=0;
 for(const kind of ['real','fictional']){
  const population=index.population[kind];
  const entries=index.qids[kind];
  assert(Number.isSafeInteger(population)&&population>=1&&population<=MAX_POPULATION,'Invalid index population '+kind);
  assert(Array.isArray(entries)&&entries.length>0&&entries.length<=MAX_POOL,'Invalid index pool '+kind);
  assert(population>=entries.length,'Population smaller than sample '+kind);
  total+=population;
  for(const qid of entries){
   assert(isQid(qid),'Invalid QID in index');
   assert(!seen.has(qid),'Duplicate QID in persona index');
   seen.add(qid);
  }
 }
 assert(total<=MAX_POPULATION,'Index population exceeds secure random range');
 return index;
}
function chooseApproved(index,{kind='both',exclude_qids=[]}={},chooseIndex=secureRandomIndex,blocked=new Set()){
 assert(['real','fictional','both'].includes(kind),'Invalid index kind');
 assert(Array.isArray(exclude_qids)&&exclude_qids.length<=20&&exclude_qids.every(isQid),'Invalid excluded QID list');
 assert(blocked instanceof Set&&[...blocked].every(isQid),'Invalid blocked QID set');
 const excluded=new Set([...exclude_qids,...blocked]);
 const real=kind==='fictional'?[]:index.qids.real;
 const fictional=kind==='real'?[]:index.qids.fictional;
 const isAvailable=pool=>pool.length>0&&(excluded.size<pool.length||pool.some(qid=>!excluded.has(qid)));
 const effectiveReal=isAvailable(real)?index.population.real:0;
 const effectiveFictional=isAvailable(fictional)?index.population.fictional:0;
 if(!effectiveReal&&!effectiveFictional)return null;
 const draw=size=>{
  const n=chooseIndex(size);
  assert(Number.isSafeInteger(n)&&n>=0&&n<size,'Invalid random index');
  return n;
 };
 const selectedKind=kind==='both'?
  (draw(effectiveReal+effectiveFictional)<effectiveReal?'real':'fictional'):kind;
 const pool=selectedKind==='real'?real:fictional;
 if(!pool.length)return null;
 // Rejection sampling is uniform over permitted QIDs; normally O(1).
 // If most of a tiny pool is excluded, switch to an exact filtered draw.
 for(let attempt=0;attempt<32;attempt++){
  const qid=pool[draw(pool.length)];
  if(!excluded.has(qid))return {kind:selectedKind,qid};
 }
 const candidates=pool.filter(qid=>!excluded.has(qid));
 if(!candidates.length)return null;
 return {kind:selectedKind,qid:candidates[draw(candidates.length)]};
}
export function chooseIndexedQid(index,params={},chooseIndex=secureRandomIndex,blocked=new Set()){
 return chooseApproved(validatePersonaIndex(index),params,chooseIndex,blocked);
}
/** Validate and copy once at startup, avoiding full-pool rescans on every Site call. */
export function createIndexSelector(index){
 const valid=validatePersonaIndex(index);
 const approved=Object.freeze({
  version:valid.version,source:valid.source,complete_scan:true,
  population:Object.freeze({...valid.population}),
  qids:Object.freeze({
   real:Object.freeze([...valid.qids.real]),
   fictional:Object.freeze([...valid.qids.fictional])
  })
 });
 return Object.freeze({
  index:approved,
  choose:(params={},chooseIndex=secureRandomIndex,blocked=new Set())=>
   chooseApproved(approved,params,chooseIndex,blocked)
 });
}
