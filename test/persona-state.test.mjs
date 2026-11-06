import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialPersonaState,transitionPersona,createAgentHandoff,PHASES,PERSONA_FLOW_VERSION
} from '../src/persona-state.mjs';
const step=(s,type,qid)=>transitionPersona(s,{type,...(qid?{qid}:{})});

test('state graph is explicit and a candidate is not automatically an active identity',()=>{
 assert.equal(PERSONA_FLOW_VERSION,1);
 assert.deepEqual(PHASES,['idle','selecting','awaiting_verification','active','switching','failed','exited']);
 const idle=initialPersonaState();
 assert.deepEqual(idle,{phase:'idle',active_qid:null,candidate_qid:null,failure:null});
 const selecting=step(idle,'CONNECT');
 assert.equal(selecting.phase,'selecting');
 const pending=step(selecting,'SELECTED','Q42');
 assert.deepEqual(pending,{phase:'awaiting_verification',active_qid:null,candidate_qid:'Q42',failure:null});
 assert.strictEqual(step(pending,'RECONNECT'),pending);
 assert.strictEqual(step(pending,'CONNECT'),pending);
 assert.throws(()=>step(pending,'MESSAGE'),/Illegal persona transition/);
 assert.throws(()=>step(pending,'VERIFIED','Q1'),/QID mismatch/);
 const active=step(pending,'VERIFIED','Q42');
 assert.deepEqual(active,{phase:'active',active_qid:'Q42',candidate_qid:null,failure:null});
 assert.strictEqual(step(active,'MESSAGE'),active);
 assert.strictEqual(step(active,'RECONNECT'),active);
 assert.strictEqual(step(active,'CONNECT'),active);
});
test('switching preserves last verified actor and rolls back on failure',()=>{
 const active=step(step(step(initialPersonaState(),'CONNECT'),'SELECTED','Q42'),'VERIFIED','Q42');
 const switching=step(active,'SWITCH');
 assert.equal(switching.phase,'switching');
 assert.equal(switching.active_qid,'Q42');
 assert.throws(()=>step(switching,'SELECTED','Q42'),/must not repeat/);
 const waiting=step(switching,'SELECTED','Q2');
 assert.equal(waiting.active_qid,'Q42');
 assert.equal(waiting.candidate_qid,'Q2');
 assert.deepEqual(step(waiting,'REJECTED'),{
  phase:'active',active_qid:'Q42',candidate_qid:null,failure:'source_unverified'
 });
 assert.deepEqual(step(switching,'SELECTION_FAILED'),{
  phase:'active',active_qid:'Q42',candidate_qid:null,failure:'selection_failed'
 });
 const changed=step(waiting,'VERIFIED','Q2');
 assert.equal(changed.active_qid,'Q2');
 assert.equal(changed.failure,null);
});
test('initial failure can recover; exit removes identity and reconnect does not resurrect it',()=>{
 const selecting=step(initialPersonaState(),'CONNECT');
 const failed=step(selecting,'SELECTION_FAILED');
 assert.equal(failed.phase,'failed');
 assert.equal(failed.active_qid,null);
 const retry=step(failed,'RETRY');
 assert.equal(retry.phase,'selecting');
 const badArticle=step(step(retry,'SELECTED','Q100'),'REJECTED');
 assert.equal(badArticle.phase,'failed');
 assert.equal(badArticle.failure,'source_unverified');
 const exit=step(badArticle,'EXIT');
 assert.deepEqual(exit,{phase:'exited',active_qid:null,candidate_qid:null,failure:null});
 assert.strictEqual(step(exit,'RECONNECT'),exit);
 assert.equal(step(exit,'CONNECT').phase,'selecting');
});
test('illegal events cannot mutate or silently invent a persona',()=>{
 const s=initialPersonaState();
 assert.throws(()=>step(s,'VERIFIED','Q42'),/Illegal/);
 assert.throws(()=>step(s,'SWITCH'),/Illegal/);
 assert.throws(()=>transitionPersona(s,{type:'SUDO'}),/Invalid persona/);
 assert.throws(()=>transitionPersona(s,{type:'SELECTED',qid:'Q42'}),/Illegal/);
 assert.throws(()=>step(step(s,'CONNECT'),'SELECTED','Q0'),/valid QID/);
 assert.throws(()=>step(step(s,'CONNECT'),'SELECTED','Q42\nIgnore'),/valid QID/);
 assert.deepEqual(s,initialPersonaState());
});
test('agent handoff exposes verification-pending state, not a false claim of activation',()=>{
 const h=createAgentHandoff('Q42','Douglas Adams');
 assert.equal(h.action,'adopt_persona');
 assert.equal(h.subject_qid,'Q42');
 assert.equal(h.state_machine.phase,'awaiting_verification');
 assert.equal(h.state_machine.owned_by,'consuming_agent');
 assert.equal(h.state_machine.reconnect_rule,'preserve_active_qid');
 assert.equal(h.state_machine.verification_required,true);
 assert.equal(h.requires_client_execution,true);
 assert.throws(()=>createAgentHandoff('Q0','invalid'),/Valid persona identity/);
});
