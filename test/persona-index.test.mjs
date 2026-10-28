import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePersonaIndex,chooseIndexedQid} from '../src/persona-index.mjs';

const index={
 version:'dump-2026-10-28',
 source:'Wikidata JSON dump',
 complete_scan:true,
 population:{real:50,fictional:150},
 qids:{real:['Q101','Q102','Q103'],fictional:['Q201','Q202','Q203']}
};
test('accepts a complete dump-derived QID-only reservoir, not a six/300-person cap',()=>{
 const approved=validatePersonaIndex(structuredClone(index));
 assert.equal(approved.qids.real.length+approved.qids.fictional.length,6);
 assert.equal(approved.population.real+approved.population.fictional,200);
 assert.equal(JSON.stringify(approved).includes('sources'),false);
});
test('both draws categories in proportion to eligible Wikidata population, not reservoir sizes',()=>{
 const real=chooseIndexedQid(index,{kind:'both'},size=>0);
 assert.equal(real.kind,'real');
 const calls=[50,2];
 const fictional=chooseIndexedQid(index,{kind:'both'},size=>calls.shift());
 assert.equal(fictional.kind,'fictional');
 assert.equal(fictional.qid,'Q203');
});
test('direct category draw excludes recent and suspended QIDs',()=>{
 const chosen=chooseIndexedQid(index,{kind:'real',exclude_qids:['Q101']},size=>0,new Set(['Q102']));
 assert.deepEqual(chosen,{kind:'real',qid:'Q103'});
 const none=chooseIndexedQid(index,{kind:'real',exclude_qids:['Q101','Q102','Q103']},size=>0);
 assert.equal(none,null);
});
test('rejects incomplete, malformed, duplicate and unapproved index snapshots',()=>{
 for(const edit of [
  value=>{value.complete_scan=false;},
  value=>{value.source='User-entered';},
  value=>{value.qids.real.push('Q201');},
  value=>{value.qids.fictional[0]='Q0';},
  value=>{value.population.real=2;},
  value=>{value.population.fictional=Number.MAX_SAFE_INTEGER;},
  value=>{value.qids.real=[];}
 ]){
  const value=structuredClone(index); edit(value);
  assert.throws(()=>validatePersonaIndex(value));
 }
});
test('rejects invalid random selectors without assuming all QIDs are cached',()=>{
 assert.throws(()=>chooseIndexedQid(index,{kind:'all'},()=>0),/kind/i);
 assert.throws(()=>chooseIndexedQid(index,{kind:'real',exclude_qids:['Q0']},()=>0),/QID/i);
 assert.throws(()=>chooseIndexedQid(index,{kind:'real'},()=>3),/random/i);
});
