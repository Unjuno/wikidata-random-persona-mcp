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
export function chooseIndexedQid(index,{kind='both',exclude_qids=[]}={},chooseIndex=secureRandomIndex,blocked=new Set()){
 validatePersonaIndex(index);
 assert(['real','fictional','both'].includes(kind),'Invalid index kind');
 assert(Array.isArray(exclude_qids)&&exclude_qids.length<=20&&exclude_qids.every(isQid),'Invalid excluded QID list');
 assert(blocked instanceof Set&&[...blocked].every(isQid),'Invalid blocked QID set');
 const excluded=new Set([...exclude_qids,...blocked]);
 const candidates={
  real:kind==='fictional'?[]:index.qids.real.filter(qid=>!excluded.has(qid)),
  fictional:kind==='real'?[]:index.qids.fictional.filter(qid=>!excluded.has(qid))
 };
 if(!candidates.real.length&&!candidates.fictional.length)return null;
 const effectiveReal=candidates.real.length?index.population.real:0;
 const effectiveFictional=candidates.fictional.length?index.population.fictional:0;
 const sample=(size)=>{
  const n=chooseIndex(size);
  assert(Number.isSafeInteger(n)&&n>=0&&n<size,'Invalid random index');
  return n;
 };
 const selectedKind=kind==='both'
  ? sample(effectiveReal+effectiveFictional)<effectiveReal?'real':'fictional'
  : kind;
 const pool=candidates[selectedKind];
 if(!pool.length)return null;
 return {kind:selectedKind,qid:pool[sample(pool.length)]};
}
