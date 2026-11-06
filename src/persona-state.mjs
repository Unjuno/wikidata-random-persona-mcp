/**
 * Explicit, deterministic conversation persona state machine.
 *
 * This is the CONSUMER contract, not a server-side chat session. The MCP Worker
 * cannot observe whether its caller read an article or adopted a character.
 * Consumers keep this state in their own conversation context, never a shared
 * edge-worker global or an anonymous server database.
 */
const QID = /^Q[1-9][0-9]{0,11}$/;
const validQid = value => typeof value === 'string' && QID.exec(value)?.[0] === value;
export const PERSONA_FLOW_VERSION = 1;
export const PHASES = Object.freeze([
  'idle', 'selecting', 'awaiting_verification', 'active', 'switching',
  'failed', 'exited'
]);
const TYPES = new Set(['CONNECT', 'SELECTED', 'SELECTION_FAILED', 'VERIFIED',
  'REJECTED', 'SWITCH', 'RETRY', 'RECONNECT', 'MESSAGE', 'EXIT']);

export function initialPersonaState() {
  return Object.freeze({
    phase: 'idle', active_qid: null, candidate_qid: null, failure: null
  });
}
function validState(state) {
  return state && typeof state === 'object' &&
    PHASES.includes(state.phase) &&
    (state.active_qid === null || validQid(state.active_qid)) &&
    (state.candidate_qid === null || validQid(state.candidate_qid)) &&
    (state.failure === null || ['selection_failed','source_unverified'].includes(state.failure));
}
function emit(phase, active_qid, candidate_qid, failure = null) {
  return Object.freeze({phase, active_qid, candidate_qid, failure});
}
function illegal(state,event) {
  throw new Error('Illegal persona transition: '+state.phase+' + '+event.type);
}
/**
 * Transition is pure. Article verification belongs to the host: only the host
 * may emit VERIFIED, after it actually retrieved and validated a source.
 */
export function transitionPersona(state, event) {
  if (!validState(state) || !event || !TYPES.has(event.type))
    throw new TypeError('Invalid persona state or event');
  const {phase, active_qid, candidate_qid} = state;
  if (event.type === 'RECONNECT') return state;
  if (event.type === 'EXIT') return emit('exited',null,null);
  switch (event.type) {
    case 'CONNECT':
      if (phase === 'idle' || phase === 'exited')
        return emit('selecting',null,null);
      // Repeated discovery/transport connections do not change an active QID.
      return state;
    case 'SELECTED':
      if (phase !== 'selecting' && phase !== 'switching') return illegal(state,event);
      if (typeof event.qid !== 'string' || !validQid(event.qid))
        throw new TypeError('SELECTED requires a valid QID');
      if (phase === 'switching' && event.qid === active_qid)
        throw new Error('A persona switch must not repeat the active QID');
      return emit('awaiting_verification',active_qid,event.qid);
    case 'SELECTION_FAILED':
      if (phase !== 'selecting' && phase !== 'switching') return illegal(state,event);
      return active_qid
        ? emit('active',active_qid,null,'selection_failed')
        : emit('failed',null,null,'selection_failed');
    case 'VERIFIED':
      if (phase !== 'awaiting_verification') return illegal(state,event);
      if (event.qid !== candidate_qid) throw new Error('Verified QID mismatch');
      return emit('active',candidate_qid,null);
    case 'REJECTED':
      if (phase !== 'awaiting_verification') return illegal(state,event);
      return active_qid
        ? emit('active',active_qid,null,'source_unverified')
        : emit('failed',null,null,'source_unverified');
    case 'SWITCH':
      if (phase !== 'active' && phase !== 'awaiting_verification') return illegal(state,event);
      return emit('switching',active_qid,null);
    case 'RETRY':
      if (phase !== 'failed') return illegal(state,event);
      return emit('selecting',null,null);
    case 'MESSAGE':
      if (phase !== 'active') return illegal(state,event);
      return state;
    default:
      return illegal(state,event);
  }
}
/** Pre-verified facts are never misrepresented as an active conversation. */
export function createAgentHandoff(qid,name) {
  if (typeof qid !== 'string' || !validQid(qid) || typeof name !== 'string' || !name.trim())
    throw new TypeError('Valid persona identity required');
  const selecting = transitionPersona(initialPersonaState(),{type:'CONNECT'});
  const pending = transitionPersona(selecting,{type:'SELECTED',qid});
  return Object.freeze({
    action:'adopt_persona',
    subject_qid:qid,
    subject_name:name,
    speaking_mode:'first_person_simulation',
    activate_after:'verify_referenced_article',
    first_response:'disclose_simulation_once_then_speak_in_character',
    persistence:'current_conversation_until_explicit_switch_or_exit',
    requires_client_execution:true,
    state_machine:{
      version:PERSONA_FLOW_VERSION,
      phase:pending.phase,
      verification_required:true,
      verified_transition:'VERIFIED',
      switch_transition:'SWITCH',
      exit_transition:'EXIT',
      reconnect_rule:'preserve_active_qid',
      owned_by:'consuming_agent'
    }
  });
}
