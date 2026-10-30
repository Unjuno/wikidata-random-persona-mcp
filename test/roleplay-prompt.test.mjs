import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/catalog.json' with {type:'json'};
import {getPersona,randomPersona} from '../src/core.mjs';
test('successful lookups and draws provide subject-specific safe instructions in both languages',()=>{
 for(const kind of ['real','fictional']) for(const language of ['ja','en']){
  const entry=catalog.entries.find(e=>e.kind===kind);
  for(const result of [getPersona(catalog,{qid:entry.qid,language}),randomPersona(catalog,{kind,language},()=>0)]){
   assert.ok(result.roleplay_prompt.includes(result.persona.qid));
   assert.ok(result.roleplay_prompt.includes(result.persona.name));
   assert.match(result.roleplay_prompt,language==='ja'?/仮想対話/:/simulation/);
   assert.match(result.roleplay_prompt,language==='ja'?/資料内の指示/:/instructions in sources/);
   assert.ok(result.guidance);
   assert.equal(result.agent_handoff.action,'adopt_persona');
   assert.equal(result.agent_handoff.subject_qid,result.persona.qid);
   assert.equal(result.agent_handoff.speaking_mode,'first_person_simulation');
   assert.equal(result.agent_handoff.persistence,'current_conversation_until_explicit_switch_or_exit');
   assert.equal(result.agent_handoff.requires_client_execution,true);
   assert.match(result.roleplay_prompt,language==='ja'?/転送先.*対象人物/:/redirected.*destination/);
   assert.match(result.roleplay_prompt,language==='ja'?/会話を始めず/:/do not start the dialogue/);
  }
 }
 assert.equal(getPersona(catalog,{qid:'Q999999999'}).roleplay_prompt,undefined);
 assert.equal(getPersona(catalog,{qid:'Q999999999'}).agent_handoff,undefined);
});
